import type { Bitmap } from "../core/analysis/segments";

/**
 * Longest edge we analyse at. Bigger costs time in the mask and region passes
 * without improving structure detection, and screenshots above this are mostly
 * high-DPI duplicates of the same layout.
 */
export const MAX_ANALYSIS_EDGE = 1600;

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MIN_SCREENSHOT_WIDTH = 400;
export const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

export type LoadedImage = {
  name: string;
  sizeBytes: number;
  /** Screenshot dimensions, before any analysis downscale. */
  width: number;
  height: number;
  /** Object URL for the preview and the generated filename. */
  url: string;
  /** Analysis-sized bitmap. May be smaller than width/height. */
  bitmap: Bitmap;
};

export type LoadResult =
  | { ok: true; image: LoadedImage }
  | { ok: false; error: string };

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function loadImage(file: File): Promise<LoadResult> {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return { ok: false, error: "That file isn't an image. Drop a PNG, JPG, WebP or GIF." };
  }
  if (file.size > MAX_FILE_BYTES) {
    return {
      ok: false,
      error: `That image is ${formatBytes(file.size)}. The limit is ${formatBytes(MAX_FILE_BYTES)} so analysis stays fast.`,
    };
  }

  const url = URL.createObjectURL(file);

  try {
    const decoded = await decode(url);

    if (decoded.width < MIN_SCREENSHOT_WIDTH) {
      URL.revokeObjectURL(url);
      return {
        ok: false,
        error: `That image is ${decoded.width}px wide. Screenshots under ${MIN_SCREENSHOT_WIDTH}px give unreliable structure detection.`,
      };
    }

    return {
      ok: true,
      image: {
        name: file.name,
        sizeBytes: file.size,
        width: decoded.width,
        height: decoded.height,
        url,
        bitmap: decoded.bitmap,
      },
    };
  } catch {
    URL.revokeObjectURL(url);
    return {
      ok: false,
      error: "We couldn't read that image. It may be corrupt or use an unsupported encoding.",
    };
  }
}

/**
 * Downscales to fit the analysis edge limit, keeping the aspect ratio. Drawing
 * into a square and stretching would silently distort every vertical
 * measurement, so the two dimensions are set independently.
 */
async function decode(url: string): Promise<{ width: number; height: number; bitmap: Bitmap }> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error("decode failed"));
    element.src = url;
  });

  const scale = Math.min(1, MAX_ANALYSIS_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("no 2d context");

  context.drawImage(image, 0, 0, width, height);
  const { data } = context.getImageData(0, 0, width, height);

  return { width: image.naturalWidth, height: image.naturalHeight, bitmap: { data, width, height } };
}