# Contributing

Thanks for taking a look. This project is early, so small focused pull
requests are far more useful than large ones.

## Getting set up

```bash
git clone https://github.com/HamidMbairik/screenshot-to-component.git
cd screenshot-to-component
npm install
npm run dev
```

Node 20.19 or newer. There is nothing else to configure: no API keys, no
`.env`, no backend. Analysis runs in the browser.

## Before you open a pull request

```bash
npm run check
```

That runs lint, tests and the production build. All three have to pass. If you
added a heuristic, add a test for it in the same commit.

## Where things live

```text
src/core/types.ts      the intermediate representation
src/core/analysis/     pixels in, UIScreen out
src/core/generate/     UIScreen in, files out
src/components/        the tool's own UI
```

The one rule worth knowing: `analysis` must not import from `generate`, and
`generate` must not touch pixels. If a change seems to need that, the
intermediate representation is probably missing a field.

## Adding an analysis heuristic

Heuristics are cheap to add and easy to get wrong, so:

1. Put the measurement in `analysis/` as a pure function over a `Bitmap`.
2. Return numbers, not strings. Formatting belongs in `generate/`.
3. Add a test that builds a synthetic bitmap with `Uint8ClampedArray`. You do
   not need a real screenshot, and you should not commit one.
4. Keep it deterministic. If you introduce randomness, seed it and say so.

Thresholds live in named constants at the top of the file with a one-line note
on what they trade off. If you cannot explain a number, do not add it.

## Adding a generated output feature

The generated code should read like something a person would have written.
Concretely:

- Semantic elements over `div`. `section`, `h2`, `p`, `button`, `hr`.
- One component per detected section. Resist merging them.
- No component over roughly 150 lines.
- Emit the measured value rather than a guessed clean one when snapping to the
  Tailwind scale would misrepresent it.
- If you are not confident about something, leave it out and say so in the
  generated `README.md`. Inventing a detail is worse than omitting it.

## Style

Boring where boring is fine. Named functions over factories, no plugin
registries, no abstractions with a single call site, and comments that explain
*why* rather than restate the code.

## Reporting a bug

Include the screenshot dimensions and what you expected the tool to detect
versus what it did. A screenshot is very welcome, but check the file size first.

## Licence

Contributions are accepted under the [MIT licence](LICENSE).