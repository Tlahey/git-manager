/**
 * The board feature's **public surface** — everything the rest of the app may import, and nothing
 * else.
 *
 * A feature folder is only a boundary if something states where it is. This file is that statement:
 * code outside `features/board/` imports from `features/board`, never from a path inside it, so the
 * difference between "the app depends on this" and "this is the feature's own business" is one
 * `grep` rather than a reading of forty files.
 *
 * The surface is deliberately four names wide. It is not a re-export of everything: adding to it is
 * a decision about coupling, and the shape of that decision should be visible in a diff.
 *
 * Test factories are the one sanctioned exception — a suite outside the feature may reach
 * `features/board/test/boardFactories` directly, because shipping test builders through the
 * production barrel would put them in the bundle.
 */

/** The page itself, mounted as one tab per board — see `app/repo/components/RepoGraphWorkspace`. */
export { BoardPage } from './BoardPage'

/**
 * The board list and its mutations. Reached from outside only to *name* the tabs the workspace
 * renders; everything that acts on a board goes through `BoardPage`.
 */
export { useBoardData, type BoardData } from './hooks/useBoardData'

/** Which board is open, per repo. The tab bar writes it, the page reads it. */
export { useBoardStore } from './stores/board.store'

/**
 * The board's search box. Its *state* belongs to the board, but the control that drives it is drawn
 * by the app's own toolbar — which is why this is public and `board.store`'s fold state is not.
 */
export { useBoardControlsStore } from './stores/boardControls.store'
