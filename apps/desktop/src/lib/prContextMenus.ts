import { menuItem, menuSeparator, type MenuSpecEntry } from './nativeMenuSpec'

type TranslateFn = (key: string, opts?: Record<string, unknown>) => string

/**
 * Context-driven CONFIGURATION of the sidebar's pull request menu, as a pure function returning a
 * `MenuSpecEntry[]` (see `nativeMenuSpec.ts`) rendered by `showNativeMenu`. Same shape as
 * `graphContextMenus.ts` and `issueContextMenus.ts`.
 */

export interface PullRequestMenuContext {
  /** Named in the GitHub/copy entries, so the menu says which PR it is about. */
  number: number
  /**
   * Whether the PR's head branch exists *locally*. Checking out and creating a worktree both need
   * a local branch — the backend's checkout resolves a local branch or a raw OID and nothing else,
   * so a PR whose head has never been fetched has nothing to act on. Both entries stay visible and
   * disabled rather than vanishing, since the fix (fetch the branch) is on the user's side.
   */
  hasLocalBranch: boolean
  /**
   * The AI master switch from Settings. Only gates the review entry, and disables rather than hides
   * it, so the capability stays discoverable for someone who has never opened the AI settings.
   */
  aiEnabled: boolean
}

export interface PullRequestMenuActions {
  onViewOnGitHub: () => void
  onCopyLink: () => void
  onReview: () => void
  /** Selects the PR's head branch in the graph, filtering the log to it. */
  onGoToBranch: () => void
  onCheckout: () => void
  onCreateWorktree: () => void
}

export function buildPullRequestMenuSpec(
  ctx: PullRequestMenuContext,
  actions: PullRequestMenuActions,
  t: TranslateFn
): MenuSpecEntry[] {
  const p = { number: ctx.number }
  return [
    menuItem({ text: t('sidebar.prMenu.viewOnGitHub', p), action: actions.onViewOnGitHub }),
    menuItem({ text: t('sidebar.prMenu.copyLink', p), action: actions.onCopyLink }),
    menuSeparator(),
    menuItem({
      text: t('sidebar.prMenu.review'),
      enabled: ctx.aiEnabled,
      action: actions.onReview,
    }),
    menuItem({
      text: t('sidebar.prMenu.goToBranch'),
      enabled: ctx.hasLocalBranch,
      action: actions.onGoToBranch,
    }),
    menuSeparator(),
    menuItem({
      text: t('sidebar.prMenu.checkout'),
      enabled: ctx.hasLocalBranch,
      action: actions.onCheckout,
    }),
    menuItem({
      text: t('sidebar.prMenu.createWorktree'),
      enabled: ctx.hasLocalBranch,
      action: actions.onCreateWorktree,
    }),
  ]
}
