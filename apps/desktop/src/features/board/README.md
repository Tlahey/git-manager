# Board (Kanban)

Everything the Board tab is, in one folder. A sibling top-level feature to Launchpad, generic over
two backends — a git-native local board and a GitHub-Issues-backed shared one — that the UI never
branches on beyond picking which `BoardBackend` to call.

Mounted from `app/repo/components/RepoGraphWorkspace.tsx`, one tab per board.

`index.ts` is the boundary: outside code imports `from '../../features/board'` and gets exactly four
names — `BoardPage`, `useBoardData`, `useBoardStore`, `useBoardControlsStore`. Everything else below
this folder is the feature's own business. The one sanctioned exception is `test/boardFactories`,
which a suite outside the feature may import directly rather than through the production barrel.

## Layout

| Folder        | What lives there                                                                                 |
| ------------- | ------------------------------------------------------------------------------------------------ |
| `index.ts`      | The public surface, and the reason this folder is a boundary rather than a naming habit.         |
| `BoardPage.tsx` | The page: header, columns, closed-sprint banner. Owns no dialog state and no wiring.            |
| `api/`        | The IPC/HTTP boundary — the `BoardBackend` contract and its two implementations, plus the card ⇄ issue mapping. The **only** place in the feature allowed to reach `lib/tauri` or a GitHub endpoint. |
| `components/` | Every view, from the card face to the fourteen dialogs. Presentational; they receive handlers.       |
| `hooks/`      | Data and UI state. `useBoardData` composes the six write-scoped hooks beside it; `useBoardDialogs` owns which dialog is open. |
| `lib/`        | Pure logic, no React: identifier derivation, badge ink, link inverse-resolution, move targets (per card *and* per column), sprint statistics, iteration naming, checklist parsing, attachment markdown. |
| `stores/`     | The two Zustand stores — persisted selection and fold state, and the board's search box.           |
| `test/`       | `makeBoard`/`makeCard`/`makeBoardData` factories, shared by every suite in the feature.            |

## What is deliberately *not* here

- **The Rust half.** `src-tauri/src/services/git_board.rs` and `commands/board.rs` own the local
  backend's storage — a hidden ref per board, one commit per mutation. Read that module's doc comment
  before touching `api/local-board.api.ts`.
- **The DTOs.** `Board`, `BoardCard` and friends live in `packages/git-types`, because they mirror
  Rust `serde` structs that the backend also has to agree with.
- **The copy.** The `board` i18n namespace lives in `packages/i18n/locales/{en,fr}/board.json`, en↔fr
  parity enforced.

## Why a folder and not a package

The feature reaches the app's IPC layer, its stores and a handful of shared components
(`MarkdownRenderer`, `CommitAvatar`, `usePrEditCandidates`). Extracting it would
mean either dragging those in — at which point the package is the app — or inverting fifteen imports
into injected dependencies whose only job is to re-supply what an import already gives. It would also
break the rule that every operation stays reachable from one `api/*.api.ts` layer, which is what lets
undo/redo and the achievement bus hook in without touching call sites.

So: one folder, one entry point, and this file as the map. See the `features/` section of the repo
`CLAUDE.md` for the convention.
