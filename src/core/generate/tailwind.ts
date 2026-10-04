/**
 * Maps measured pixels onto Tailwind classes. Everything here is a pure function
 * so the mapping can be tested without rendering anything.
 */

const SPACING_STEPS: Array<[number, string]> = [
  [0, "0"],
  [4, "1"],
  [8, "2"],
  [12, "3"],
  [16, "4"],
  [20, "5"],
  [24, "6"],
  [32, "8"],
  [40, "10"],
  [48, "12"],
  [64, "16"],
  [80, "20"],
  [96, "24"],
  [128, "32"],
];

const TEXT_STEPS: Array<[number, string]> = [
  [12, "text-xs"],
  [14, "text-sm"],
  [16, "text-base"],
  [18, "text-lg"],
  [20, "text-xl"],
  [24, "text-2xl"],
  [30, "text-3xl"],
];

/** Snapping is for tidiness, not for pretending. Past this error we emit the measured value. */
const SPACING_TOLERANCE = 0.3;
const TEXT_TOLERANCE = 0.12;

function nearest(
  value: number,
  steps: Array<[number, string]>,
): { token: string; size: number } {
  let best = steps[0];
  let bestError = Infinity;
  for (const step of steps) {
    const error = Math.abs(value - step[0]);
    if (error < bestError) {
      bestError = error;
      best = step;
    }
  }
  return { token: best[1], size: best[0] };
}

export function spacing(px: number, prefix: "p" | "py" | "gap-x" | "gap-y"): string {
  const value = Math.max(0, Math.round(px));
  if (value === 0) return `${prefix}-0`;

  const { token, size } = nearest(value, SPACING_STEPS);
  if (Math.abs(size - value) / value > SPACING_TOLERANCE) {
    return `${prefix}-[${value}px]`;
  }
  return `${prefix}-${token}`;
}

export function textSize(px: number): string {
  const value = Math.max(px, 1);
  const { token, size } = nearest(value, TEXT_STEPS);
  if (Math.abs(size - value) / value > TEXT_TOLERANCE) {
    return `text-[${Math.round(value)}px]`;
  }
  return token;
}

export function lineHeight(fontSize: number, measured?: number): string {
  if (!measured || fontSize <= 0) return "";
  const ratio = measured / fontSize;
  const steps: Array<[number, string]> = [
    [1.1, "leading-none"],
    [1.3, "leading-tight"],
    [1.45, "leading-snug"],
    [1.55, "leading-normal"],
  ];
  for (const [max, token] of steps) {
    if (ratio <= max) return token;
  }
  return "leading-relaxed";
}

/**
 * Colours are emitted as arbitrary hex values. Projecting a sampled colour onto
 * Tailwind's palette is a guess that is usually visibly wrong, and it ties the
 * output to a scale that has nothing to do with the source design. The one
 * exception is an exact match against a colour Tailwind already ships.
 */
const ANCHORS: Array<[string, string]> = [
  ["#ffffff", "white"],
  ["#000000", "black"],
  ["#fafafa", "zinc-50"],
  ["#f4f4f5", "zinc-100"],
  ["#e4e4e7", "zinc-200"],
  ["#d4d4d8", "zinc-300"],
  ["#a1a1aa", "zinc-400"],
  ["#71717a", "zinc-500"],
  ["#52525b", "zinc-600"],
  ["#3f3f46", "zinc-700"],
  ["#27272a", "zinc-800"],
  ["#18181b", "zinc-900"],
  ["#09090b", "zinc-950"],
];

export function colorClass(hex: string, prefix: "bg" | "text"): string {
  const anchor = ANCHORS.find(([value]) => value === hex.toLowerCase());
  return anchor ? `${prefix}-${anchor[1]}` : `${prefix}-[${hex}]`;
}

export function fontWeight(weight: 400 | 500 | 600 | 700): string {
  return { 400: "font-normal", 500: "font-medium", 600: "font-semibold", 700: "font-bold" }[weight];
}

/**
 * There is no evidence for anything wider than the screenshot itself, so the
 * analysis width picks one breakpoint and we never emit `lg:` or above.
 */
export function breakpointPrefix(width: number): string {
  if (width >= 1024) return "md";
  if (width >= 768) return "sm";
  return "";
}