import type { Bitmap } from "./segments";

export type RectSpec = [number, number, number, number, [number, number, number]];

/**
 * Builds a bitmap by filling solid rects, so a test can state the layout it
 * means instead of encoding antialiasing noise. Every analysis fixture uses this.
 */
export function bitmap(
  width: number,
  height: number,
  fill: [number, number, number] = [255, 255, 255],
  rects: RectSpec[] = [],
  alpha = 255,
): Bitmap {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = fill[0];
    data[i + 1] = fill[1];
    data[i + 2] = fill[2];
    data[i + 3] = alpha;
  }
  for (const [x, y, w, h, color] of rects) {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const i = ((y + dy) * width + (x + dx)) * 4;
        data[i] = color[0];
        data[i + 1] = color[1];
        data[i + 2] = color[2];
        data[i + 3] = 255;
      }
    }
  }
  return { data, width, height };
}

/**
 * Draws text-like content: rows of thin dark bars separated by blank gaps.
 * Not real glyphs, but it reproduces the ink coverage, the baseline spacing and
 * the transitions the heuristics actually measure.
 */
export function textBlock(
  bitmapImage: Bitmap,
  x: number,
  y: number,
  width: number,
  capHeight: number,
  baselineGap: number,
  color: [number, number, number] = [15, 23, 42],
  lines = 3,
): void {
  for (let line = 0; line < lines; line++) {
    const top = y + line * baselineGap;
    if (top + capHeight > bitmapImage.height) break;
    // Stroke width and gap scale with the cap height so the ink fraction stays
    // in the range real type occupies. A solid bar would read as a filled block.
    const stroke = Math.max(1, Math.round(capHeight / 12));
    const gap = Math.max(1, Math.round(capHeight / 4));
    const period = stroke + gap;

    for (let dy = 0; dy < capHeight; dy++) {
      const row = top + dy;
      if (row >= bitmapImage.height) break;
      for (let dx = 0; dx < width; dx++) {
        const column = x + dx;
        if (column >= bitmapImage.width) break;
        if ((dx + line * 3) % period < gap) continue;
        const i = (row * bitmapImage.width + column) * 4;
        bitmapImage.data[i] = color[0];
        bitmapImage.data[i + 1] = color[1];
        bitmapImage.data[i + 2] = color[2];
      }
    }
  }
}