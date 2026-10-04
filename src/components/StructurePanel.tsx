import { useState } from "react";
import type { RegionKind, UIScreen } from "../core/types";
import { ChevronIcon } from "./icons";

const KIND_STYLE: Record<RegionKind, string> = {
  text: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  image: "border-violet-500/40 bg-violet-500/10 text-violet-300",
  button: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  divider: "border-zinc-700 bg-zinc-800 text-zinc-400",
  block: "border-zinc-700 bg-zinc-800 text-zinc-300",
};

export function StructurePanel({ screen }: { screen: UIScreen | null }) {
  if (!screen) {
    return (
      <div className="border-t border-zinc-800 p-4">
        <h2 className="text-xs font-medium text-zinc-300">Detected structure</h2>
        <p className="mt-2 text-xs leading-relaxed text-zinc-400">
          Run an analysis to see the regions this tool found and how it grouped them.
        </p>
      </div>
    );
  }

  return (
    <div className="border-t border-zinc-800 p-4">
      <h2 className="mb-2 text-xs font-medium text-zinc-300">Detected structure</h2>
      <SectionList screen={screen} />

      <h3 className="mt-4 mb-2 text-xs font-medium text-zinc-300">Palette</h3>
      <ul className="flex flex-wrap gap-2">
        {screen.palette.map((hex) => (
          <li key={hex} className="flex items-center gap-1.5">
            <span
              className="h-4 w-4 rounded border border-zinc-800"
              style={{ backgroundColor: hex }}
            />
            <span className="font-mono text-[11px] tabular-nums text-zinc-400">{hex}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * A nested list with disclosure buttons. A real `role="tree"` would need roving
 * tabindex and four arrow-key behaviours for no gain here, since the code panel
 * already carries the same structure.
 */
function SectionList({ screen }: { screen: UIScreen }) {
  const [open, setOpen] = useState<Record<number, boolean>>({});

  return (
    <ul className="flex flex-col gap-1">
      {screen.sections.map((section) => {
        const expanded = open[section.index] ?? section.index === 0;
        return (
          <li key={section.index}>
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() =>
                setOpen((previous) => ({ ...previous, [section.index]: !expanded }))
              }
              className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-[13px] text-zinc-100 hover:bg-zinc-800"
            >
              <ChevronIcon
                className={`shrink-0 text-zinc-500 transition-transform ${
                  expanded ? "rotate-90" : ""
                }`}
              />
              <span className="truncate">
                Section {section.index + 1}
                <span className="text-zinc-400"> · {section.align}</span>
              </span>
              <span className="ml-auto shrink-0 font-mono text-[11px] tabular-nums text-zinc-400">
                {section.regions.length} regions
              </span>
            </button>

            {expanded && (
              <ul className="ml-2 flex flex-col gap-0.5 border-l border-zinc-800 pl-2">
                {section.regions.map((region, index) => (
                  <li key={index} className="flex items-center gap-2 py-0.5 text-[13px]">
                    <span
                      className={`shrink-0 rounded border px-1.5 font-mono text-[11px] leading-[18px] ${KIND_STYLE[region.kind]}`}
                    >
                      {region.kind}
                    </span>
                    <span className="shrink-0 font-mono text-[11px] tabular-nums text-zinc-400">
                      {region.bounds.width}×{region.bounds.height}
                      {region.text
                        ? ` · ${region.text.fontSize}px/${region.text.fontWeight}`
                        : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}