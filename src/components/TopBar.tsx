import { formatBytes, type LoadedImage } from "../lib/image";

export type Status = "empty" | "ready" | "analysing" | "done" | "error";

type Props = {
  image: LoadedImage | null;
  status: Status;
  onAnalyse: () => void;
  onReset: () => void;
  onReplace: () => void;
};

export function TopBar({ image, status, onAnalyse, onReset, onReplace }: Props) {
  const busy = status === "analysing";

  return (
    <header className="flex min-h-14 shrink-0 flex-wrap items-center gap-3 border-b border-zinc-800 bg-zinc-900/60 px-4 py-2 backdrop-blur">
      <h1 className="shrink-0 text-sm font-semibold tracking-tight">Screenshot to Component</h1>

      {image && (
        <span className="order-last min-w-0 truncate rounded-full border border-zinc-700 bg-zinc-800/60 px-3 py-1 text-xs text-zinc-300 sm:order-none">
          {image.name} · {image.width}×{image.height} · {formatBytes(image.sizeBytes)}
        </span>
      )}

      <div className="ml-auto flex shrink-0 items-center gap-2">
        {image && (
          <>
            <button
              type="button"
              className="btn btn-ghost h-8 text-xs"
              onClick={onReplace}
              disabled={busy}
            >
              Replace
            </button>
            <button
              type="button"
              className="btn btn-ghost h-8 text-xs"
              onClick={onReset}
              disabled={busy}
            >
              Clear
            </button>
          </>
        )}
        <button
          type="button"
          className="btn btn-primary"
          title="Analyse (Ctrl+Enter)"
          onClick={onAnalyse}
          disabled={!image || busy}
        >
          {busy ? "Analysing…" : "Analyse"}
        </button>
      </div>
    </header>
  );
}