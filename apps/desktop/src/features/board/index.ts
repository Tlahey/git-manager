/**
 * The board feature's **public surface** — everything the rest of the app may import, and nothing
 * else.
 *
 * A feature folder is only a boundary if something states where it is. This file is that statement:
 * code outside `features/board/` imports from `features/board`, never from a path inside it, so the
 * difference between "the app depends on this" and "this is the feature's own business" is one
 * `grep` rather than a reading of forty files.
 *
 * The surface is deliberately narrow. It is not a re-export of everything: adding to it is a
 * decision about coupling, and the shape of that decision should be visible in a diff. Three of the
 * six names below are the *slots* of a repo tab this view fills — its central area, its left panel,
 * its section of the toolbar — which is what a view-scoped chrome costs and all it costs.
 *
 * Test factories are the one sanctioned exception — a suite outside the feature may reach
 * `features/board/test/boardFactories` directly, because shipping test builders through the
 * production barrel would put them in the bundle.
 */

/** The view itself, in the repo tab's central area — see `app/repo/components/RepoWorkspace`. */
export { BoardPage } from './BoardPage'

/** The left panel while this view is on screen — the repo's boards. */
export { BoardSidebar } from './components/BoardSidebar'

/** The toolbar's middle section while this view is on screen — everything that acts on the board. */
export { BoardToolbar } from './components/BoardToolbar'

/**
 * **Not here, deliberately**: `useBoardData` and `board.store`.
 *
 * Both were public while a tab strip outside the feature drew one tab per board and had to read the
 * list to label them. The switcher moved into the toolbar and that strip is gone, so nothing outside
 * asks the board anything any more — the surface narrows with it. `lib/appConfig/hydrate.ts` still
 * reaches `stores/board.store` at its own path, and must: it is a persisted section, read at module
 * evaluation, and a barrel import would drag the whole view in behind it (see
 * `stores/gitGraphColumns.store.ts` for the crash that shape produces).
 */

/**
 * The panel's board-list filters. Their *state* belongs to the board; the app resets them when the
 * view leaves the screen, which is why this is public and `board.store`'s fold state is not.
 */
export { useBoardControlsStore } from './stores/boardControls.store'

/**
 * Public for one reason: ⌘F on this view raises the global ticket search, and the binding lives in
 * the app's `useKeyboardShortcuts` rather than in the feature. Nothing outside opens any of the
 * other dialogs — the toolbar that does is this feature's own.
 */
export { useBoardDialogsStore } from './stores/boardDialogs.store'

/**
 * Renders nothing — it exists purely to be mounted once by `App`, alongside the notch producers,
 * and listen for the `merge_branch` event `apiMergeBranch` raises. Closes the loop the board's own
 * "create branch for card" action opens: a card whose `linkedBranch` just merged moves to its
 * board's done column. Public for the same reason `BoardSidebar`/`BoardToolbar` are — a slot the
 * app wires in, not the feature's own business.
 */
export { BoardMergeCompletion } from './components/BoardMergeCompletion'
