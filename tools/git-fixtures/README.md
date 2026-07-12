# Dev fixture repos

Scripted git repos for manually exercising git-manager's UI against real, awkward repo states
(paused rebase conflicts, fixup chains, stashes, detached HEAD, reset/revert history) — without
hand-building temp folders or re-adding them through "Open Repo" every time you regenerate one.

## How it works

- Each scenario is one script under `scenarios/*.sh`. It always rebuilds its repo from scratch at
  a **stable path**: `/tmp/git-manager-fixtures/<scenario-name>/`.
- `lib.sh` has two helpers every scenario script uses:
  - `fixture_init <name>` — wipes and recreates `/tmp/git-manager-fixtures/<name>`, `cd`s into it,
    `git init`s it with a fixed test identity.
  - `register_fixture <name> <description>` — called once at the end of the script, merges this
    scenario's entry into `/tmp/git-manager-fixtures/manifest.json` (the file the app reads to
    know what fixtures exist).
- `build-all.sh` runs every scenario script and leaves a fresh `manifest.json` behind.
- `dev-import.sh` is the `pnpm dev:import-repo` entry point: it runs `build-all.sh`, exports the
  manifest as `VITE_DEV_FIXTURES`, then launches `pnpm dev`.

## Usage

```bash
pnpm dev:import-repo   # rebuild every fixture + launch the app with them all injected as tabs
pnpm fixture:build      # just rebuild the fixtures on disk (e.g. to reset a resolved conflict),
                         # without relaunching — useful while `pnpm dev` is already running; just
                         # re-select the fixture's tab afterwards to see the fresh state
```

A plain `pnpm dev` never touches any of this — no env var is set, so the app behaves exactly as it
does today, with no fixture tabs and no localStorage impact.

## How injection actually reaches the UI

The one thing this had to solve without adding filesystem-read permissions or a temp-folder
workflow you manage by hand: **the app needs to know the fixtures exist without ever saving them
to `localStorage`** (open tabs/repos are persisted there via `zustand/persist` in
`apps/desktop/src/stores/repoUI.store.ts` and `repoData.store.ts` — writing fixtures into that
state would make them leak into your normal, non-fixture dev sessions forever).

So the manifest travels through an env var instead of a file the app reads at runtime:

1. `dev-import.sh` sets `VITE_DEV_FIXTURES` to the manifest JSON **before** `pnpm dev` boots.
   Vite bakes `import.meta.env.VITE_*` values in at dev-server start, so this only works if it's
   set ahead of time — that's why fixtures are rebuilt and exported in one wrapper script rather
   than as a separate "point the running app at a new repo" step.
2. `apps/desktop/src/hooks/useDevFixtureImport.ts` reads `VITE_DEV_FIXTURES` once on mount (gated
   by `import.meta.env.DEV`, same pattern already used in `NotificationDropdown.tsx`) and writes
   the parsed list into `apps/desktop/src/stores/devFixtureRepos.store.ts` — a **plain Zustand
   store with no `persist` middleware**, by design, so nothing here ever reaches `localStorage`.
3. `TabBar.tsx` renders `openTabs` (persisted, your real repos) and `fixtures` (ephemeral, from
   the store above) as two separate `.map()`s — fixture tabs get a dashed amber border + flask
   icon so they're visually distinct. Clicking one calls `setActiveRepo(path)` directly (not
   `setActiveTab`, since that action's `activeRepo` resolution only checks the persisted
   `openTabs` list, which fixtures are deliberately never added to). `RepoView.tsx` already opens
   and caches whatever `activeRepo` points at on its own, so no separate "open" step was needed.
   Closing a fixture tab removes it from the ephemeral store only.

## Adding a new scenario

Add `scenarios/<name>.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib.sh"

fixture_init "<name>"

# ... build the repo state with plain git commands ...

register_fixture "<name>" "<one-line description shown as the tab's tooltip>"
```

It's automatically picked up by `build-all.sh` (it just globs `scenarios/*.sh`) — nothing else to
wire up. Run it standalone with `bash tools/git-fixtures/scenarios/<name>.sh` while iterating.

## Current scenarios

| Scenario           | What it sets up                                                                                                                                                      |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rebase-conflict`  | Paused rebase with a real, unresolved conflict on a ~110-line file covering every 3-way merge-editor block kind twice                                                |
| `fixup-chain`      | Two pre-existing `fixup!`/target pairs (autosquash grouping) _plus_ a staged change ready to become a fixup for a third, not-yet-fixed-up commit (create-fixup flow) |
| `stash-stack`      | Two stashes (plain + one with an untracked file) plus staged and unstaged changes left on top                                                                        |
| `detached-head`    | HEAD detached two commits behind `main`, with an unrelated side branch also present                                                                                  |
| `feature-branches` | Two local branches (`main` + `feature/login`), HEAD on `main`, clean tree — for branch checkout and its undo/redo                                                    |
| `rollback-history` | Five linear commits bumping the same file, for testing reset/revert/undo                                                                                             |

## Known gaps

- `RepoSelector.tsx` (the repo-switcher dropdown in the toolbar) only lists `savedRepos`, so
  fixture repos aren't selectable from there — only from the tab bar. Not wired up on purpose to
  keep the injection additive and not touch the "real repos" data model at all.
- Keyboard shortcuts that cycle tabs (`useKeyboardShortcuts.ts`) only iterate `openTabs`, so they
  skip fixture tabs too.
