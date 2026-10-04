import { describe, expect, it } from "vitest";
import { analyseScreenshot } from "./analyse";
import { classifyRegion, extractRegions } from "./regions";
import { contentMask } from "./segments";
import { bitmap, textBlock } from "./fixtures";

describe("analyseScreenshot", () => {
  it("finds the page background from the outer ring", async () => {
    const screen = await analyseScreenshot(bitmap(200, 300, [255, 255, 255], []));
    expect(screen.background).toBe("#ffffff");
  });

  it("does not mistake a dark full-bleed header for the page background", async () => {
    // The header covers the whole width, so it reaches the top edge and both
    // side edges. A top-strip sample would call it the background and invert
    // the mask for the whole page.
    const screen = await analyseScreenshot(
      bitmap(400, 800, [255, 255, 255], [[0, 0, 400, 160, [17, 24, 39]]]),
    );
    expect(screen.background).toBe("#ffffff");
  });

  it("does not read a full-bleed footer as the page background", async () => {
    // A footer that spans the full width reaches the bottom edge. Sampling only
    // the top and sides would miss it and call the footer colour the page.
    const screen = await analyseScreenshot(
      bitmap(400, 800, [255, 255, 255], [[0, 640, 400, 160, [17, 24, 39]]]),
    );
    expect(screen.background).toBe("#ffffff");
  });

  it("reads a genuinely dark page as a dark background", async () => {
    // The corner case in the other direction: when one colour really does fill
    // the page, it is the page background and must not be second-guessed.
    const screen = await analyseScreenshot(bitmap(400, 600, [15, 23, 42], []));
    expect(screen.background).toBe("#0f172a");
  });

  it("falls back to white for a fully transparent screenshot", async () => {
    // A transparent PNG decodes to rgba(0, 0, 0, 0). Reading that as the page
    // colour would emit a black background and an empty mask.
    const screen = await analyseScreenshot(bitmap(200, 200, [0, 0, 0], [], 0));
    expect(screen.background).toBe("#ffffff");
    expect(screen.sections).toHaveLength(0);
  });

  it("splits stacked content into sections", async () => {
    const image = bitmap(400, 600, [255, 255, 255], [
      [40, 40, 320, 120, [15, 23, 42]],
      [40, 400, 320, 120, [30, 41, 59]],
    ]);
    const screen = await analyseScreenshot(image);
    expect(screen.sections).toHaveLength(2);
    expect(screen.sections[0].bounds.y).toBeLessThan(screen.sections[1].bounds.y);
  });

  it("returns no sections for a blank screenshot", async () => {
    const screen = await analyseScreenshot(bitmap(300, 200, [255, 255, 255], []));
    expect(screen.sections).toHaveLength(0);
    expect(screen.stats.regions).toBe(0);
  });

  it("records regions inside the sections it finds", async () => {
    const screen = await analyseScreenshot(
      bitmap(400, 400, [255, 255, 255], [[60, 60, 280, 200, [15, 23, 42]]]),
    );
    expect(screen.sections).toHaveLength(1);
    expect(screen.sections[0].regions.length).toBeGreaterThan(0);
    expect(screen.stats.regions).toBe(screen.sections[0].regions.length);
  });

  it("measures the page margin above the first section", async () => {
    const screen = await analyseScreenshot(
      bitmap(300, 300, [255, 255, 255], [[40, 100, 220, 80, [0, 0, 0]]]),
    );
    expect(screen.sections[0].paddingTop).toBe(100);
    expect(screen.sections[0].bounds.y).toBe(100);
  });

  it("measures the gap between sections as the next padding", async () => {
    const image = bitmap(300, 400, [255, 255, 255], [
      [40, 50, 220, 60, [0, 0, 0]],
      [40, 210, 220, 60, [0, 0, 0]],
    ]);
    const screen = await analyseScreenshot(image);
    expect(screen.sections[0].paddingTop).toBe(50);
    expect(screen.sections[1].paddingTop).toBe(100);
  });

  it("is deterministic for identical input", async () => {
    const build = () =>
      bitmap(320, 480, [255, 255, 255], [
        [40, 40, 240, 120, [15, 23, 42]],
        [40, 300, 240, 100, [226, 232, 240]],
      ]);
    const first = await analyseScreenshot(build());
    const second = await analyseScreenshot(build());
    // Timing is the one field that legitimately varies between runs.
    expect({ ...second, stats: { ...second.stats, durationMs: 0 } }).toEqual({
      ...first,
      stats: { ...first.stats, durationMs: 0 },
    });
  });

  it("reports progress stages", async () => {
    const stages: string[] = [];
    await analyseScreenshot(bitmap(200, 200, [255, 255, 255], []), (stage) => stages.push(stage));
    expect(stages).toContain("Finding sections");
  });
});

