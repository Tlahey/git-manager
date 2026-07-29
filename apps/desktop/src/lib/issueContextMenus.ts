import { menuItem, menuSeparator, type MenuSpecEntry } from './nativeMenuSpec'

type TranslateFn = (key: string, opts?: Record<string, unknown>) => string

/**
 * Context-driven CONFIGURATION of the sidebar's issue menus, as pure functions returning a
 * `MenuSpecEntry[]` (see `nativeMenuSpec.ts`) rendered by `showNativeMenu`. Same shape as
 * `graphContextMenus.ts`, kept in its own module because an issue is not a graph object: it never
 * appears in the commit graph and shares none of its context.
 */

// ── Issue row ────────────────────────────────────────────────────────────────

export interface IssueMenuContext {
  /** Number of the right-clicked issue — named in the branch entry. */
  number: number
  /**
   * Whether a local branch already references this issue. The "create a branch" entry is dropped
   * rather than disabled in that case: the branch it would create already exists, so there is no
   * action left to explain, and the row's own hover card is where the link is visible.
   */
  hasBranch: boolean
}

export interface IssueMenuActions {
  onCreateBranch: () => void
  onViewOnGitHub: () => void
  onCopyLink: () => void
}

export function buildIssueMenuSpec(
  ctx: IssueMenuContext,
  actions: IssueMenuActions,
  t: TranslateFn
): MenuSpecEntry[] {
  return [
    !ctx.hasBranch &&
      menuItem({
        text: t('sidebar.issueMenu.createBranch', { number: ctx.number }),
        icon: 'branch',
        action: actions.onCreateBranch,
      }),
    menuSeparator(),
    menuItem({ text: t('sidebar.issueMenu.viewOnGitHub'), action: actions.onViewOnGitHub }),
    menuItem({ text: t('sidebar.issueMenu.copyLink'), action: actions.onCopyLink }),
  ]
}

// ── Saved issue filter (sub-group header) ────────────────────────────────────

export interface IssueFilterMenuContext {
  /** False on the first / last filter — the move entry stays visible but disabled. */
  canMoveUp: boolean
  canMoveDown: boolean
}

export interface IssueFilterMenuActions {
  onEdit: () => void
  onDelete: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}

export function buildIssueFilterMenuSpec(
  ctx: IssueFilterMenuContext,
  actions: IssueFilterMenuActions,
  t: TranslateFn
): MenuSpecEntry[] {
  return [
    menuItem({ text: t('sidebar.issueFilters.edit'), action: actions.onEdit }),
    menuItem({ text: t('sidebar.issueFilters.delete'), action: actions.onDelete }),
    menuSeparator(),
    menuItem({
      text: t('sidebar.issueFilters.moveUp'),
      enabled: ctx.canMoveUp,
      action: actions.onMoveUp,
    }),
    menuItem({
      text: t('sidebar.issueFilters.moveDown'),
      enabled: ctx.canMoveDown,
      action: actions.onMoveDown,
    }),
  ]
}
