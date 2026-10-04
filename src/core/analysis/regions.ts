import type { Rect, TextMetrics, UIRegion } from "../types";
import {
  adjustForContrast,
  contrastRatio,
  medianColor,
  offsetFromCenter,
  rgbToHex,
} from "./color";
import {
  brightness,
  cutColumns,
  cutRows,
  inkFraction,
  inkRows,
  pixelAt,
  type Bitmap,
  type Mask,
  type Span,
} from "./segments";

export type ClassifyOptions = {
  pageBackground: [number, number, number];
};

const MIN_TEXT_HEIGHT = 8;
const MIN_BUTTON_HEIGHT = 24;
const MIN_BUTTON_WIDTH = 48;
const MAX_BUTTON_HEIGHT = 72;
const MAX_BUTTON_WIDTH = 400;

/** A button's label never fills more than this much of its width. */
const MAX_BUTTON_LABEL_WIDTH = 0.7;
const DIVIDER_HEIGHT = 3;

/** Ink covers a minority of a text block but never all of it. */
const MIN_INK = 0.02;
const MAX_INK = 0.55;

/**
 * A button label sits inside a uniform fill, so a region that is mostly one
 * colour with a text-shaped hole in the middle is a button rather than a
 * paragraph. Checked before text because a large label crosses the text
 * thresholds on its own.
 */
const BUTTON_FILL_UNIFORMITY = 0.6;

/** How many distinct quantised colours a photo has before we call it imagery. */
const IMAGE_COLOUR_COUNT = 40;

/**
 * Text is one colour plus antialiasing. A photo has many, so a high count among
 * the ink pixels is the signal that separates a heading from a photograph.
 */
const INK_COLOUR_COUNT = 8;

/** Collects every RGBA quad inside a rect, for median/percentile sampling. */
export function samplePixels(bitmap: Bitmap, rect: Rect): number[] {
  const out: number[] = [];
  for (let y = rect.y; y < rect.y + rect.height; y++) {
    for (let x = rect.x; x < rect.x + rect.width; x++) {
      const i = pixelAt(bitmap, x, y);
      out.push(bitmap.data[i], bitmap.data[i + 1], bitmap.data[i + 2], bitmap.data[i + 3]);
    }
  }
  return out;
}

/**
 * Ink is whatever differs from the region's own dominant colour. Deciding the
 * side by comparing against the page background instead would make every filled
 * button read as ink, and a label on it invisible.
 */
function inkPredicate(fill: [number, number, number]): (value: number) => boolean {
  const fillBrightness = (fill[0] * 299 + fill[1] * 587 + fill[2] * 114) / 1000;
  return (value) => Math.abs(value - fillBrightness) > 45;
}

/**
 * Splits a region into text lines. A line's height is its ink extent, which is
 * the cap height for Latin text and a close enough proxy at this fidelity.
 */
function textLines(rows: number[], rect: Rect): Span[] {
  if (rows.length === 0) return [];
  const lines: Span[] = [];
  let start = rows[0];
  let previous = rows[0];

  for (const y of rows.slice(1)) {
    if (y - previous > 2) {
      lines.push({ start, end: previous + 1 });
      start = y;
    }
    previous = y;
  }
  lines.push({ start, end: previous + 1 });

  return lines
    .map((line) => ({ start: line.start - rect.y, end: line.end - rect.y }))
    .filter((line) => line.end - line.start >= MIN_TEXT_HEIGHT);
}

/**
 * Distance between consecutive baselines, which is the leading gap plus the
 * height of the line above it. Returning the raw ink gap instead would make the
 * ratio against the measured size too small and every block would come out
 * `leading-none`. Each line contributes its own height, so a heading mixed into
 * a paragraph does not inflate the paragraph's leading.
 */
function medianBaselineGap(lines: Span[]): number | undefined {
  if (lines.length < 2) return undefined;
  const gaps = lines
    .slice(1)
    .map((line, i) => line.start - lines[i].end + (lines[i].end - lines[i].start))
    .sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)];
}

