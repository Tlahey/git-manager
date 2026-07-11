---
name: reusable-components
description: Use whenever writing a new React component/hook in git-manager, or reviewing whether an existing one belongs in packages/components instead of apps/desktop. A component belongs in packages/components when it's purely presentational — no Tauri IPC (invoke/api/*.api.ts), no Zustand store, no SWR/react-query data-fetching hook, no app-specific domain type (Commit, Branch, Repo, PullRequest, StashEntry...) in its props — because that's what keeps it mountable and snapshot-testable in Storybook without faking half the app. Trigger this when: creating a component/hook that could plausibly be reused across features; noticing an existing component under apps/desktop/src/components or app/**/components that turns out to have no business logic and could be shared; the user asks "should this be shared", "can this go in packages/components", "why can't I use useTranslation/a store/invoke here"; or setting up/extending Storybook for packages/components (it has none yet, unlike packages/mascot and packages/code-view which already do).
---

# Reusable components boundary

## Why this boundary exists

`packages/components` is git-manager's shared, presentational component library. The payoff for
keeping it pure is concrete: a component with no Tauri IPC, no store, and no fetched data can be
mounted in Storybook from static props alone — no mocked `invoke()`, no store provider, no seeded
cache — which is what makes Storybook snapshots for it cheap and reliable. The moment a component
reaches into `invoke()`, a Zustand store, or a data-fetching hook, its story either breaks or has
to fake a slice of the app to render, and the reason it was extracted in the first place stops
holding.

## Where the line sits

- `packages/ui` already holds the low-level shadcn/Radix primitives (`Button`, `Dialog`, `Badge`,
  `DropdownMenu`...). `packages/components` sits one level up: composed, git-manager-flavored
  building blocks that are still generic enough to have no idea what a "commit" or a "branch" is —
  see [SplitButton.tsx](../../../packages/components/src/SplitButton.tsx),
  [StepRailRow.tsx](../../../packages/components/src/StepRailRow.tsx) and
  [useFileTree.ts](../../../packages/components/src/useFileTree.ts).
- `apps/desktop/src/components` and `apps/desktop/src/app/**/components` hold everything that
  *does* know about domain data, IPC, or business rules.

## Deciding if a component belongs in packages/components

Ask, in this order:

1. **Business logic check** — does it import from `apps/desktop/src/api/*.api.ts` or `lib/tauri.ts`
   (directly or transitively), a store from `apps/desktop/src/stores/*`, or a data-fetching hook
   (`useGitLog`, `useBranches`, `useCommitDiff`, ...)? If yes, it's app-specific — stop here, it
   stays in `apps/desktop`.
2. **Domain-type check** — does an exported prop type name a domain concept (`Commit`, `Branch`,
   `Repo`, `PullRequest`, `StashEntry`, `RebaseStep`...), or does the component branch on domain
   values (`if (commit.isMerge) ...`)? If the component needs to *understand* the data rather than
   just *display* what's handed to it, it's app-specific.
3. **Reuse check** — would this pattern make sense reused in an unrelated feature (a dropdown
   pattern used by both the commit list and the branch list, a draggable row rail used by both
   interactive-rebase and fixup planning)? If it's one-off UI for one feature, leave it where it is
   — don't force an early abstraction into `packages/components` just because it looks generic;
   a premature move is worse than leaving it in place until real reuse shows up.
4. **Storybook check** — could its story be written from static/mock props only, with nothing to
   mock? If you'd need to fake a Tauri call or app state to make the story render, it fails check 1
   and doesn't belong here.

If it passes all four, it's a `packages/components` candidate.

## What "no business logic" means, concretely

A component or hook in `packages/components` must not:

- import anything from `apps/desktop/src/api/*.api.ts` or `lib/tauri.ts`
- import a store from `apps/desktop/src/stores/*`
- call an SWR/react-query hook tied to fetched app data
- call `useTranslation()`/`t()` itself — text comes in as props (`label`, `title`, `badgeLabel`...),
  so the caller (which does have i18n) supplies the already-translated string. This is why
  `SplitButton` takes `label: string` instead of an i18n key.
- name a domain type in its exported props — use generic vocabulary instead. `useFileTree.ts`
  defines its own `FileTreeInputFile` (`path`/`status`/`additions`/`deletions`/`staged`) rather than
  importing the app's real diff-file type, precisely so the hook doesn't need to know what a git
  diff is.
- reach outside `@git-manager/ui` and generic presentational deps (e.g. `lucide-react`) for its
  dependencies — no imports from `apps/desktop` at all.

All interactivity goes through callback props (`onClick`, `onSelect`, `onDrop`, ...); the component
never decides what an action *means*, only that it happened.

## Existing precedent — follow the pattern, including the comment

