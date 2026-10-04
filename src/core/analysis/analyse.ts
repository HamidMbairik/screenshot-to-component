import type { Rect, UIScreen, UISection } from "../types";
import { offsetFromCenter, rgbToHex } from "./color";
import { extractPalette, extractRegions, pageBackground } from "./regions";
import { contentMask, groupRuns, rowDensity, type Bitmap, type Mask } from "./segments";

export type AnalysisProgress = (stage: string) => void;

/**
 * Blank bands are usually padding, not structure. Merging bands that sit closer
 * together than this keeps a card's internal gaps from becoming fake sections.
 */
const MIN_SECTION_GAP = 24;

const MIN_SECTION_HEIGHT = 8;

/** A row holding less than this fraction of content starts an empty band. */
const CONTENT_THRESHOLD = 0.004;

/**
 * Runs the full pipeline. Yields to the event loop between stages so the
 * progress indicator can paint, which is the only reason `onProgress` exists.
 */
export async function analyseScreenshot(
  bitmap: Bitmap,
  onProgress: AnalysisProgress = () => {},
): Promise<UIScreen> {
  const startedAt = performance.now();

  onProgress("Detecting page background");
  const background = pageBackground(bitmap);
  await yieldToUi();

  onProgress("Building content mask");
  const mask = contentMask(bitmap, background);
  await yieldToUi();

  onProgress("Finding sections");
  const densities: number[] = [];
  for (let y = 0; y < bitmap.height; y++) {
    densities.push(rowDensity(mask, bitmap.width, y));
  }
  const bands = groupRuns(densities, CONTENT_THRESHOLD, MIN_SECTION_HEIGHT, MIN_SECTION_GAP);

  onProgress("Measuring regions");
  const sections: UISection[] = [];
  let previousBandEnd = 0;
  for (const [index, band] of bands.entries()) {
    const bounds: Rect = {
      x: 0,
      y: band.start,
      width: bitmap.width,
      height: band.end - band.start,
    };
    // The blank runs around a band are the page's outer margins. Measuring them
    // against the band itself would always give zero, since a band starts at its
    // first filled row.
    sections.push(
      buildSection(bitmap, mask, bounds, index, background, band.start - previousBandEnd),
    );
    previousBandEnd = band.end;
    await yieldToUi();
  }

  onProgress("Extracting palette");
  const palette = extractPalette(bitmap, background);

  return {
    width: bitmap.width,
    height: bitmap.height,
    background: rgbToHex(...background),
    palette,
    sections,
    stats: {
      regions: sections.reduce((sum, section) => sum + section.regions.length, 0),
      sections: sections.length,
      durationMs: Math.round(performance.now() - startedAt),
    },
  };
}

function buildSection(
  bitmap: Bitmap,
  mask: Mask,
  bounds: Rect,
  index: number,
  background: [number, number, number],
  paddingTop: number,
): UISection {
  const regions = extractRegions(bitmap, mask, bounds, { pageBackground: background });

  const contentBounds = regions.reduce<Rect | null>((acc, region) => {
    if (!acc) return region.bounds;
    const left = Math.min(acc.x, region.bounds.x);
    const top = Math.min(acc.y, region.bounds.y);
    return {
      x: left,
      y: top,
      width: Math.max(acc.x + acc.width, region.bounds.x + region.bounds.width) - left,
      height: Math.max(acc.y + acc.height, region.bounds.y + region.bounds.height) - top,
    };
  }, null);

  const offset = contentBounds ? offsetFromCenter(contentBounds, bounds) : 0;

  return {
    index,
    bounds,
    paddingTop,
    align: Math.abs(offset) < 0.03 ? "center" : offset > 0.04 ? "right" : "left",
    regions,
  };
}

function yieldToUi(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}