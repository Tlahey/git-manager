# @git-manager/docs

The whole public site (English only), published to
`https://tlahey.github.io/git-manager/`: **the landing page at the root and the
documentation under `/docs/`**, built as one [VitePress](https://vitepress.dev)
app and deployed as one GitHub Pages artifact.

The **feature pages are generated**, not written here: they are rendered from
the `@doc`-tagged scenarios of the end-to-end suite in
[`apps/e2e/features`](../e2e/features), illustrated with the screenshots those
same scenarios export from the running app.

```
apps/e2e/features/*.feature   (prose + steps, hand-written, reviewed, committed)
docs/screenshots/*.png        (exported by the e2e suite from the real app)
        │
        ▼  scripts/generate.ts — deterministic, no LLM
apps/docs/docs/features/*.md  +  .vitepress/sidebar.json
        │
        ▼  vitepress build   (+ index.md → the landing page,
.vitepress/dist                  + docs/index.md → the introduction,
        │                         + docs/download.md → the install guide)
        ▼
the pages artifact
```

A handful of Markdown files are **not** generated and are edited by hand — the pages with
nothing to run a scenario against: [`index.md`](./index.md) (the landing page host),
[`docs/index.md`](./docs/index.md) (the documentation's introduction),
[`docs/download.md`](./docs/download.md) (how to get the app),
[`docs/privacy.md`](./docs/privacy.md) (what can leave the machine, exhaustively),
[`docs/ai-setup.md`](./docs/ai-setup.md) (pointing the app at Ollama or any OpenAI-compatible
endpoint), [`docs/shortcuts.md`](./docs/shortcuts.md) (the keyboard reference — check
`useKeyboardShortcuts.ts` before editing it, that hook is the source of truth) and
[`docs/troubleshooting.md`](./docs/troubleshooting.md). They are linked from the hand-curated
sections of `.vitepress/config.ts`'s sidebar. Only `docs/features/` is wiped and rewritten on
each run.

## The home page is the landing page

`index.md` sets `layout: false` and renders `<LandingPage />`, which pulls the
markup, the stylesheet and the behaviour straight out of
[`apps/landing-page`](../landing-page) — the markup as a raw `?raw` import of its
`index.html`, so there is no second copy to keep in sync. That package is still
where you edit the landing page; this one only hosts it.

Four things make that work, and they are the parts to be careful with:

- **The landing stylesheet is never bundled.** The generator publishes it as a
  hashed standalone file and only the home page links it (`transformHtml` in the
  config, plus `LandingPage.vue` for client-side navigation). This is not an
  optimisation: that stylesheet styles generic class names, and VitePress puts
  `class="nav"` on the documentation sidebar — bundled site-wide, its
  `.nav { position: fixed }` tore the sidebar out of the page.
- **`html.landing`** gates the handful of rules in it that reach outside the
  landing markup (the `*` reset, the body background, the scrollbars). It is
  belt-and-braces now that the file is isolated, and it is what lets the
  standalone app and this one share the exact same stylesheet. Note the
  `:where()` around the gate on the reset: without it the selector outranks
  every single-class rule in the file and flattens the whole layout.
- **`initLanding()` returns a teardown.** The docs are a single-page app, so the
  landing page can be navigated away from, and its observers, bubble interval
  and animation frame have to stop when it is.
- **The mascot and the behaviour are imported inside `onMounted`.** Registering
  a custom element and reading layout geometry both need a browser; VitePress
  renders these pages in Node.

`/docs/` is the introduction — what the documentation covers, how to read it, and
why its screenshots can be trusted — so a reader arrives somewhere that explains
itself rather than in the middle of one feature.

The site is `appearance: 'dark'`: dark on a first visit whatever the reader's OS
prefers, with the theme switch kept. The home page stays dark either way — it is
the marketing landing page, whose stylesheet is gated on `html.landing` rather
than on `.dark`, and which has no light design.

Both themes are checked against WCAG AA. Watch `--vp-c-text-3` in particular: it
is VitePress's _placeholder_ grey and lands at 3.1:1 on the light background, so
anything meant to be read (the screenshot captions, the source footnote) uses
`--vp-c-text-2`.

## Image zoom

Every screenshot in a feature page click-to-zooms via `medium-zoom`, wired up in
`.vitepress/theme/index.ts`'s `setup()` (scoped to `.vp-doc img`, VitePress's own
markdown-content wrapper). That scope is deliberate: the landing page renders
with `layout: false` and never gets wrapped in `.vp-doc`, so its own images
(the mascot, the feature previews) are correctly left un-zoomable — they're
decorative, not documentation to inspect closely. Re-initialized on every route
change, since VitePress is an SPA and a `mounted` hook alone would only ever see
the first page's images.

## Per-page feedback link

Every content page ends with a **Report a documentation issue** link
(`DocFeedback.vue`), pointed at `.github/ISSUE_TEMPLATE/doc-feedback.yml`
(labels: `documentation`, `feedback`) with the page's own URL pre-filled.

It is injected once, in `.vitepress/theme/index.ts`, via the default theme's
`doc-after` layout slot — not written into a page or into `renderDocPage.ts`.
That is what makes it show up on the hand-written `docs/index.md` /
`docs/download.md` _and_ every generated feature page without a per-page
change, and survive `docs/features/*.md` being wiped and rewritten on every
`pnpm generate`. The landing page (`index.md`, `layout: false`) never renders
this Layout, so it correctly has no feedback link.

## Commands

```bash
pnpm --filter @git-manager/docs dev        # generate, then serve on :5173
pnpm --filter @git-manager/docs build      # generate, then build to .vitepress/dist
pnpm --filter @git-manager/docs generate   # just regenerate the pages
pnpm --filter @git-manager/docs test       # unit tests for the generator
```

Everything the generator writes — `docs/`, `public/`, `.vitepress/sidebar.json` —
is git-ignored and rebuilt on every run. Editing a generated `.md` is pointless;
the next `dev`/`build` overwrites it. (`index.md`, the landing page, is a source
file and is committed.)

## Documenting a feature

1. **Tag the scenario.** Add `@doc` to a scenario in its `.feature` file. Add
   `@screenshots` too if it exports a picture. Regression edge cases stay
   untagged and out of the docs.

2. **Write the prose in the scenario's description block** — the free text
   between the `Scenario:` line and the first step. This is the paragraph the
   reader gets, and it is what a reviewer reviews. A `@doc` scenario without one
   fails the generator on purpose: a page with steps and no explanation is worse
   than no page.

   The `Feature:` description works the same way and becomes the page intro. The
   conventional `As a … / I want … / So that …` lines are dropped from it, so
   they can stay for the test suite's sake — write the doc paragraph below them.

3. **End with the screenshot step**, which both exports the PNG and tells the
   generator which one belongs to the page:

   ```gherkin
   Then a full-window screenshot is saved as "doc-merge-editor"
   ```

   Name them `doc-*` by convention. Also seed the language first — the app
   defaults to French and the docs are English:

   ```gherkin
   Given the app language is English
   ```

4. **Place the page** in [`docs.config.ts`](./docs.config.ts). A feature no
   section claims still appears, under "More features", so forgetting this is
   visible rather than silent.

5. **Capture the screenshots** and commit them:

   ```bash
   pnpm build:e2e
   pnpm --filter @git-manager/e2e docs:screenshots
   ```

   The PNGs land in `docs/screenshots/` and **are** committed — the deploy
   workflow runs the generator with `--strict`, which fails rather than publish a
   page missing its picture.

## What the generator does with the steps

Not every Gherkin step means something to a reader, so they are sorted by shape:

| Step                                 | Renders as                                  |
| ------------------------------------ | ------------------------------------------- |
| `Given …`                            | dropped — it builds the test's fixture repo |
| `When I click the …`                 | a numbered instruction ("Click the …")      |
| `When the interface has settled`     | dropped — a test-timing step, not an action |
| `Then the merge editor is shown`     | a "You should see" bullet                   |
| `Then a full-window screenshot is …` | the page's image                            |

The rule is mechanical: a step is an instruction when it is phrased in the first
person (`I …`). Keep writing steps that way and the docs follow.

## Why generated

Screenshots and step lists are exactly the parts of documentation that rot
quietly. Tying them to a test that has to keep passing means a page can only
describe a UI that still exists. Prose is the opposite — it needs intent a test
cannot state — so it stays hand-written, reviewed, and versioned in the file it
describes.

No model runs at build time. An LLM is a fine way to _draft_ a scenario's
description; what ships is what a human edited and committed.