`SplitButton.tsx` and `StepRailRow.tsx` both carry a doc comment along the lines of "Purely
presentational: X is owned by the caller." Keep writing that comment on new components — it's what
makes the boundary legible to the next reader at the definition site, instead of something they
have to reverse-engineer from imports.

## Moving a misplaced component

1. Create the file under `packages/components/src/`, generalizing any domain-specific prop/type
   names as you go (see the checklist above).
2. Export it from [packages/components/src/index.ts](../../../packages/components/src/index.ts).
3. Update the import at every call site in `apps/desktop`.
4. Add a Storybook story for it under `packages/components/stories/` (see below).
5. Run `pnpm --filter @git-manager/components typecheck`, `lint`, and `test`.

## Storybook isn't wired up yet for packages/components

`packages/mascot` (port 6007) and `packages/code-view` (port 6006) already have Storybook;
`packages/components` doesn't. When you add the first story, or when asked to set Storybook up for
it, scaffold it the same way those two do rather than inventing a new structure — but pick the
right one of the two as a template based on Tailwind usage, not on which package looks simpler:
`packages/mascot` renders a custom sprite rig with no Tailwind utility classes at all (check —
there's no `className=` anywhere in its `src/`), so its Storybook has no Tailwind/PostCSS pipeline.
`packages/components` is the opposite: `SplitButton.tsx` and `StepRailRow.tsx` are full of Tailwind
utility classes (`rounded-r-none`, `gap-1.5`, `border-b`, ...), exactly like `packages/code-view`.
Importing `@git-manager/ui/globals.css` alone only gets you the `@layer base` tokens (CSS custom
properties, `body`/`*` rules) — it does **not** generate the utility classes your own `.tsx` files
reference, because Tailwind's JIT scanner only emits CSS for classes it finds by scanning the
`content` globs of whichever `tailwind.config` runs during that build. Without a Tailwind config
of its own, `packages/components`' Storybook build would render every story unstyled — silently,
since nothing errors, it just ships plain unstyled `<div>`s. So follow `code-view`'s pattern here,
not mascot's:

- **devDependencies**: `@storybook/react`, `@storybook/react-vite`, `storybook`, `vite`,
  `tailwindcss`, `postcss`, `autoprefixer` (match the versions/catalog references already used in
  `packages/code-view/package.json`).
- **`tailwind.config.ts`**: extend `@git-manager/config/tailwind`, with `content` covering
  `./src/**/*.{ts,tsx}`, `./stories/**/*.{ts,tsx}`, and `../ui/src/**/*.{ts,tsx}` (needed because
  stories also render `@git-manager/ui` primitives like `Button`/`Badge`) — copy
  `packages/code-view/tailwind.config.ts` verbatim as a starting point, including its comment
  explaining this config is Storybook-only (the desktop app runs its own Tailwind pass over these
  sources via its own content globs).
- **`postcss.config.mjs`**: `{ plugins: { tailwindcss: {}, autoprefixer: {} } }`, same as
  `packages/code-view/postcss.config.mjs`.
- **`.storybook/main.ts`**: `stories: ['../stories/**/*.stories.@(ts|tsx)']` — stories live in a
  top-level `stories/` folder, not colocated with `src/`, matching both existing packages. Start
  with `addons: []` (code-view's addon-vitest/Playwright visual-regression layer is a separately
  scoped follow-up, not part of "get Storybook running"). Include
  `core: { disableTelemetry: true }` — the repo is 100% local/no-telemetry by principle (see the
  root `CLAUDE.md`), and both existing configs carry that comment; keep it.
- **`.storybook/preview.ts`**: import `@git-manager/ui/globals.css` for the theme tokens, and set
  `parameters: { layout: 'fullscreen', backgrounds: { disable: true } }`.
- **`.storybook/vite-env.d.ts`**: just `/// <reference types="vite/client" />`.
- **`package.json` scripts**: `"storybook": "storybook dev -p 6008"` (6006 and 6007 are already
  taken — see `packages/code-view/README.md` and `packages/mascot/README.md`) and
  `"build-storybook": "storybook build"`.
- One story per exported component under `packages/components/stories/`, built from static/mock
  props only. If a story needs to reach for a Tauri API or a store to render, that's a signal the
  component doesn't actually belong in this package — revisit the checklist above instead of
  wiring the mock in.
- Sanity-check the result by looking for Tailwind utility classes (not just the theme tokens) in
  the built story output, or by comparing against how the component actually looks when rendered
  inside `apps/desktop` — a story that renders with correct layout/spacing/colors confirms the
  Tailwind pipeline is actually active, not just present in config.

## Before considering it done

Run `pnpm --filter @git-manager/components typecheck`, `lint`, and `test` — same discipline as any
other package in the monorepo.
