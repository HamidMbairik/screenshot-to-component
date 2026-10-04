import { useEffect, useRef, useState } from "react";
import type { GenerationResult, UIScreen } from "../core/types";
import { copyText, downloadText } from "../lib/files";
import { CheckIcon, CodeIcon, CopyIcon, DownloadIcon } from "./icons";

export function CodePanel({
  result,
  screen,
}: {
  result: GenerationResult | null;
  screen: UIScreen | null;
}) {
  const [active, setActive] = useState(0);
  const [copyState, setCopyState] = useState<"idle" | "done" | "failed">("idle");
  const tabsRef = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    setActive(0);
    setCopyState("idle");
  }, [result]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  if (!result || result.files.length === 0) {
    return (
      <section className="flex min-h-[60vh] items-center justify-center p-10 lg:min-h-0 lg:border-l lg:border-zinc-800">
        <div className="flex max-w-xs flex-col items-center gap-3 text-center">
          <CodeIcon />
          <h2 className="text-sm font-medium text-zinc-200">No components yet</h2>
          <p className="text-xs leading-relaxed text-zinc-400">
            Generated React components will appear here as tabs, ready to copy or download.
          </p>
        </div>
      </section>
    );
  }

  const files = result.files;
  const file = files[active] ?? files[0];

  async function copy() {
    const ok = await copyText(file.contents);
    setCopyState(ok ? "done" : "failed");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopyState("idle"), 1500);
  }

  function select(index: number) {
    setActive(index);
    tabsRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[index]?.focus();
  }

  function onKeyDown(event: React.KeyboardEvent) {
    const count = files.length;
    const moves: Record<string, number> = {
      ArrowRight: (active + 1) % count,
      ArrowLeft: (active - 1 + count) % count,
      Home: 0,
      End: count - 1,
    };
    const next = moves[event.key];
    if (next === undefined) return;
    event.preventDefault();
    select(next);
  }

  return (
    <section className="flex min-h-[60vh] flex-col lg:min-h-0 lg:border-l lg:border-zinc-800">
      <div className="flex h-10 shrink-0 items-stretch border-b border-zinc-800 bg-zinc-900/60">
        <div
          ref={tabsRef}
          role="tablist"
          aria-label="Generated files"
          onKeyDown={onKeyDown}
          className="flex min-w-0 flex-1 items-stretch gap-1 overflow-x-auto px-2"
        >
          {files.map((entry, index) => (
            <button
              key={entry.path}
              role="tab"
              type="button"
              id={`tab-${index}`}
              aria-selected={index === active}
              tabIndex={index === active ? 0 : -1}
              onClick={() => setActive(index)}
              title={entry.path}
              className={`max-w-56 shrink-0 truncate px-3 text-xs font-medium transition-colors hover:bg-zinc-800 hover:text-zinc-100 ${
                index === active ? "bg-zinc-950 text-zinc-50" : "text-zinc-400"
              }`}
            >
              {entry.path.split("/").pop()}
            </button>
          ))}
        </div>

        <div className="flex shrink-0 items-center gap-1 border-l border-zinc-800 px-2">
          <button
            type="button"
            className="btn btn-secondary h-8 text-xs"
            onClick={() => void copy()}
          >
            {copyState === "done" ? <CheckIcon /> : <CopyIcon />}
            {copyState === "done" ? "Copied" : copyState === "failed" ? "Press Ctrl+C" : "Copy"}
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => downloadText(file.path, file.contents)}
          >
            <DownloadIcon />
            <span className="sr-only">Download {file.path}</span>
          </button>
        </div>
      </div>

      <div
        role="tabpanel"
        id={`panel-${active}`}
        aria-labelledby={`tab-${active}`}
        tabIndex={0}
        aria-label={`Source of ${file.path}`}
        className="flex min-h-0 flex-1 overflow-auto bg-zinc-950"
      >
        <div className="flex min-w-max">
          <div
            aria-hidden="true"
            className="sticky left-0 shrink-0 border-r border-zinc-800/70 px-3 py-4 text-right font-mono text-[13px] leading-5 tabular-nums text-zinc-600"
          >
            {file.contents.split("\n").map((_, index) => (
              <div key={index}>{index + 1}</div>
            ))}
          </div>
          <pre className="px-4 py-4 font-mono text-[13px] leading-5 text-zinc-200">
            <code>{file.contents}</code>
          </pre>
        </div>
      </div>

      <footer className="shrink-0 border-t border-zinc-800 px-4 py-2 text-[11px] text-zinc-400">
        {screen && <p className="mb-1">Analysed at {screen.width}×{screen.height}.</p>}
        <ul className="flex flex-col gap-0.5">
          {result.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </footer>

      <span role="status" aria-live="polite" className="sr-only">
        {copyState === "done" ? `Copied ${file.path} to clipboard` : ""}
      </span>
    </section>
  );
}