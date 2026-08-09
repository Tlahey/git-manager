/**
 * The graph feature's **public surface** — everything the rest of the app may import, and nothing
 * else.
 *
 * The same statement `features/board/index.ts` and `features/files/index.ts` make: code outside
 * `features/graph/` imports from `features/graph`, never from a path inside it, so "the app depends
 * on this" is one `grep` rather than a reading of three hundred files.
 *
 * Three of the names below are the *slots* of a repo tab this view fills — its central area, its
 * left panel, its section of the toolbar. The rest is what `RepoWorkspace` has to mount on the
 * graph's behalf: the ref-scoped dialogs, which live outside the graph so that a confirmation opened
 * from a tag badge survives the user switching view mid-action (see `RepoWorkspace`'s doc comment),
 * and the two menu hooks that raise them.
 *
 * Pure `lib/` modules are the sanctioned exception, and there is exactly one production case:
 * `stores/gitGraphColumns.store.ts` — which lives outside because it is a *persisted configuration
 * section*, part of the app-config contract — imports `lib/columns.config` at its own path. It
 * cannot come through here: that store builds its defaults at module-evaluation time, and this file
 * pulls the whole view in behind the constants, including the graph, which reads that store. The
 * cycle evaluates to `Cannot access 'COLUMN_ORDER' before initialization`. The reason is restated
 * beside the import, since that is the end that would be "tidied up" back onto the barrel.
 *
 * The same hazard is why nothing here re-exports a *value* a store or a `lib/appConfig/` module
 * needs at import time. Components and hooks are safe — they evaluate on render, long after the
 * module graph has settled.
 */

/** The view itself, in the repo tab's central area. */
export { GitGraph } from './GitGraph'

/** The left panel while this view is on screen — branches, tags, stashes, worktrees, PRs, issues. */
export { RepositorySidebar } from './sidebar'

/** The toolbar's middle section while this view is on screen — everything that acts on history. */
export { GraphToolbarActions } from './components/GraphToolbarActions'

/**
 * The ref-scoped dialogs, mounted by `RepoWorkspace` rather than by the graph.
 *
 * They are about a **ref**, not about a commit in the graph's viewport, so they must stay open — and
 * openable — while another view has the graph unmounted. One mount site, outside the view.
 */
export { RenameBranchDialog } from './components/RenameBranchDialog'
export { DeleteRemoteBranchDialog } from './components/DeleteRemoteBranchDialog'
export { CompareBranchesDialog } from './components/CompareBranchesDialog'
export { SetUpstreamDialog } from './components/SetUpstreamDialog'
export { TagDialogsManager } from './components/TagDialogsManager'

/** The branch and tag context menus the sidebar's rows open, and the dialog state they raise. */
export { useSidebarBranchMenu } from './hooks/useSidebarBranchMenu'
export { useSidebarTagMenu } from './hooks/useSidebarTagMenu'

/** The graph's column keys, for the persisted `gitGraphColumns` settings section that is typed on
 * them. Type-only: erased at compile time, so it cannot take part in the cycle described above —
 * the *values* beside it (`COLUMN_DEFS`, `COLUMN_ORDER`) are deliberately not re-exported here. */
export type { ColumnKey } from './lib/columns.config'