/**
 * Median length of contiguous mid-tone runs across the text block. Regular type
 * has thin strokes and bold type wide ones, and the ratio against the measured
 * size separates the weights well enough to pick from four options.
 */
function strokeWidth(bitmap: Bitmap, rect: Rect, baseline: number, isInk: (v: number) => boolean): number {
  const lengths: number[] = [];
  const lastRow = Math.min(baseline + 6, rect.y + rect.height, bitmap.height);
  for (let y = baseline; y < lastRow; y++) {
    let run = 0;
    for (let x = rect.x; x < rect.x + rect.width; x++) {
      if (isInk(brightness(bitmap, x, y))) {
        run++;
      } else if (run > 0) {
        lengths.push(run);
        run = 0;
      }
    }
    if (run > 0) lengths.push(run);
  }
  if (lengths.length === 0) return 0;
  lengths.sort((a, b) => a - b);
  return lengths[Math.floor(lengths.length / 2)];
}

function pickWeight(fontSize: number, stroke: number): TextMetrics["fontWeight"] {
  const ratio = stroke / Math.max(fontSize, 1);
  if (fontSize < 14) {
    if (ratio > 0.11) return 700;
    if (ratio > 0.07) return 600;
    return 400;
  }
  if (ratio > 0.24) return 700;
  if (ratio > 0.18) return 600;
  if (ratio > 0.08) return 500;
  return 400;
}

/**
 * Advance-width regularity. Proportional faces vary glyph width by a lot;
 * a monospace face holds it almost constant across a long run.
 */
function looksMonospace(
  bitmap: Bitmap,
  rect: Rect,
  baseline: number,
  isInk: (v: number) => boolean,
): boolean {
  const widths: number[] = [];
  let run = 0;
  for (let x = rect.x; x < rect.x + rect.width; x++) {
    if (isInk(brightness(bitmap, x, baseline))) {
      run++;
    } else if (run > 0) {
      widths.push(run);
      run = 0;
    }
  }
  if (widths.length < 8) return false;
  const mean = widths.reduce((a, b) => a + b, 0) / widths.length;
  const variance = widths.reduce((sum, w) => sum + (w - mean) ** 2, 0) / widths.length;
  return Math.sqrt(variance) / mean < 0.15;
}

/**
 * Only the pixels that read as ink, so colour counts and medians ignore the fill.
 * A percentile over every pixel returns the background as soon as ink covers less
 * than that fraction, which is true of most paragraphs, and text vanishes.
 */
function inkPixels(samples: number[], isInk: (value: number) => boolean): number[] {
  const ink: number[] = [];
  for (let i = 0; i < samples.length; i += 4) {
    const value = (samples[i] * 299 + samples[i + 1] * 587 + samples[i + 2] * 114) / 1000;
    if (isInk(value)) ink.push(samples[i], samples[i + 1], samples[i + 2], samples[i + 3]);
  }
  return ink;
}

function inkColor(samples: number[], isInk: (value: number) => boolean): [number, number, number] {
  return medianColor(inkPixels(samples, isInk));
}

function measureText(
  bitmap: Bitmap,
  rect: Rect,
  samples: number[],
  isInk: (value: number) => boolean,
  pageBackground: [number, number, number],
): TextMetrics {
  const lines = textLines(inkRows(bitmap, rect, isInk), rect);
  const capHeight = lines.reduce((max, line) => Math.max(max, line.end - line.start), 0);
  const fontSize = Math.max(Math.round(capHeight / 0.72), 9);

  const baseline = Math.min(rect.y + (lines[0]?.start ?? 0), rect.y + rect.height - 1, bitmap.height - 1);
  const stroke = strokeWidth(bitmap, rect, baseline, isInk);
  const measured = inkColor(samples, isInk);

  const readable =
    contrastRatio(measured, pageBackground) < 4.5
      ? adjustForContrast(measured, pageBackground, 4.5)
      : measured;

  const offset = offsetFromCenter(rect, {
    x: 0,
    y: rect.y,
    width: bitmap.width,
    height: rect.height,
  });

  return {
    fontSize,
    lineHeight: medianBaselineGap(lines),
    fontWeight: pickWeight(fontSize, stroke),
    color: rgbToHex(...readable),
    align: Math.abs(offset) < 0.02 ? "center" : offset > 0.04 ? "right" : "left",
    monospace: looksMonospace(bitmap, rect, baseline, isInk),
  };
}

