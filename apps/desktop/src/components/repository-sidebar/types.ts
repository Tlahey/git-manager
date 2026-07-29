import type {
  GitBranch,
  GitRef,
  GitSubmodule,
  GitWorktree,
  PullRequest,
  GitStash,
} from '@git-manager/git-types'
import type { MockIssue } from '../../app/pull-requests/types'
import type { IssueFilter } from '../../stores/issueFilters.store'

/** Stable section identifiers (open state + scroll). */
export type SectionKey =
  | 'local'
  | 'remotes'
  | 'prs'
  | 'issues'
  | 'tags'
  | 'submodules'
  | 'stashes'
  | 'worktrees'

/**
 * The buckets pull requests are split into inside the "Pull Requests" section. Every open PR of the
 * repo appears under `all`; the first three are additional, overlapping views of that same list
 * (a PR you opened *and* were assigned shows up under both), so the counts deliberately don't sum
 * to `all`.
 */
export type PrGroupKey = 'mine' | 'assigned' | 'awaitingReview' | 'all'

export const PR_GROUP_ORDER: PrGroupKey[] = ['mine', 'assigned', 'awaitingReview', 'all']

/** i18n key (in the `git` namespace) for each PR sub-group's header label. */
export const PR_GROUP_LABEL_KEY: Record<PrGroupKey, string> = {
  mine: 'sidebar.prGroups.mine',
  assigned: 'sidebar.prGroups.assigned',
  awaitingReview: 'sidebar.prGroups.awaitingReview',
  all: 'sidebar.prGroups.all',
}

/**
 * One row in the body of a sidebar section (branches, folders, tags, …) — not the section header
 * itself, which `SidebarSectionHeader` renders separately and which owns its own open state.
 */
export type SidebarRow =
  | {
      kind: 'branch'
      id: string
      branch: GitBranch
      /** Displayed name — the folder prefix (e.g. "feat/") is stripped when the branch is grouped. */
      displayName: string
      depth: 0 | 1
      isSelected: boolean
      isPinned: boolean
      /** PR whose head is this branch (headRef == shortName), when the repo is on GitHub. */
      pr?: PullRequest
    }
  | {
      kind: 'folder'
      id: string
      prefix: string
      count: number
      isOpen: boolean
      hasHead: boolean
    }
  | {
      kind: 'remote-group'
      id: string
      remoteName: string
      count: number
      isOpen: boolean
    }
  | {
      kind: 'remote-branch'
      id: string
      branch: GitBranch
      remoteName: string
      isSelected: boolean
    }
  | {
      kind: 'subgroup'
      id: string
      label: string
      count: number
      isOpen: boolean
      /**
       * The saved issue filter this sub-group renders, when it is one. Its presence is what gives
       * the header its own actions button (edit / delete / move) — the PR sub-groups are fixed and
       * carry none.
       */
      filter?: IssueFilter
      /** False on the first / last filter, which greys out the corresponding move entry. */
      canMoveUp?: boolean
      canMoveDown?: boolean
    }
  | {
      kind: 'pr'
      id: string
      pr: PullRequest
      isSelected: boolean
      /** 1 when nested under a PR sub-group header, so the row indents past it. */
      depth?: 0 | 1
    }
  | { kind: 'issue'; id: string; issue: MockIssue }
  | { kind: 'tag'; id: string; tag: GitRef; isSelected: boolean }
  | { kind: 'stash'; id: string; stash: GitStash; isSelected: boolean }
  | { kind: 'submodule'; id: string; sm: GitSubmodule }
  | { kind: 'worktree'; id: string; wt: GitWorktree; pr?: PullRequest }
  | { kind: 'message'; id: string; text: string; loading?: boolean }
  | { kind: 'divider'; id: string }

/** What a saved issue filter's sub-group header hands to its actions menu. */
export interface IssueFilterMenuTarget {
  filter: IssueFilter
  canMoveUp?: boolean
  canMoveDown?: boolean
}

/** One sidebar section (header + collapsible body). */
export interface SidebarSection {
  key: SectionKey
  title: string
  count?: number
  isOpen: boolean
  rows: SidebarRow[]
}

/**
 * Approximate height (px) of a section header (icon + title + count, `py-1.5` in `SectionHeader`).
 * Only used to compose the section container's total floor (`MIN_SECTION_HEIGHT` below) — an
 * approximation is enough, since it is only a floor.
 */
export const SECTION_HEADER_HEIGHT = 28

/**
 * Minimum height (px) of an expanded section's body.
 */
export const MIN_SECTION_BODY_HEIGHT = 120

/**
 * Minimum height (px) of an expanded section's container as a whole (header + body).
 * Every open section is a `flex-1` child of the list (equal weight, 0% basis): open sections always
 * share the available height in strictly equal parts, even a sparse one (e.g. a single worktree) —
 * that is deliberate, so every open section lines up at the same height.
 *
 * This floor is applied directly (an explicit numeric value) on the section container itself rather
 * than relying on the automatic minimum size the layout engine would derive from its content — a
 * flex container whose `overflow` is `visible` (the case here, unlike its `overflow-y-auto` body)
 * can otherwise refuse to shrink below the full height of its untruncated content, which produced
 * two distinct bugs (unbounded growth, then the following sections overlapping) before the floor was
 * pinned down here. With an explicit floor, the `flex-shrink` computation is unambiguous: if the sum
 * of the open sections' floors exceeds the panel height, the whole section list becomes scrollable
 * (a single global scrollbar) instead of shrinking a section past legibility or letting sections
 * overlap.
 */
export const MIN_SECTION_HEIGHT = SECTION_HEADER_HEIGHT + MIN_SECTION_BODY_HEIGHT

/** Default open state of the sections — all collapsed. */
export const DEFAULT_SECTION_OPEN: Record<SectionKey, boolean> = {
  local: false,
  remotes: false,
  prs: false,
  issues: false,
  tags: false,
  submodules: false,
  stashes: false,
  worktrees: false,
}

/** Branches pinned by default (always on top, unless the user overrides it). */
export const DEFAULT_PINNED = ['main', 'master']
