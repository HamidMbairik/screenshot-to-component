import { describe, expect, it } from "vitest";
import type { UIRegion, UIScreen, UISection } from "../types";
import { generate } from "./generate";
import {
  breakpointPrefix,
  colorClass,
  fontWeight,
  lineHeight,
  spacing,
  textSize,
} from "./tailwind";

function text(overrides: Partial<UIRegion["text"]> = {}): UIRegion {
  return {
    kind: "text",
    bounds: { x: 0, y: 0, width: 300, height: 40 },
    color: "#0f172a",
    text: {
      fontSize: 16,
      fontWeight: 400,
      color: "#0f172a",
      align: "left",
      monospace: false,
      ...overrides,
    },
  };
}

function section(index: number, regions: UIRegion[], overrides: Partial<UISection> = {}): UISection {
  return {
    index,
    bounds: { x: 0, y: index * 400, width: 1440, height: 400 },
    paddingTop: 64,
    align: "left",
    regions,
    ...overrides,
  };
}

function screen(sections: UISection[], overrides: Partial<UIScreen> = {}): UIScreen {
  return {
    width: 1440,
    height: 1200,
    background: "#ffffff",
    palette: ["#0f172a", "#2563eb"],
    sections,
    stats: {
      regions: sections.reduce((sum, s) => sum + s.regions.length, 0),
      sections: sections.length,
      durationMs: 12,
    },
    ...overrides,
  };
}

describe("tailwind mapping", () => {
  it("snaps spacing onto the scale", () => {
    expect(spacing(16, "p")).toBe("p-4");
    expect(spacing(0, "p")).toBe("p-0");
  });

  it("snaps spacing to the nearest scale step", () => {
    expect(spacing(13, "p")).toBe("p-3");
    expect(spacing(22, "gap-y")).toBe("gap-y-5");
    expect(spacing(32, "gap-y")).toBe("gap-y-8");
    expect(spacing(24, "gap-x")).toBe("gap-x-6");
  });

  it("emits the measured value when snapping would distort it", () => {
    expect(spacing(200, "p")).toBe("p-[200px]");
  });

  it("maps measured font sizes onto type scale steps", () => {
    expect(textSize(16)).toBe("text-base");
    expect(textSize(14)).toBe("text-sm");
  });

  it("falls back to the measured size for display type", () => {
    expect(textSize(48)).toBe("text-[48px]");
  });

  it("maps line height ratios to leading tokens", () => {
    expect(lineHeight(16, 24)).toBe("leading-normal");
    expect(lineHeight(16)).toBe("");
  });

  it("uses tokens only for exact colour matches", () => {
    expect(colorClass("#ffffff", "bg")).toBe("bg-white");
    expect(colorClass("#123456", "bg")).toBe("bg-[#123456]");
  });

  it("maps weights", () => {
    expect(fontWeight(600)).toBe("font-semibold");
  });

  it("picks a breakpoint prefix from the analysis width", () => {
    expect(breakpointPrefix(1440)).toBe("md");
    expect(breakpointPrefix(800)).toBe("sm");
    expect(breakpointPrefix(500)).toBe("");
  });
});

describe("generate", () => {
  const sections = [
    section(0, [
      text({ fontSize: 40, fontWeight: 700 }),
      { kind: "button", bounds: { x: 0, y: 120, width: 160, height: 44 }, color: "#2563eb" },
    ]),
    section(1, [text({ fontSize: 18 })]),
    section(2, [
      { kind: "image", bounds: { x: 0, y: 0, width: 400, height: 300 }, color: "#1e293b" },
    ]),
  ];

  const result = generate(screen(sections));

  function gridSection(): UISection {
    return section(0, [
      { kind: "block", bounds: { x: 0, y: 0, width: 200, height: 100 }, color: "#e2e8f0" },
      { kind: "block", bounds: { x: 224, y: 0, width: 200, height: 100 }, color: "#e2e8f0" },
      { kind: "block", bounds: { x: 448, y: 0, width: 200, height: 100 }, color: "#e2e8f0" },
      { kind: "block", bounds: { x: 0, y: 132, width: 648, height: 60 }, color: "#cbd5e1" },
    ]);
  }

  it("emits one component file per section plus the app shell", () => {
    expect(result.files.map((file) => file.path)).toEqual([
      "src/components/Hero.tsx",
      "src/components/Section2.tsx",
      "src/components/Footer.tsx",
      "src/App.tsx",
      "src/index.css",
      "README.md",
    ]);
  });

  it("imports and renders every section in App.tsx", () => {
    const app = result.files.find((file) => file.path === "src/App.tsx")!.contents;
    expect(app).toContain('import { Hero } from "./components/Hero";');
    expect(app).toContain("      <Hero />");
    expect(app).toContain("      <Footer />");
  });

  it("uses semantic elements for measured regions", () => {
    const hero = result.files[0].contents;
    expect(hero).toContain("<h2");
    expect(hero).toContain("<button type=");
    expect(hero).not.toContain("<div className=\"text-\"");
  });

  it("emits a placeholder image block with the measured aspect ratio", () => {
    const footer = result.files[2].contents;
    expect(footer).toContain('aspectRatio: "0.75"');
  });

  it("keeps every component small enough to read", () => {
    for (const file of result.files.filter((f) => f.path.endsWith(".tsx"))) {
      expect(file.contents.split("\n").length).toBeLessThan(40);
    }
  });

  it("documents the known gaps in the generated readme", () => {
    const readme = result.files.at(-1)!.contents;
    expect(readme).toContain("Replace the placeholder text");
    expect(readme).toContain("Breakpoints were inferred");
  });

  it("emits a grid with the measured column gutter for side-by-side regions", () => {
    const file = generate(screen([gridSection()])).files[0].contents;
    expect(file).toContain("grid grid-cols-1 md:grid-cols-3");
    // The regression: reading the gap off the first two regions by y gives a
    // negative number here, which used to be clamped to gap-0.
    expect(file).toContain("gap-x-6");
    expect(file).toContain("gap-y-8");
    expect(file).not.toContain("gap-0");
  });

  it("uses the measured columns when there is no breakpoint to infer", () => {
    const file = generate(screen([gridSection()], { width: 600 })).files[0].contents;
    expect(file).toContain("grid grid-cols-3");
    expect(file).not.toContain("flex flex-col");
  });

  it("emits a flex stack when regions are stacked", () => {
    expect(generate(screen(sections)).files[0].contents).toContain("flex flex-col");
  });

  it("is deterministic", () => {
    const again = generate(screen(sections));
    expect(JSON.stringify(again)).toBe(JSON.stringify(result));
  });

  it("does not collide on component names when a section is missing", () => {
    const sparse = generate(
      screen([
        section(0, [text()], { index: 0 }),
        section(1, [text()]),
      ]),
    );
    const names = sparse.files.filter((f) => f.path.endsWith(".tsx")).map((f) => f.path);
    expect(new Set(names).size).toBe(names.length);
  });

  it("handles a screen with no sections", () => {
    const empty = generate(screen([]));
    expect(empty.files.map((f) => f.path)).toEqual(["src/App.tsx", "src/index.css", "README.md"]);
  });
});