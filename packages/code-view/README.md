# @git-manager/code-view

Generic, host-agnostic multi-panel code viewer / conflict resolver (Monaco-based), extracted
from the desktop app's 3-way merge editor. No Tauri/SWR/store dependency — everything
app-specific is injected through props.

## Usage

```tsx
import { ConflictResolver } from '@git-manager/code-view'
import '@git-manager/code-view/styles.css'

// 2 panels = side-by-side diff (block geometry computed live by Monaco's diff engine)
<ConflictResolver
  panels={[{ content: original }, { content: modified }]}
  modelPathPrefix="src/client.ts"
/>

// 3 panels = full merge view (incoming | editable result | current), driven by `blocks`
<ConflictResolver
  ref={resolverRef}
  panels={[
    { content: theirsText, status: <span>Incoming</span> },
    { status: <span>Result</span> },          // content derived from `blocks`
    { content: oursText, status: <span>Current</span> },
  ]}
  blocks={mergeBlocks}                        // structural match of git-types' MergeBlock
  modelPathPrefix={`${repoPath}/${filePath}`}
  header={{ whitespace: false }}              // per-button toggles, or `false` to hide
  onAutoMerge={() => fetchAutoMergedText()}   // wand button (hidden when not wired)
  onRecalculate={() => revalidate()}          // recalculate button (hidden when not wired)
  editor={{
    component: MySharedLazyMonaco,            // defaults to @monaco-editor/react
    language: 'typescript',
    theme: 'my-theme',
    onEditorMount: (editor, monaco) => {/* register custom themes, ... */},
  }}
/>
```

The imperative ref exposes `getCenterValue`, `applyAutoMerge`, `acceptLeft`, `acceptRight`,
`goToNextChange`, `goToPreviousChange`.

The desktop app's thin binding lives in
`apps/desktop/src/components/merge-editor/ThreeWayMergeEditor.tsx` (wires the auto-merge Tauri
command, SWR revalidation, rebase-state header statuses and the app's dynamic Monaco theme).

## Styling

Components use Tailwind utility classes: consumers must include `src/**/*.{ts,tsx}` of this
package in their Tailwind `content` globs (the desktop app does), plus the theme tokens
(`--foreground`, `--muted-foreground`, …) from `@git-manager/ui/globals.css`. The
merge-specific classes (block fills, connector ribbons, action buttons) ship in
`@git-manager/code-view/styles.css`.

## Development

```bash
pnpm --filter @git-manager/code-view test        # vitest unit tests (block layout, decorations, …)
pnpm --filter @git-manager/code-view storybook   # play with the component at http://localhost:6006
pnpm --filter @git-manager/code-view test:e2e    # Playwright suite against Storybook (starts it itself)
```

First e2e run needs the browser once: `npx playwright install chromium` from this package.

### Visual regression

`e2e/visual.spec.ts` compares screenshots against committed baselines
(`e2e/visual.spec.ts-snapshots/`): one per story (catches unintended restyling between two
versions) and one per user action — accept a conflict side, accept an incoming addition, wand
auto-merge, and reset (which must reproduce the pristine baseline pixel-for-pixel). Monaco's
non-deterministic chrome (cursor blink, current-line highlight, scrollbars) is stripped during
capture by `e2e/screenshot.css`.

When a visual change is intentional, regenerate the baselines and commit them:

```bash
npx playwright test --update-snapshots
```

Baselines are platform-suffixed (`-darwin`, `-linux`, …); only run/regenerate them on a
platform whose baselines are committed, or Playwright will write a new set on first run.
