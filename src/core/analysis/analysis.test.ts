import { describe, expect, it } from "vitest";
import {
  adjustForContrast,
  colorDistance,
  contrastRatio,
  medianColor,
  offsetFromCenter,
  rgbToHex,
} from "./color";
import {
  contentMask,
  cutColumns,
  cutRows,
  groupRuns,
  inkFraction,
  inkRows,
  rowDensity,
} from "./segments";
import { bitmap } from "./fixtures";

const isInk = (value: number) => value < 128;

describe("colour helpers", () => {
  it("round-trips hex", () => {
    expect(rgbToHex(255, 0, 0)).toBe("#ff0000");
  });

  it("reports zero distance for identical colours", () => {
    expect(colorDistance([10, 20, 30], [10, 20, 30])).toBe(0);
  });

  it("ranks white on black at the top of the contrast scale", () => {
    expect(contrastRatio([255, 255, 255], [0, 0, 0])).toBeCloseTo(21, 1);
  });

  it("offsets a child from its container centre", () => {
  const container = { x: 0, y: 0, width: 200, height: 100 };
  expect(offsetFromCenter({ x: 0, y: 0, width: 100, height: 10 }, container)).toBeCloseTo(-0.25, 5);
  expect(offsetFromCenter({ x: 50, y: 0, width: 100, height: 10 }, container)).toBe(0);
});

it("takes the per-channel median, ignoring outliers", () => {
    const samples = [0, 0, 0, 255, 200, 200, 200, 255, 10, 10, 10, 255, 10, 10, 10, 255];
    expect(medianColor(samples)).toEqual([10, 10, 10]);
  });

  

  it("returns the input colour when it already passes", () => {
    expect(adjustForContrast([255, 255, 255], [0, 0, 0], 4.5)).toEqual([255, 255, 255]);
  });

  it("darkens low-contrast ink until it passes", () => {
    const [r, g, b] = adjustForContrast([200, 200, 200], [255, 255, 255], 4.5);
    expect(contrastRatio([r, g, b], [255, 255, 255])).toBeGreaterThanOrEqual(4.5);
  });
});

describe("segmentation", () => {
  it("marks pixels that differ from the background", () => {
    const mask = contentMask(bitmap(20, 20, [255, 255, 255], [[4, 4, 4, 4, [0, 0, 0]]]), [
      255, 255, 255,
    ]);
    expect(mask[5 * 20 + 5]).toBe(1);
    expect(mask[0]).toBe(0);
  });

  it("treats transparent pixels as empty", () => {
    const image = bitmap(10, 10, [255, 255, 255]);
    for (let i = 3; i < image.data.length; i += 4) image.data[i] = 0;
    const mask = contentMask(image, [255, 255, 255]);
    expect(mask.some((value) => value === 1)).toBe(false);
  });

  it("groups runs and drops specks", () => {
    expect(groupRuns([0, 1, 1, 0, 0, 0, 1, 0], 0.5, 2, 1)).toEqual([{ start: 1, end: 3 }]);
  });

  it("merges runs separated by less than the gap", () => {
    expect(groupRuns([1, 1, 0, 1, 1], 0.5, 1, 3)).toEqual([{ start: 0, end: 5 }]);
  });

  it("measures row density over the requested span only", () => {
    const mask = new Uint8Array([1, 1, 0, 0]);
    expect(rowDensity(mask, 4, 0, 2, 2)).toBe(0);
  });

  it("splits a region into columns at a blank gap", () => {
    const image = bitmap(60, 20, [255, 255, 255], [
      [0, 0, 20, 20, [0, 0, 0]],
      [40, 0, 20, 20, [0, 0, 0]],
    ]);
    const mask = contentMask(image, [255, 255, 255]);
    const columns = cutColumns(mask, 60, { x: 0, y: 0, width: 60, height: 20 }, 8);
    expect(columns).toHaveLength(2);
    expect(columns[1].x).toBe(40);
  });

  it("finds stacked cards beside a full-height sidebar", () => {
    // A full-height sidebar fills every row, so measuring row density across the
    // whole page would report no blank rows and collapse both cards into one.
    const image = bitmap(400, 400, [255, 255, 255], [
      [0, 0, 80, 400, [15, 23, 42]],
      [200, 0, 180, 100, [226, 232, 240]],
      [200, 200, 180, 100, [226, 232, 240]],
    ]);
    const mask = contentMask(image, [255, 255, 255]);
    const columns = cutColumns(mask, 400, { x: 0, y: 0, width: 400, height: 400 }, 24);
    expect(columns).toHaveLength(2);

    const right = columns[1];
    expect(cutRows(mask, 400, right, 24)).toEqual([
      { start: 0, end: 100 },
      { start: 200, end: 300 },
    ]);
  });

  it("splits rows inside a rect", () => {
    const image = bitmap(100, 200, [255, 255, 255], [
      [10, 10, 80, 40, [0, 0, 0]],
      [10, 120, 80, 40, [0, 0, 0]],
    ]);
    const mask = contentMask(image, [255, 255, 255]);
    expect(cutRows(mask, 100, { x: 0, y: 0, width: 100, height: 200 }, 12)).toEqual([
      { start: 10, end: 50 },
      { start: 120, end: 160 },
    ]);
  });

  it("returns the original rect when there is no column gap", () => {
    const image = bitmap(30, 20, [255, 255, 255], [[0, 0, 30, 20, [0, 0, 0]]]);
    const mask = contentMask(image, [255, 255, 255]);
    const rect = { x: 0, y: 0, width: 30, height: 20 };
    expect(cutColumns(mask, 30, rect, 8)).toEqual([rect]);
  });

  it("counts ink rows and ink fraction", () => {
    const image = bitmap(40, 20, [255, 255, 255], [[0, 0, 40, 5, [0, 0, 0]]]);
    const rect = { x: 0, y: 0, width: 40, height: 20 };
    expect(inkRows(image, rect, isInk)).toHaveLength(5);
    expect(inkFraction(image, rect, isInk)).toBeCloseTo(0.25, 2);
  });
});