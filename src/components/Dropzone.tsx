import { useRef, useState, type RefObject } from "react";
import { formatBytes, MAX_FILE_BYTES } from "../lib/image";
import { ImageIcon } from "./icons";

type Props = {
  variant?: "hero" | "compact";
  onFile: (file: File) => void;
  busy: boolean;
  error: string | null;
  ref: RefObject<HTMLInputElement | null>;
};

export function Dropzone({ variant = "hero", onFile, busy, error, ref }: Props) {
  const [over, setOver] = useState(false);
  const depth = useRef(0);

  const compact = variant === "compact";

  function accept(file: File | undefined) {
    if (file) onFile(file);
  }

  const shell = compact
    ? "flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-zinc-700 bg-zinc-900/40 p-3"
    : "flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-zinc-700 bg-zinc-900/40 p-10 text-center";

  return (
    <div
      className={`${shell} ${over ? "border-sky-500 bg-sky-500/10" : ""} ${
        error ? "border-rose-500 bg-rose-500/10" : ""
      } ${busy ? "pointer-events-none opacity-60" : ""}`}
      onDragEnter={(event) => {
        event.preventDefault();
        // Counter rather than a plain toggle: the pointer crosses child elements
        // constantly and a naive enter/leave pair flickers the highlight.
        depth.current++;
        setOver(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        event.preventDefault();
        depth.current--;
        if (depth.current <= 0) setOver(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        depth.current = 0;
        setOver(false);
        accept(event.dataTransfer.files[0]);
      }}
    >
      <input
        ref={ref}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="sr-only"
        aria-label="Screenshot file"
        aria-invalid={error ? true : undefined}
        disabled={busy}
        onChange={(event) => {
          accept(event.target.files?.[0]);
          event.target.value = "";
        }}
      />

      {compact ? (
        <>
          <ImageIcon />
          <p className="text-xs font-medium text-zinc-200">
            {over ? "Release to replace" : "Drop a screenshot to replace"}
          </p>
          <button
            type="button"
            className="btn btn-secondary ml-auto h-8 text-xs"
            onClick={() => ref.current?.click()}
          >
            Browse
          </button>
        </>
      ) : (
        <>
          <ImageIcon />
          <p className="text-sm font-medium text-zinc-200">
            {over ? "Release to analyse" : "Drop a screenshot here"}
          </p>
          <p className="max-w-xs text-xs leading-relaxed text-zinc-400">
            PNG, JPG, WebP or GIF up to {formatBytes(MAX_FILE_BYTES)}. Everything is analysed in
            your browser, nothing is uploaded.
          </p>
          <button
            type="button"
            className="btn btn-primary mt-1"
            onClick={() => ref.current?.click()}
          >
            Choose file
          </button>
        </>
      )}

      {error && (
        <p role="alert" className="w-full text-xs leading-relaxed text-rose-300">
          {error}
        </p>
      )}
    </div>
  );
}