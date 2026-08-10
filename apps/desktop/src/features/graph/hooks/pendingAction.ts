import type { GraphCommitAction } from '../../../stores/repoUI.store'

/**
 * The graph's local pending-dialog action: the shared {@link GraphCommitAction} union, or `null`
 * for "no dialog open". The store's `pendingGraphAction` bridge feeds straight into this.
 *
 * In its own module because both ends of the graph need it — `useGitGraphActions` raises it and
 * `GitGraphOverlayManager` renders it — and so do the hooks split out of the first. Importing the
 * type from the hook that happens to own the state would make every one of them depend on that
 * hook's whole import graph.
 */
export type PendingAction = GraphCommitAction | null
