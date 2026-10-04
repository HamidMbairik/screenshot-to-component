import { useCallback, useEffect, useRef, useState } from "react";
import { analyseScreenshot } from "./core/analysis/analyse";
import { generate } from "./core/generate/generate";
import type { GenerationResult, UIScreen } from "./core/types";
import { CodePanel } from "./components/CodePanel";
import { Dropzone } from "./components/Dropzone";
import { StructurePanel } from "./components/StructurePanel";
import { TopBar, type Status } from "./components/TopBar";
import { loadImage, type LoadedImage } from "./lib/image";

export default function App() {
  const [image, setImage] = useState<LoadedImage | null>(null);
  const [status, setStatus] = useState<Status>("empty");
  const [stage, setStage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [screen, setScreen] = useState<UIScreen | null>(null);
  const [generated, setGenerated] = useState<GenerationResult | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Object URLs are released when they are replaced or the component unmounts.
  // Revoking inside a setState updater would run twice under StrictMode.
  useEffect(() => {
    if (!image) return;
    return () => URL.revokeObjectURL(image.url);
  }, [image]);

  const accept = useCallback(async (file: File) => {
    setError(null);
    const result = await loadImage(file);
    if (!result.ok) {
      setStatus("error");
      setError(result.error);
      setAnnouncement(result.error);
      return;
    }

    setImage(result.image);
    setScreen(null);
    setGenerated(null);
    setStatus("ready");
    setAnnouncement(
      `Loaded ${result.image.name}, ${result.image.width} by ${result.image.height}.`,
    );
  }, []);

  const reset = useCallback(() => {
    setImage(null);
    setScreen(null);
    setGenerated(null);
    setStatus("empty");
    setStage("");
    setError(null);
    setAnnouncement("Cleared.");
  }, []);

  const analyse = useCallback(async () => {
    if (!image) return;
    setStatus("analysing");
    setStage("Reading pixels");
    setError(null);

    try {
      const analysed = await analyseScreenshot(image.bitmap, setStage);
      const output = generate(analysed);
      setScreen(analysed);
      setGenerated(output);
      setStatus("done");
      setAnnouncement(
        `Analysed ${analysed.stats.sections} sections and ${analysed.stats.regions} regions in ${analysed.stats.durationMs} milliseconds. Generated ${output.files.length} files.`,
      );
    } catch (cause) {
      setStatus("error");
      setStage("");
      const message = cause instanceof Error ? cause.message : "Analysis failed unexpectedly.";
      setError(message);
      setAnnouncement(message);
    }
  }, [image]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        void analyse();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [analyse]);

  // Without this a drop anywhere outside the dropzone makes the browser navigate
  // to the file, which throws the whole app away.
  useEffect(() => {
    function prevent(event: DragEvent) {
      if (event.dataTransfer?.types.includes("Files")) event.preventDefault();
    }
    window.addEventListener("dragover", prevent);
    window.addEventListener("drop", prevent);
    return () => {
      window.removeEventListener("dragover", prevent);
      window.removeEventListener("drop", prevent);
    };
  }, []);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-zinc-950">
      <TopBar
        image={image}
        status={status}
        onAnalyse={() => void analyse()}
        onReset={reset}
        onReplace={() => inputRef.current?.click()}
      />

      <main className="min-h-0 flex-1 overflow-y-auto lg:grid lg:grid-cols-[24rem_1fr] lg:overflow-hidden">
        <section className="flex flex-col border-b border-zinc-800 lg:overflow-y-auto lg:border-r lg:border-b-0">
          <div className="p-4">
            {!image ? (
              <Dropzone ref={inputRef} onFile={accept} busy={status === "analysing"} error={error} />
            ) : (
              <div className="flex flex-col gap-3">
                <figure className="grid h-40 place-items-center overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900">
                  <img
                    src={image.url}
                    alt={`Screenshot ${image.name}`}
                    className="max-h-full max-w-full object-contain"
                  />
                </figure>
                <Dropzone
                  ref={inputRef}
                  variant="compact"
                  onFile={accept}
                  busy={status === "analysing"}
                  error={error}
                />
                <StatusLine status={status} stage={stage} screen={screen} />
              </div>
            )}
          </div>

          <StructurePanel screen={screen} />
        </section>

        <CodePanel result={generated} screen={screen} />
      </main>

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}

function StatusLine({
  status,
  stage,
  screen,
}: {
  status: Status;
  stage: string;
  screen: UIScreen | null;
}) {
  if (status === "analysing") {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-xs text-zinc-400">{stage}</p>
        <div className="h-1 w-full overflow-hidden rounded-full bg-zinc-800">
          <div className="sweep h-1 w-1/3 rounded-full bg-sky-500" />
        </div>
      </div>
    );
  }

  if (status === "done" && screen) {
    return (
      <p className="font-mono text-[11px] tabular-nums text-zinc-400">
        {screen.stats.sections} sections · {screen.stats.regions} regions ·{" "}
        {screen.stats.durationMs} ms
      </p>
    );
  }

  return null;
}