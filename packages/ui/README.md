# @git-manager/ui

Shared shadcn/ui + Radix component library (Tailwind-based). Components live in
`src/components/`, are re-exported from `src/index.ts`, and consume the design
tokens owned by [`@git-manager/theme`](../theme) via `hsl(var(--token))`.

## Commands

```bash
pnpm --filter @git-manager/ui typecheck      # tsc --noEmit over src
pnpm --filter @git-manager/ui test           # unit tests (jsdom) — the default
pnpm --filter @git-manager/ui test:watch     # unit tests, watch mode
pnpm --filter @git-manager/ui test:storybook # WCAG (axe) on every story (real browser)
pnpm --filter @git-manager/ui test:apca      # APCA Bronze theme × surface matrix (real browser)
pnpm --filter @git-manager/ui test:stories   # both of the above
pnpm --filter @git-manager/ui storybook      # component showcase (dev, port 6009)
pnpm --filter @git-manager/ui build-storybook
```

## Testing overview

There are **four complementary layers**. Three live here; the fourth lives in
`@git-manager/theme` and is noted below so the whole picture is in one place.

Tests run on [Vitest](https://vitest.dev). [`vitest.config.ts`](vitest.config.ts)
declares the `unit` and `storybook` projects; the APCA matrix has its own config
([`vitest.apca.config.ts`](vitest.apca.config.ts)) because Vitest allows one
chromium browser project per config and the two browser suites configure axe
differently:

| Project | Command | Environment | What it checks |
| --- | --- | --- | --- |
| `unit` | `pnpm test` | jsdom | Component behaviour + rendered classes |
| `storybook` | `pnpm test:storybook` | real headless browser | WCAG 2.x (axe) on every story, default theme |
| `apca` | `pnpm test:apca` | real headless browser | APCA Bronze on every theme × surface |

### 1. Unit tests — behaviour & markup (jsdom)

- Co-located with each component as `src/components/<name>.test.tsx`, run via
  `@testing-library/react` + `@testing-library/jest-dom`.
- They assert **behaviour** (clicks, `onChange`, disabled, `aria-pressed`, ref
  forwarding) and, where a token is load-bearing, the **rendered classes** — e.g.
  the default `Button`/`Badge` ride the component tokens (`bg-button` /
  `bg-badge`), not raw `bg-primary`.
- Setup ([`vitest.setup.ts`](vitest.setup.ts)) registers jest-dom matchers,
  auto-`cleanup()`s, and stubs `ResizeObserver` + `Element.scrollIntoView`, which
  jsdom lacks but `cmdk` (the `Command` palette) needs.
- **`src/globals.test.ts` is special**: jsdom doesn't apply real stylesheets, so
  instead of rendering it reads `globals.css` and asserts the `.chrome-surface`
  contract (re-anchors `color`, remaps the surface + component tokens to the
  sidebar family). It's a CSS-contract regression guard.

This project has **no browser dependency** — `pnpm test` is safe on any machine
and is what CI/turbo runs.

### 2. WCAG story tests — axe on every story (real browser)

`pnpm test:storybook` runs **every Storybook story in a real (headless) Chromium**
and runs [axe-core](https://github.com/dequelabs/axe-core) on each (at the default
theme/surface), failing on violations. This is the same axe run the Storybook
**Accessibility panel** shows — so it catches what jsdom can't: **rendered
contrast**, `/opacity` blending, non-token colours, and tokens used outside their
intended pairing.

It's wired with the official **Storybook Test addon**, not a hand-rolled script:

- [`@storybook/addon-vitest`](https://storybook.js.org/docs/writing-tests/integrations/vitest-addon)
  + `@storybook/addon-a11y` are registered in
  [`.storybook/main.ts`](.storybook/main.ts).
- [`.storybook/preview.tsx`](.storybook/preview.tsx) sets `a11y: { test: 'error' }`
  (fail on violations — switch to `'todo'` to report without failing while
  triaging). It also exposes two toolbars: **Theme** (every built-in theme) and
  **Surface** (`background` / `card` / `popover` / `sidebar-chrome`), so a
  component is auditable on any theme × surface. When browsing Storybook (not in
  test runs) it also registers **APCA Bronze** into the a11y addon via
  `@git-manager/storybook-a11y/preview-apca`, so the Accessibility panel reports
  both WCAG 2.x and APCA.
- The `storybook` Vitest project uses `storybookTest` from
  `@storybook/addon-vitest/vitest-plugin`, which applies the preview + addon
  annotations itself (Storybook ≥ 10.3). Don't add a manual
  `setProjectAnnotations` setup file to this project — it *replaces* that set and
  silently disables the addon-a11y checks.

### 3. APCA matrix — every theme × surface (real browser)

`pnpm test:apca` renders the `Components/Overview` story on **every theme ×
surface** (via [`stories/a11yMatrix.test.tsx`](stories/a11yMatrix.test.tsx) →
`runA11yMatrix` from `@git-manager/storybook-a11y/testing`) and grades the real
pixels with **APCA Bronze** ([apca-check](https://github.com/StackExchange/apca-check),
the WCAG 3 draft perceptual contrast algorithm — font-size/weight aware, catches
what WCAG 2.x misses). WCAG's `color-contrast` rule is disabled there so each
pixel is graded once, by APCA.

Besides the per-node Vitest output, a custom reporter writes a comparable
**theme × surface artifact** to `a11y-report/apca-report.json` + `.md`
(gitignored): a failing-node count matrix plus per-cell node details (Lc, fg/bg,
font size/weight, selector).

**One-time prerequisite for both browser suites** (needs a browser binary):

```bash
pnpm --filter @git-manager/ui exec playwright install chromium
```

The APCA matrix is expected to be **red** until the themes are fixed — it lists
the real violations. Fix them at the source (a token, a component class), not by
suppressing the rule.

### 4. Contrast matrix — every theme × every pair (in `@git-manager/theme`)

Browser axe audits the *current* theme/surface of each rendered story. The
exhaustive contrast coverage lives next door, in the theme package, and runs
without a browser:

```bash
pnpm --filter @git-manager/theme test:a11y
```

It grades **every theme × every token pair** (semantic + Tier-3 component tokens
like `button`/`badge`) with `evaluateThemeContrast` / `evaluateComponentContrast`
(WCAG ratios and token-level APCA Lc). Use it as the fast, browser-less
source of truth for token-level contrast; use `test:storybook` / `test:apca` for
rendered-DOM findings. They're complementary — green in one doesn't imply green in
the other (a rendered element can use a colour that isn't a graded token pair).

## Storybook (the showcase)

`pnpm storybook` opens the component gallery (`Components/Overview`) with the
Theme + Surface toolbars. Tailwind is wired for it via
[`tailwind.config.js`](tailwind.config.js) + [`postcss.config.js`](postcss.config.js),
and the preview imports [`src/globals.css`](src/globals.css) — the app's actual
stylesheet — so components render with real utilities against the selected theme.
