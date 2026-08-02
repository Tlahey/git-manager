import type { SectionKey } from './types'

/** Every action `SidebarSectionHeader` can render as a header button/menu item. */
export type SectionHeaderActionKey =
  | 'onCreateBranch'
  | 'onPruneBranches'
  | 'onRemoveMergedBranches'
  | 'onRemoveMyMergedBranches'
  | 'onAddWorktree'
  | 'onPruneWorktrees'
  | 'onRemoveMergedWorktrees'
  | 'onRemoveMyMergedWorktrees'
  | 'onCreatePr'
  | 'onCreateIssue'
  | 'onAddIssueFilter'
  | 'onAddPrFilter'

export type SectionHeaderActionHandlers = Partial<Record<SectionHeaderActionKey, () => void>>

const ALL_ACTION_KEYS: SectionHeaderActionKey[] = [
  'onCreateBranch',
  'onPruneBranches',
  'onRemoveMergedBranches',
  'onRemoveMyMergedBranches',
  'onAddWorktree',
  'onPruneWorktrees',
  'onRemoveMergedWorktrees',
  'onRemoveMyMergedWorktrees',
  'onCreatePr',
  'onCreateIssue',
  'onAddIssueFilter',
  'onAddPrFilter',
]

/**
 * Which header actions apply to which section — the branch actions only make sense on `local`,
 * the worktree actions only on `worktrees`, etc. Declarative counterpart to `columns.config.ts`'s
 * column-visibility table, replacing what used to be a `section.key === 'x' ? handler : undefined`
 * repeated once per action/section pair (2026-08 retrofit, see architecture-guardian skill's R3 and
 * the CLAUDE.md "Frontend organization rules" entry on this pattern).
 *
 * A section not listed here (remotes, tags, submodules, stashes) gets no header actions at all.
 */
export const SECTION_HEADER_ACTIONS: Partial<Record<SectionKey, SectionHeaderActionKey[]>> = {
  local: ['onCreateBranch', 'onPruneBranches', 'onRemoveMergedBranches', 'onRemoveMyMergedBranches'],
  worktrees: [
    'onAddWorktree',
    'onPruneWorktrees',
    'onRemoveMergedWorktrees',
    'onRemoveMyMergedWorktrees',
  ],
  prs: ['onCreatePr', 'onAddPrFilter'],
  issues: ['onCreateIssue', 'onAddIssueFilter'],
}

/**
 * Narrows `handlers` (every action this component could possibly wire, computed once) down to
 * just the ones `sectionKey` actually renders. Every action key is always present in the result —
 * `undefined` for a key the section doesn't own — rather than omitted, so a section's header
 * props are a stable, fully-enumerated shape regardless of which section is rendering; that's
 * exactly what `SidebarSectionHeader`'s optional props expect. A handler already gated by its own
 * precondition (e.g. `onCreatePr` requiring a GitHub token) stays gated: this only decides
 * *whether the section shows the action*, not whether the action itself is available.
 */
export function resolveSectionHeaderActions(
  sectionKey: SectionKey,
  handlers: SectionHeaderActionHandlers
): SectionHeaderActionHandlers {
  const owned = new Set(SECTION_HEADER_ACTIONS[sectionKey] ?? [])
  const resolved: SectionHeaderActionHandlers = {}
  for (const key of ALL_ACTION_KEYS) {
    resolved[key] = owned.has(key) ? handlers[key] : undefined
  }
  return resolved
}