/** Fraction of a region's pixels that match its own median colour. */
function fillUniformity(samples: number[], fill: [number, number, number]): number {
  let matches = 0;
  let counted = 0;
  for (let i = 0; i < samples.length; i += 4) {
    counted++;
    if (
      Math.abs(samples[i] - fill[0]) +
        Math.abs(samples[i + 1] - fill[1]) +
        Math.abs(samples[i + 2] - fill[2]) <
      24
    ) {
      matches++;
    }
  }
  return counted === 0 ? 0 : matches / counted;
}

/** Distinct colours after quantising to 4 bits per channel. */
function distinctColours(samples: number[], limit: number): number {
  const buckets = new Set<number>();
  for (let i = 0; i < samples.length; i += 4) {
    buckets.add(((samples[i] >> 4) << 8) | ((samples[i + 1] >> 4) << 4) | (samples[i + 2] >> 4));
    if (buckets.size >= limit) return buckets.size;
  }
  return buckets.size;
}

/**
 * A button is a solid fill, big enough to be interactive, holding a short label
 * centred in it. The width ceiling is what separates it from a card or a dark
 * section, which has the same uniform fill but a much wider line of text.
 */
function isButton(
  bitmap: Bitmap,
  rect: Rect,
  samples: number[],
  isInk: (value: number) => boolean,
): boolean {
  if (rect.height < MIN_BUTTON_HEIGHT || rect.width < MIN_BUTTON_WIDTH) return false;
  if (rect.height > MAX_BUTTON_HEIGHT || rect.width > MAX_BUTTON_WIDTH) return false;

  const fill = medianColor(samples);
  if (fillUniformity(samples, fill) < BUTTON_FILL_UNIFORMITY) return false;

  const label = inkBounds(bitmap, rect, isInk);
  if (!label) return false;
  if (label.width > rect.width * MAX_BUTTON_LABEL_WIDTH) return false;

  const labelCentre = label.x + label.width / 2;
  const rectCentre = rect.x + rect.width / 2;
  return Math.abs(labelCentre - rectCentre) < rect.width * 0.08;
}

/** Tightest box around the ink in a region, or null when there is no ink. */
function inkBounds(
  bitmap: Bitmap,
  rect: Rect,
  isInk: (value: number) => boolean,
): Rect | null {
  let left = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;

  for (let y = rect.y; y < rect.y + rect.height; y++) {
    for (let x = rect.x; x < rect.x + rect.width; x++) {
      if (!isInk(brightness(bitmap, x, y))) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
    }
  }

  if (left === Number.POSITIVE_INFINITY) return null;
  return { x: left, y: rect.y, width: right - left + 1, height: rect.height };
}

/** A photograph has many distinct colours. Antialiased type does not. */
function isImage(samples: number[]): boolean {
  return distinctColours(samples, IMAGE_COLOUR_COUNT) >= IMAGE_COLOUR_COUNT;
}

export function classifyRegion(
  bitmap: Bitmap,
  rect: Rect,
  options: ClassifyOptions,
): UIRegion {
  const samples = samplePixels(bitmap, rect);
  const fill = medianColor(samples);

  if (rect.height <= DIVIDER_HEIGHT && rect.width > 40) {
    return { kind: "divider", bounds: rect, color: rgbToHex(...fill) };
  }

  const isInk = inkPredicate(fill);

  if (isButton(bitmap, rect, samples, isInk)) {
    return { kind: "button", bounds: rect, color: rgbToHex(...fill) };
  }

  const fraction = inkFraction(bitmap, rect, isInk);
  if (fraction >= MIN_INK && fraction <= MAX_INK && rect.height >= MIN_TEXT_HEIGHT) {
    const lines = textLines(inkRows(bitmap, rect, isInk), rect);
    if (lines.length > 0 && distinctColours(inkPixels(samples, isInk), INK_COLOUR_COUNT) < INK_COLOUR_COUNT) {
      return {
        kind: "text",
        bounds: rect,
        color: rgbToHex(...fill),
        text: measureText(bitmap, rect, samples, isInk, options.pageBackground),
      };
    }
  }

  if (isImage(samples)) {
    return { kind: "image", bounds: rect, color: rgbToHex(...fill) };
  }

  return { kind: "block", bounds: rect, color: rgbToHex(...fill) };
}

