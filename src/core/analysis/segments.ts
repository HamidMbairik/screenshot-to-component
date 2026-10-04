import type { Rect } from "../types";
import { colorDistance } from "./color";

/**
 * Minimal shape of the canvas ImageData we need. Declared structurally so the
 * analysis tests can run in plain Node with a plain object.
 */
export type Bitmap = {
  data: Uint8ClampedArray;
  width: number;
  height: number;
};

export type Mask = Uint8Array;

export type Span = { start: number; end: number };

export function pixelAt(bitmap: Bitmap, x: number, y: number): number {
  return (y * bitmap.width + x) * 4;
}

/**
 * Marks opaque pixels that differ from the page background. Everything downstream
 * treats background pixels as empty space, which is what makes padding, margins
 * and section gaps fall out for free.
 */
export function contentMask(
  bitmap: Bitmap,
  background: [number, number, number],
  tolerance = 12,
): Mask {
  const mask = new Uint8Array(bitmap.width * bitmap.height);
  for (let y = 0; y < bitmap.height; y++) {
    for (let x = 0; x < bitmap.width; x++) {
      const i = pixelAt(bitmap, x, y);
      if (bitmap.data[i + 3] < 8) continue;
      const distance = colorDistance(
        [bitmap.data[i], bitmap.data[i + 1], bitmap.data[i + 2]],
        background,
      );
      mask[y * bitmap.width + x] = distance > tolerance ? 1 : 0;
    }
  }
  return mask;
}

/**
 * Fraction of content pixels in a single scanline of a rect. Densities are always
 * measured relative to the rect being cut: measuring page-wide and treating the
 * result as rect-relative collapses any layout with a full-height sidebar,
 * because the sidebar fills every row and no row is ever blank.
 */
export function rowDensity(mask: Mask, width: number, y: number, x = 0, span = width): number {
  let hits = 0;
  for (let i = x; i < x + span; i++) {
    if (mask[y * width + i]) hits++;
  }
  return hits / span;
}

export function columnDensity(mask: Mask, width: number, x: number, y: number, span: number): number {
  let hits = 0;
  for (let i = y; i < y + span; i++) {
    if (mask[i * width + x]) hits++;
  }
  return hits / span;
}

/**
 * Groups runs of filled scanlines, dropping runs shorter than `minRun` and then
 * merging any two runs separated by less than `minGap`. This is what separates
 * real sections from the padding inside them.
 */
export function groupRuns(
  densities: number[],
  threshold: number,
  minRun: number,
  minGap: number,
): Span[] {
  const raw: Span[] = [];
  let start = -1;
  for (let i = 0; i < densities.length; i++) {
    const filled = densities[i] >= threshold;
    if (filled && start === -1) start = i;
    if (!filled && start !== -1) {
      raw.push({ start, end: i });
      start = -1;
    }
  }
  if (start !== -1) raw.push({ start, end: densities.length });

  const merged: Span[] = [];
  for (const run of raw.filter((r) => r.end - r.start >= minRun)) {
    const previous = merged[merged.length - 1];
    if (previous && run.start - previous.end < minGap) {
      previous.end = run.end;
    } else {
      merged.push({ ...run });
    }
  }
  return merged;
}

/** Greyscale brightness of a pixel, 0 to 255. */
export function brightness(bitmap: Bitmap, x: number, y: number): number {
  const i = pixelAt(bitmap, x, y);
  return (bitmap.data[i] * 299 + bitmap.data[i + 1] * 587 + bitmap.data[i + 2] * 114) / 1000;
}

/** Row indices inside a rect that contain at least `ratio` ink pixels. */
export function inkRows(
  bitmap: Bitmap,
  rect: Rect,
  ink: (brightness: number) => boolean,
  ratio = 0.02,
): number[] {
  const rows: number[] = [];
  for (let y = rect.y; y < rect.y + rect.height; y++) {
    let hits = 0;
    for (let x = rect.x; x < rect.x + rect.width; x++) {
      if (ink(brightness(bitmap, x, y))) hits++;
    }
    if (hits / rect.width >= ratio) rows.push(y);
  }
  return rows;
}

/** Fraction of pixels in a rect that read as ink. Text covers a small minority. */
export function inkFraction(bitmap: Bitmap, rect: Rect, ink: (brightness: number) => boolean): number {
  let hits = 0;
  for (let y = rect.y; y < rect.y + rect.height; y++) {
    for (let x = rect.x; x < rect.x + rect.width; x++) {
      if (ink(brightness(bitmap, x, y))) hits++;
    }
  }
  return hits / (rect.width * rect.height);
}

/**
 * Splits a rect wherever a blank column run separates two filled ones. Classic
 * XY-cut, and enough to find columns without any knowledge of the DOM.
 */
export function cutColumns(mask: Mask, bitmapWidth: number, rect: Rect, minGap: number): Rect[] {
  const densities: number[] = [];
  for (let x = rect.x; x < rect.x + rect.width; x++) {
    densities.push(columnDensity(mask, bitmapWidth, x, rect.y, rect.height));
  }

  const spans = groupRuns(densities, 0.02, 4, minGap);
  if (spans.length < 2) return [rect];

  return spans.map((span) => ({
    x: rect.x + span.start,
    y: rect.y,
    width: span.end - span.start,
    height: rect.height,
  }));
}

/** Splits a rect into horizontal bands the same way `cutColumns` splits columns. */
export function cutRows(mask: Mask, bitmapWidth: number, rect: Rect, minGap: number): Span[] {
  const densities: number[] = [];
  for (let y = rect.y; y < rect.y + rect.height; y++) {
    densities.push(rowDensity(mask, bitmapWidth, y, rect.x, rect.width));
  }
  return groupRuns(densities, 0.02, 4, minGap);
}