# Graph (commit history)

Everything the Graph view is, in one folder: the commit graph itself, the branch sidebar beside it,
the toolbar section above it, and the panels, dialogs, menus and pure layout logic they use.

Mounted from `app/repo/components/RepoWorkspace.tsx` and `components/action-toolbar/ActionToolbar.tsx`
— one of a repo tab's three views, alongside `features/files` and `features/board`.

`index.ts` is the boundary: outside code imports `from '../../features/graph'` and gets the three
slots this view fills (`GitGraph`, `RepositorySidebar`, `GraphToolbarActions`), the five ref-scoped
dialogs the workspace has to mount on its behalf, the two menu hooks that raise them, and the column
definitions the persisted `gitGraphColumns` settings section reads. Everything else below this folder
is the feature's own business.

## Layout

| Folder            | What lives there                                                                                                                        |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `index.ts`        | The public surface, and the reason this folder is a boundary rather than a naming habit.                                                  |
| `GitGraph.tsx`    | The view: the virtualized commit table, and whichever panel replaces it (a diff, a PR, an explanation).                                    |
| `components/`     | Every view the graph draws — rows, ref labels, detail panels, the AI panels, the dialogs — plus `GraphToolbarActions`, its toolbar section. |
| `sidebar/`        | The left panel: branches, remotes, tags, stashes, worktrees, pull requests, issues, and their rows' menus and dialogs.                     |
| `hooks/`          | Data and UI state, from `useGraphLayout` to the ref-drop and commit-reorder gestures.                                                     |
| `lib/`            | Pure logic, no React: graph layout, lane/column assignment, synthetic rows, the reorder plan, waterline buckets, bisect row state.         |
| `stores/`         | The view's own non-persisted Zustand stores — drag state, the author filter, the saved issue/PR filters.                                   |

## What is deliberately *not* here

- **The diff viewer** (`components/diff-viewer/`) and the **PR/issue screens**
  (`components/github-panels/`). The graph mounts both, but so do `features/files` and
  `app/pull-requests` — a shared screen belongs in `src/components/`, or importing it would make
  this folder a dependency of pages that know nothing about a commit graph. They were extracted
  from this folder for exactly that reason; each carries a README saying so.
- **The persisted stores.** `gitGraphColumns`, `pinned-branches`, `repoUI`, `repoData` and
  `settings` are *sections of `~/.git-manager/settings.json`* — part of the app-config contract that
  `lib/appConfig/` validates and hydrates — so they stay in `src/stores/`. The column *definitions*
  they read come back through this barrel.
- **The generic hooks** (`useRunTasks`, `useWindowFocus`, `useSingleOrDoubleClick`) and everything
  the rest of the app also calls (`useActionToolbar`, `useBranches`, `useGitStatus`, …).
- **The DTOs** (`packages/git-types`), the **copy** (`packages/i18n`, the `git` namespace) and the
  **Rust half** (`src-tauri/`).

## Why a folder and not a package

Same answer as `features/board/README.md` gives at length: the feature reaches the app's IPC layer,
its persisted stores and a dozen shared components. Extracting it would either drag the app in behind
it or turn those imports into injected dependencies whose only job is to re-supply what an import
already gives.
