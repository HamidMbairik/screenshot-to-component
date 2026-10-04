import type {
  GeneratedFile,
  GenerationResult,
  UIRegion,
  UIScreen,
  UISection,
} from "../types";
import {
  breakpointPrefix,
  colorClass,
  fontWeight,
  lineHeight,
  spacing,
  textSize,
} from "./tailwind";

/** We reproduce type, never content. These strings are stand-ins. */
function placeholderFor(region: UIRegion, position: number): string {
  if (region.kind === "button") return position === 0 ? "Get started" : "Learn more";
  if (region.kind !== "text") return "";

  const size = region.text?.fontSize ?? 16;
  if (size >= 26) return "Section heading";
  if (size >= 19) return "Supporting subheading";
  return "Supporting paragraph with a sentence or two of copy.";
}

function regionClasses(region: UIRegion): string {
  switch (region.kind) {
    case "text": {
      const text = region.text;
      if (!text) return "";
      const classes = [
        textSize(text.fontSize),
        fontWeight(text.fontWeight),
        colorClass(text.color, "text"),
      ];
      if (text.monospace) classes.push("font-mono");
      const leading = lineHeight(text.fontSize, text.lineHeight);
      if (leading) classes.push(leading);
      if (text.align === "center") classes.push("text-center");
      if (text.align === "right") classes.push("text-right");
      return classes.join(" ");
    }
    case "button":
      return [
        "inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-medium",
        colorClass(region.color, "bg"),
      ].join(" ");
    case "divider":
      return ["h-px w-full", colorClass(region.color, "bg")].join(" ");
    default:
      return ["w-full", colorClass(region.color, "bg")].join(" ");
  }
}

function regionElement(region: UIRegion, position: number): string {
  const classes = regionClasses(region);

  switch (region.kind) {
    case "text": {
      const size = region.text?.fontSize ?? 16;
      const tag = size >= 26 ? "h2" : "p";
      return `      <${tag} className="${classes}">${placeholderFor(region, position)}</${tag}>`;
    }
    case "button":
      return `      <button type="button" className="${classes}">${placeholderFor(region, position)}</button>`;
    case "divider":
      return `      <hr className="${classes}" />`;
    case "image": {
      const ratio = region.bounds.height / Math.max(region.bounds.width, 1);
      return `      <div className="${classes}" style={{ aspectRatio: "${ratio.toFixed(2)}" }} />`;
    }
    default:
      return `      <div className="${classes}" />`;
  }
}

/**
 * Groups regions into rows that share a vertical band, then measures the gap
 * between rows. Reading the gap off the first two regions by y would return a
 * negative number for side-by-side items and silently emit `gap-0`, which is
 * also the column gutter in a grid.
 */
function measureRowGap(section: UISection): number {
  const sorted = [...section.regions].sort((a, b) => a.bounds.y - b.bounds.y);
  for (let i = 1; i < sorted.length; i++) {
    const previous = sorted[i - 1];
    const current = sorted[i];
    const overlap =
      Math.min(previous.bounds.y + previous.bounds.height, current.bounds.y + current.bounds.height) -
      Math.max(previous.bounds.y, current.bounds.y);
    if (overlap <= Math.min(previous.bounds.height, current.bounds.height) * 0.5) {
      return Math.max(current.bounds.y - (previous.bounds.y + previous.bounds.height), 0);
    }
  }
  return 0;
}

/** Horizontal gutter between the narrowest pair of side-by-side regions. */
function measureColumnGap(section: UISection): number {
  const sorted = [...section.regions].sort((a, b) => a.bounds.x - b.bounds.x);
  let smallest = Number.POSITIVE_INFINITY;
  for (let i = 1; i < sorted.length; i++) {
    const previous = sorted[i - 1];
    const current = sorted[i];
    const gap = current.bounds.x - (previous.bounds.x + previous.bounds.width);
    if (gap >= 0) smallest = Math.min(smallest, gap);
  }
  return smallest === Number.POSITIVE_INFINITY ? 0 : smallest;
}

/**
 * Regions sharing a vertical band sit side by side, so they belong in a grid row
 * rather than a stack. Overlap below half the row height counts as the same band,
 * which separates a real row from two stacked items.
 */
function columnCount(regions: UIRegion[]): number {
  let widest = 0;
  for (const region of regions) {
    const band = regions.filter((other) => {
      const overlap =
        Math.min(region.bounds.y + region.bounds.height, other.bounds.y + other.bounds.height) -
        Math.max(region.bounds.y, other.bounds.y);
      return overlap > Math.min(region.bounds.height, other.bounds.height) * 0.5;
    });
    widest = Math.max(widest, band.length);
  }
  return widest;
}