/**
 * Cuts a section into leaf regions: columns first, then rows inside each column,
 * then classification. Depth is bounded because dense pages produce a lot of
 * fragments and a coarse honest tree beats a deep one built on measurement noise.
 *
 * Split thresholds are based on the content extent actually found inside the
 * section, not on the section's full-bleed width, so an ordinary 32px card
 * gutter is still recognised as a gutter.
 */
export function extractRegions(
  bitmap: Bitmap,
  mask: Mask,
  section: Rect,
  options: ClassifyOptions,
  depth = 0,
): UIRegion[] {
  if (depth > 3) {
    return [classifyRegion(bitmap, section, options)];
  }

  const columnGap = Math.max(20, Math.round(section.width * 0.02));
  const columns = cutColumns(mask, bitmap.width, section, columnGap);

  const regions: UIRegion[] = [];
  for (const column of columns) {
    const rowGap = Math.max(12, Math.round(column.height * 0.02));
    const rows = cutRows(mask, bitmap.width, column, rowGap);

    if (rows.length < 2) {
      regions.push(...extractRegions(bitmap, mask, column, options, depth + 1));
      continue;
    }

    for (const row of rows) {
      const rect: Rect = {
        x: column.x,
        y: column.y + row.start,
        width: column.width,
        height: row.end - row.start,
      };
      regions.push(...extractRegions(bitmap, mask, rect, options, depth + 1));
    }
  }

  return regions;
}

/**
 * Median colour of the four edges. Sampling only the top strip makes a dark
 * header or hero band become "the background", which inverts the whole mask.
 *
 * Fully transparent pixels are skipped. A screenshot with a transparent border
 * decodes to rgba(0, 0, 0, 0), which would otherwise become a black page.
 */
export function pageBackground(bitmap: Bitmap): [number, number, number] {
  const ring = Math.max(1, Math.round(Math.min(bitmap.width, bitmap.height) * 0.01));
  const samples: number[] = [];

  const sample = (x: number, y: number) => {
    const i = pixelAt(bitmap, x, y);
    if (bitmap.data[i + 3] < 8) return;
    samples.push(bitmap.data[i], bitmap.data[i + 1], bitmap.data[i + 2], bitmap.data[i + 3]);
  };

  for (let x = 0; x < bitmap.width; x++) {
    for (let y = 0; y < ring; y++) sample(x, y);
    for (let y = bitmap.height - ring; y < bitmap.height; y++) sample(x, y);
  }

  for (let y = 0; y < bitmap.height; y++) {
    for (let x = 0; x < ring; x++) {
      sample(x, y);
      sample(bitmap.width - 1 - x, y);
    }
  }

  // Nothing opaque to go on, which happens for a fully transparent image.
  return samples.length < 3 ? [255, 255, 255] : medianColor(samples);
}

export function extractPalette(bitmap: Bitmap, background: [number, number, number]): string[] {
  const counts = new Map<string, number>();
  const step = Math.max(1, Math.round(bitmap.width / 160));
  for (let y = 0; y < bitmap.height; y += step) {
    for (let x = 0; x < bitmap.width; x += step) {
      const i = pixelAt(bitmap, x, y);
      const rgb: [number, number, number] = [
        bitmap.data[i],
        bitmap.data[i + 1],
        bitmap.data[i + 2],
      ];
      if (contrastRatio(rgb, background) < 1.05) continue;
      const hex = rgbToHex(...rgb);
      counts.set(hex, (counts.get(hex) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([hex]) => hex);
}

