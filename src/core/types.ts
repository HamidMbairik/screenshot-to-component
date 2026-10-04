/**
 * Intermediate representation shared by analysis and code generation.
 * Neither side may import from the other.
 */

export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/** What a leaf region was judged to be from its pixels. */
export type RegionKind = "text" | "image" | "button" | "divider" | "block";

export type TextMetrics = {
  /** Cap height in screenshot pixels, rounded. */
  fontSize: number;
  /** Median distance between text baselines, if more than one line was found. */
  lineHeight?: number;
  fontWeight: 400 | 500 | 600 | 700;
  color: string;
  align: "left" | "center" | "right";
  monospace: boolean;
};

export type UIRegion = {
  kind: RegionKind;
  bounds: Rect;
  /** Measured colour, as a `#rrggbb` string. */
  color: string;
  text?: TextMetrics;
};

export type UISection = {
  /** Zero-based position in the page column stack. */
  index: number;
  bounds: Rect;
  /** Blank gap above this section, in analysis pixels. */
  paddingTop: number;
  align: "left" | "center" | "right";
  regions: UIRegion[];
};

export type UIScreen = {
  /**
   * Size the analysis ran at. `lib/image.ts` downscales large screenshots before
   * analysis, so this is smaller than the file the user dropped.
   */
  width: number;
  height: number;
  background: string;
  /** Most common non-background colours, most frequent first. */
  palette: string[];
  sections: UISection[];
  stats: {
    regions: number;
    sections: number;
    durationMs: number;
  };
};

export type GeneratedFile = {
  path: string;
  contents: string;
};

export type GenerationResult = {
  files: GeneratedFile[];
  /** Warnings worth showing the user, e.g. colours adjusted for contrast. */
  notes: string[];
};