function sectionClasses(section: UISection, breakpoint: string): string {
  const classes: string[] = [];
  const columns = columnCount(section.regions);

  if (columns > 1) {
    // A wide screenshot stacks to one column below the inferred breakpoint,
    // which is the only responsive claim we can make from a single capture. A
    // narrow one has no breakpoint to infer, so the measured columns are used
    // at every width rather than being discarded.
    classes.push(
      breakpoint ? `grid grid-cols-1 ${breakpoint}:grid-cols-${columns}` : `grid grid-cols-${columns}`,
    );
    classes.push(spacing(measureRowGap(section), "gap-y"));
    classes.push(spacing(measureColumnGap(section), "gap-x"));
  } else {
    classes.push("flex flex-col", spacing(measureRowGap(section), "gap-y"));
  }

  classes.push(spacing(section.paddingTop, "py"));
  if (section.align === "center") classes.push("items-center");
  return classes.join(" ");
}

function componentName(section: UISection, total: number): string {
  const position = section.index + 1;
  if (position === 1) return "Hero";
  if (position === total) return "Footer";
  return `Section${position}`;
}

/** Trailing sections with no detected content are dropped rather than named. */
function nameSections(sections: UISection[]): Array<{ section: UISection; name: string }> {
  const withContent = sections.filter((section) => section.regions.length > 0);
  const used = new Set<string>();

  return withContent.map((section) => {
    const base = componentName(section, withContent.length);
    let name = base;
    let suffix = 2;
    while (used.has(name)) name = `${base}${suffix++}`;
    used.add(name);
    return { section, name };
  });
}

function sectionFile(section: UISection, name: string, breakpoint: string): GeneratedFile {
  const children = section.regions.map((region, index) => regionElement(region, index));
  const body =
    children.length > 0
      ? `\n${children.join("\n")}\n`
      : "\n      {/* Nothing was detected in this section. */}\n";

  return {
    path: `src/components/${name}.tsx`,
    contents:
      `export function ${name}() {\n` +
      `  return (\n` +
      `    <section className="${sectionClasses(section, breakpoint)}">` +
      `${body}` +
      `    </section>\n` +
      `  );\n` +
      `}\n`,
  };
}

function appFile(parts: Array<{ section: UISection; name: string }>, screen: UIScreen): GeneratedFile {
  const imports = parts.map(({ name }) => `import { ${name} } from "./components/${name}";`);
  const children = parts.map(({ name }) => `      <${name} />`);

  return {
    path: "src/App.tsx",
    contents:
      [
        ...imports,
        "",
        "export default function App() {",
        "  return (",
        `    <div className="min-h-screen ${colorClass(screen.background, "bg")}">`,
        ...children,
        "    </div>",
        "  );",
        "}",
        "",
      ].join("\n"),
  };
}

function cssFile(screen: UIScreen): GeneratedFile {
  return {
    path: "src/index.css",
    contents:
      [
        '@import "tailwindcss";',
        "",
        "body {",
        "  margin: 0;",
        '  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;',
        `  background-color: ${screen.background};`,
        // The page was measured in one scheme. Letting the UA follow the OS would
        // paint controls and scrollbars in a scheme we never sampled.
        "  color-scheme: only light;",
        "}",
        "",
      ].join("\n"),
  };
}

function notesFile(
  screen: UIScreen,
  parts: Array<{ section: UISection; name: string }>,
): GeneratedFile {
  return {
    path: "README.md",
    contents:
      [
        "# Generated by Screenshot to Component",
        "",
        `Analysis ran at ${screen.width}x${screen.height} and took ${screen.stats.durationMs}ms.`,
        `Detected ${screen.stats.sections} sections and ${screen.stats.regions} regions.`,
        "",
        "## Components",
        "",
        ...parts.map(({ name }) => `- \`src/components/${name}.tsx\``),
        "",
        "## What still needs doing",
        "",
        "- Replace the placeholder text with the real copy.",
        "- Image regions are flat colour blocks. Swap in real images.",
        "- Icons were not detected.",
        `- Breakpoints were inferred from the ${screen.width}px analysis width, not measured.`,
        "- Shadows, borders and hover states were not reconstructed.",
        "",
      ].join("\n"),
  };
}

/** Converts an analysed screen into files. Deterministic for a given input. */
export function generate(screen: UIScreen): GenerationResult {
  const breakpoint = breakpointPrefix(screen.width);
  const parts = nameSections(screen.sections);

  return {
    files: [
      ...parts.map(({ section, name }) => sectionFile(section, name, breakpoint)),
      appFile(parts, screen),
      cssFile(screen),
      notesFile(screen, parts),
    ],
    notes: [
      "Text content, icons and images are placeholders.",
      "Breakpoints were inferred from the analysis width, not measured.",
    ],
  };
}