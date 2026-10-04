# Screenshot to Component

Turn a screenshot of a web UI into an editable React + TypeScript + Tailwind
implementation. Everything runs in your browser: no API keys, no network calls,
no model.

> **Status: early.** The analysis is deterministic pixel work, so it recovers
> layout, spacing, colour and type scale. It does not read your text, recover
> icons, or fetch images. See [Limitations](#limitations).

## Quick start

```bash
npm install
npm run dev
```

Then drop a PNG, JPG, WebP or GIF onto the drop zone in the left panel and
press **Analyse** (or `Ctrl`/`Cmd`+`Enter`).

## Scripts

| Script              | What it does                    |
| ------------------- | ------------------------------- |
| `npm run dev`       | Start the dev server            |
| `npm run build`     | Type-check and build for prod   |
| `npm run typecheck` | Type-check only                 |
| `npm run preview`   | Serve the production build      |
| `npm run lint`      | ESLint                          |
| `npm run test`      | Vitest, single run              |
| `npm run test:watch`| Vitest in watch mode            |
| `npm run check`     | lint + test + build             |

## How it works

The pipeline is deliberately split so that pixel analysis and code generation
can evolve independently:

```text
screenshot file
   │
   ├─ decode + downscale          src/lib/image.ts
   │
   ▼
Bitmap  { data: Uint8ClampedArray, width, height }
   │
   ├─ page background, content mask, blank-band and XY-cut
   │  segmentation, region classification
   │                              src/core/analysis/
   │
   ▼
UIScreen  (intermediate representation)
   │
   ├─ IR → JSX + Tailwind        src/core/generate/
   │
   ▼
GeneratedFile[]  →  code viewer, copy, download
```

Nothing in `src/core/analysis` knows about JSX, and nothing in
`src/core/generate` touches pixels. The intermediate representation
(`UIScreen` in [`src/core/types.ts`](src/core/types.ts)) is the contract.

### Intermediate representation

```ts
type UIScreen = {
  width: number;
  height: number;
  background: string;
  palette: string[];
  sections: UISection[];
  stats: { regions: number; sections: number; durationMs: number };
};
```

`width` and `height` are the analysis size, not the file you dropped. Large
screenshots are downscaled to 1600px on the long edge first, so every measurement
below is in analysis pixels.

Each section carries its measured bounds, the blank gap above it, its
alignment and a list of leaf regions (`text`, `image`, `button`, `divider`,
`block`) with their own bounds and measured typography.

### How analysis works

1. The median colour of the four edges is taken as the page background. Fully
   transparent pixels are ignored, so a transparent PNG is not read as a black
   page.
2. Every pixel that differs from it is marked as content. Padding and margins
   are simply the parts of the image with no content.
3. Runs of content rows become sections. Blank rows between them are the gaps.
4. Inside a section, blank columns are cut first, then blank rows within each
   column. That is a classic XY-cut, and it finds columns and stacks without
   knowing anything about the DOM.
5. Each leaf is classified from its own pixels: fill uniformity and a centred
   ink block for buttons, ink fraction and ink colour count for text, colour
   count for imagery.

## Architecture

```text
src/
  core/
    types.ts            IR shared by analysis and generation
    analysis/
      color.ts          colour distance, contrast, medians
      segments.ts       content mask, ink measures, XY-cut
      regions.ts        region classification and measurement
      analyse.ts        pipeline entry point
      fixtures.ts       synthetic bitmaps for tests
    generate/
      tailwind.ts       px → Tailwind class mapping
      generate.ts       IR → files
  components/           the tool's own UI
  lib/                  image decode, clipboard, file download
```

`src/core` is plain TypeScript with no DOM or React dependency, which is why the
tests run in a plain Node environment. The one DOM type it needs is `ImageData`,
so it declares a structural `Bitmap` instead and `src/lib/image.ts` satisfies it.

## Roadmap

- **M1.** Upload, preview, analysis, structure tree, generated code with copy
  and download. This is what exists now.
- **M2.** Visual comparison: overlay the screenshot against a rendered version of
  the generated markup and show a difference view.
- **M3.** Replace placeholder copy and image blocks; re-run analysis after edits.
- **M4.** Optional vision-model adapter behind a provider interface, for the
  cases where heuristics are not enough.

## Limitations

Honest list of what milestone 1 does not do:

- No OCR. Text is placeholder copy at the measured size, weight and colour.
- No icons, logos or images. Image regions become flat blocks with the sampled
  colour and the right aspect ratio.
- Font family is always the Tailwind UI sans stack, unless a monospace signal is
  detected. Serif and display faces are not distinguishable here.
- Shadows, borders and radii are not reconstructed. Only fill colours, spacing,
  type scale and weight come through.
- Breakpoints are inferred from the analysis width. Nothing is verified at more
  than one viewport size.
- Spacing is snapped to the Tailwind scale when that is within tolerance, and
  emitted as an arbitrary pixel value otherwise.
- Interactive states (hover, focus, open, loading) are not inferred. Only the
  resting state in the screenshot exists.
- The page background is the median colour of the four edges. A full-bleed
  image or video background is treated as content, not as the page.
- Columns are cut only where a blank gutter runs the full height of the section.
  A layout with no empty gutter is read as one column.
- Screenshots larger than 1600px are downscaled before analysis, so fine spacing
  in a very large capture is measured at a reduced resolution.

The output is an accurate first draft of the *skeleton*. Colours and spacing
should be close. Everything inside the boxes is invented.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT — see [LICENSE](LICENSE).