describe("classifyRegion", () => {
  const pageBackground: [number, number, number] = [255, 255, 255];

  it("reads body copy as text with a dark ink colour", () => {
    const image = bitmap(400, 200, [255, 255, 255]);
    textBlock(image, 40, 40, 300, 11, 20, [15, 23, 42], 3);
    const region = classifyRegion(image, { x: 40, y: 40, width: 300, height: 60 }, { pageBackground });

    expect(region.kind).toBe("text");
    // The regression: a fixed percentile returns the page colour for copy that
    // covers less ink than the percentile, producing invisible text.
    expect(region.text?.color).not.toBe("#ffffff");
    expect(region.text?.fontSize).toBeGreaterThanOrEqual(12);
  });

  it("measures line spacing close to the drawn baseline gap", () => {
    const image = bitmap(400, 200, [255, 255, 255]);
    textBlock(image, 40, 40, 300, 11, 20, [15, 23, 42], 3);
    const region = classifyRegion(image, { x: 40, y: 40, width: 300, height: 60 }, { pageBackground });

    expect(region.text?.lineHeight).toBeGreaterThanOrEqual(18);
    expect(region.text?.lineHeight).toBeLessThanOrEqual(24);
  });

  it("reads a solid block with a centred label as a button", () => {
    const image = bitmap(400, 200, [255, 255, 255], [[40, 60, 160, 44, [37, 99, 235]]]);
    textBlock(image, 90, 76, 60, 12, 0, [255, 255, 255]);
    const region = classifyRegion(image, { x: 40, y: 60, width: 160, height: 44 }, { pageBackground });

    expect(region.kind).toBe("button");
  });

  it("reads large display type as text, not as an image", () => {
    const image = bitmap(600, 300, [255, 255, 255]);
    textBlock(image, 40, 40, 500, 34, 0);
    const region = classifyRegion(image, { x: 40, y: 40, width: 500, height: 40 }, { pageBackground });

    expect(region.kind).toBe("text");
    expect(region.text?.fontSize).toBeGreaterThanOrEqual(40);
  });

  it("reads light text on a dark fill", () => {
    const image = bitmap(400, 200, [255, 255, 255], [[40, 60, 320, 60, [15, 23, 42]]]);
    textBlock(image, 70, 80, 240, 12, 0, [255, 255, 255]);
    const region = classifyRegion(image, { x: 40, y: 60, width: 320, height: 60 }, { pageBackground });

    expect(region.kind).toBe("text");
    expect(region.text?.color).toBe("#ffffff");
  });

  it("reads a photographic region as an image", () => {
    const image = bitmap(200, 200, [255, 255, 255]);
    for (let i = 0; i < 200 * 200; i++) {
      const offset = i * 4;
      image.data[offset] = (i * 37) % 256;
      image.data[offset + 1] = (i * 71) % 256;
      image.data[offset + 2] = (i * 113) % 256;
    }
    const region = classifyRegion(image, { x: 0, y: 0, width: 200, height: 200 }, { pageBackground });
    expect(region.kind).toBe("image");
  });

  it("reads a flat panel as a block", () => {
    const image = bitmap(200, 200, [255, 255, 255], [[20, 20, 160, 60, [226, 232, 240]]]);
    const region = classifyRegion(image, { x: 20, y: 20, width: 160, height: 60 }, { pageBackground });
    expect(region.kind).toBe("block");
  });

  it("reads a thin wide rule as a divider", () => {
    const image = bitmap(200, 200, [255, 255, 255], [[0, 100, 200, 2, [226, 232, 240]]]);
    const region = classifyRegion(image, { x: 0, y: 100, width: 200, height: 2 }, { pageBackground });
    expect(region.kind).toBe("divider");
  });
});

describe("extractRegions on a two-column layout", () => {
  it("separates cards that sit beside a full-height sidebar", () => {
    const image = bitmap(400, 400, [255, 255, 255], [
      [0, 0, 80, 400, [15, 23, 42]],
      [200, 0, 180, 100, [226, 232, 240]],
      [200, 200, 180, 100, [226, 232, 240]],
    ]);
    const mask = contentMask(image, [255, 255, 255]);
    const regions = extractRegions(
      image,
      mask,
      { x: 0, y: 0, width: 400, height: 400 },
      { pageBackground: [255, 255, 255] },
    );

    expect(regions.length).toBeGreaterThanOrEqual(3);
    const rightColumn = regions.filter((region) => region.bounds.x >= 200);
    expect(rightColumn).toHaveLength(2);
  });
});