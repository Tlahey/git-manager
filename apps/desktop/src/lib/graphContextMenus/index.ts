/**
 * Context-driven CONFIGURATION of the graph's native context menus.
 *
 * Every rule about what the commit menu contains — and how it adapts to what was clicked (number
 * of selected commits, merge commit or not, which branches sit on the commit, local vs remote
 * branch, current branch or not, detached HEAD...) — lives here as pure functions returning a
 * `MenuSpecEntry[]` (see `nativeMenuSpec.ts`), rendered by `showNativeMenu` in
 * `api/nativeMenu.api.ts`. Adding a context-specific item = one predicate + one entry in the
 * relevant builder; no Tauri code involved, and the result is directly unit-testable.
 *
 * Items shipped as VISIBLE BUT DISABLED are planned features without an implementation yet —
 * gating a real disabled placeholder on state (e.g. "nothing to act on") rather than hardcoding it
 * off keeps the menu shape stable so wiring one later is only an `enabled`/`action` change here.
 */

export { buildBranchSubmenu, buildBranchSubmenus } from './branchSections'
export { buildCommitMenuSpec, buildMultiCommitMenuSpec } from './commitMenu'
export { buildConflictMenuSpec } from './conflictMenu'
export type { ConflictMenuActions, ConflictMenuContext } from './conflictMenu'
export { buildOtherWorktreeMenuSpec } from './otherWorktreeMenu'
export type { OtherWorktreeMenuActions } from './otherWorktreeMenu'
export { buildRefDropMenuSpec } from './refDropMenu'
export type { RefDropMenuActions, RefDropMenuContext } from './refDropMenu'
export { buildSidebarBranchMenuSpec } from './sidebarBranchMenu'
export type {
  PendingDeleteRemoteBranch,
  SidebarBranchMenuActions,
  SidebarBranchMenuContext,
} from './sidebarBranchMenu'
export { buildStashMenuSpec } from './stashMenu'
export type { StashMenuActions, StashMenuContext } from './stashMenu'
export { buildTagMenuSpec } from './tagMenu'
export type { TagMenuActions, TagMenuContext } from './tagMenu'
export type {
  BranchMenuActions,
  BranchTipCommitActions,
  CommitCopyActions,
  CommitMenuActions,
  GraphCommitMenuContext,
} from './types'
export { buildWipMenuSpec } from './wipMenu'
export type { WipMenuActions, WipMenuContext } from './wipMenu'
export { isMainBranchName, remoteBranchTarget } from './refHelpers'
