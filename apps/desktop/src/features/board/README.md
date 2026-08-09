# Board (Kanban)

Everything the Board tab is, in one folder. A sibling top-level feature to Launchpad, generic over
two backends — a git-native local board and a GitHub-Issues-backed shared one — that the UI never
branches on beyond picking which `BoardBackend` to call.

Mounted from `app/repo/components/RepoWorkspace.tsx`, as one of the repo tab's three views.

**The board view is three slots of the repo tab, not one.** Since the tab's chrome became scoped to
the active view, this feature supplies the central area (`BoardPage`), the left panel
(`BoardSidebar`, the repo's boards and the field that filters the open one) and the toolbar's
middle section (`BoardToolbar`, everything that acts on the board, plus the global ticket search).
They are mounted in three different places by `RepoWorkspace` and `ActionToolbar`
and are joined by `stores/boardDialogs.store.ts`: a button in the toolbar opens a dialog rendered
inside the page by writing that store, rather than by fifteen callbacks threaded up through the app.

`index.ts` is the boundary: outside code imports `from '../../features/board'` and gets exactly four
names — the three slots above, plus `useBoardControlsStore`, whose filters the app resets when the
view leaves the screen. Everything else below this folder is the feature's own business. The one sanctioned exception is
`test/boardFactories`, which a suite outside the feature may import directly rather than through the
production barrel.

## Layout

| Folder        | What lives there                                                                                 |
| ------------- | ------------------------------------------------------------------------------------------------ |
| `index.ts`      | The public surface, and the reason this folder is a boundary rather than a naming habit.         |
| `BoardPage.tsx` | The central area: columns, read-only banners, the dialogs. Owns no dialog state and no wiring. |
| `api/`        | The IPC/HTTP boundary — the `BoardBackend` contract and its two implementations, plus the card ⇄ issue mapping. The **only** place in the feature allowed to reach `lib/tauri` or a GitHub endpoint. |
| `components/` | Every view, from the card face to the fourteen dialogs, plus the two chrome slots (`BoardToolbar`, `BoardSidebar`). Presentational; they receive handlers or write a store. |
| `hooks/`      | Data and UI state. `useBoardData` composes the six write-scoped hooks beside it.                 |
| `lib/`        | Pure logic, no React: identifier derivation, badge ink, link inverse-resolution, move targets (per card *and* per column), sprint statistics, iteration naming, checklist parsing, attachment markdown, cross-board ticket ranking. |
| `stores/`     | Three Zustand stores — persisted selection and fold state, the search box and list filters, and which dialog is open. |
| `test/`       | `makeBoard`/`makeCard`/`makeBoardData` factories, shared by every suite in the feature.            |

## Two searches, and why

- **The board-scoped filter** — a field at the top of `BoardSidebar`, writing `boardControls.search`,
  applied by `BoardPage`. It narrows the board on screen, archived cards included, and answers
  "which of these am I looking for". ⌘F focuses it, as it focuses the left panel's filter on every
  view.
- **The global search** — `BoardSearchDialog`, raised from the toolbar's search button through
  `boardDialogs.store`. It answers "where is GM-7", which has no reason to begin by asking which
  board GM-7 is on. It reads every board once (`useAllBoardCards`, gated on the dialog being open,
  since that is one board detail fetch per board), ranks with `lib/searchCards.ts`, and on select
  switches to the card's board *before* opening the card dialog — that dialog resolves its id out of
  the open board's live card list, so the order is load-bearing.

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
