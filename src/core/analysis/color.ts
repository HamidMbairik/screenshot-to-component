import type { Rect } from "../types";

export function rgbToHex(r: number, g: number, b: number): string {
  const part = (value: number) =>
    Math.max(0, Math.min(255, Math.round(value)))
      .toString(16)
      .padStart(2, "0");
  return `#${part(r)}${part(g)}${part(b)}`;
}

/** Perceptually-weighted distance between two colours, 0 (same) to ~441 (max). */
export function colorDistance(
  a: [number, number, number],
  b: [number, number, number],
): number {
  const rm = (a[0] + b[0]) / 2;
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(
    (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db,
  );
}

/** WCAG relative luminance. */
export function luminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two colours, 1 to 21. */
export function contrastRatio(
  a: [number, number, number],
  b: [number, number, number],
): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Move a colour towards black or white in small steps until it passes `target`. */
export function adjustForContrast(
  color: [number, number, number],
  background: [number, number, number],
  target: number,
): [number, number, number] {
  let adjusted: [number, number, number] = [...color];
  for (let step = 0; step < 32; step++) {
    if (contrastRatio(adjusted, background) >= target) return adjusted;
    const delta = luminance(adjusted) < luminance(background) ? -1 : 1;
    adjusted = adjusted.map((c) => c + delta * 4) as [number, number, number];
  }
  return adjusted;
}

/** Median of each channel across a sample, which ignores antialiased edges. */
export function medianColor(
  pixels: ArrayLike<number>,
): [number, number, number] {
  if (pixels.length < 3) return [0, 0, 0];
  const r: number[] = [];
  const g: number[] = [];
  const b: number[] = [];
  for (let i = 0; i < pixels.length; i += 4) {
    r.push(pixels[i]);
    g.push(pixels[i + 1]);
    b.push(pixels[i + 2]);
  }
  const middle = (values: number[]) => {
    values.sort((x, y) => x - y);
    return values[Math.floor(values.length / 2)] ?? 0;
  };
  return [middle(r), middle(g), middle(b)];
}

function centerX(rect: Rect): number {
  return rect.x + rect.width / 2;
}

export function offsetFromCenter(rect: Rect, container: Rect): number {
  return (centerX(rect) - centerX(container)) / Math.max(container.width, 1);
}