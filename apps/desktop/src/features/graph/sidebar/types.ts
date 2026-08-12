import type {
  GitBranch,
  GitRef,
  GitSubmodule,
  GitWorktree,
  PullRequest,
  GitStash,
} from '@git-manager/git-types'
import type { MockIssue } from '../../../lib/github/types'
import type { TerminalSession } from '../../../stores/terminal.store'
import type { TerminalSessionState } from '../../../lib/terminalState'
import type { SavedFilter } from '../stores/savedFilters'

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
  | 'terminals'

/**
 * One row in the body of a sidebar section (branches, folders, tags, …) — not the section header
 * itself, which `SidebarSectionHeader` renders separately and which owns its own open state.
 */
export type SidebarRow =
  | {
      kind: 'branch'
      id: string
      branch: GitBranch
      /** Displayed name — every folder above the branch is stripped (`feat/login` → `login`). */
      displayName: string
      /** Folders above it inside its section — 0 for a top-level branch. */
      depth: number
      isSelected: boolean
      isPinned: boolean
    }
  | {
      kind: 'folder'
      id: string
      /** The path segment itself, e.g. `feat` for `feat/login` — folders nest to any depth. */
      name: string
      count: number
      isOpen: boolean
      /** Folders above it inside its section — 0 for a top-level one. */
      depth: number
      /** True when HEAD sits on a branch below, which the local section marks with a dot. */
      hasHead?: boolean
      /**
       * Remote-qualified names of every branch below, at any depth. Only a remote folder carries
       * them — they are what its visibility toggle acts on, and a local branch has no badge to
       * hide.
       */
      branchNames?: string[]
    }
  | {
      kind: 'remote-group'
      id: string
      remoteName: string
      count: number
      isOpen: boolean
      /** Remote-qualified names of every branch under it — what its visibility toggle acts on. */
      branchNames: string[]
    }
  | {
      kind: 'remote-branch'
      id: string
      branch: GitBranch
      remoteName: string
      /** Name shown on the row: the remote and every folder above it are stripped. */
      displayName: string
      /** Folders above it inside the remote node — 1 for a direct child of the remote. */
      depth: number
      isSelected: boolean
    }
  | {
      kind: 'subgroup'
      id: string
      label: string
      count: number
      isOpen: boolean
      /**
       * The saved filter this sub-group renders — issues and pull requests alike. Its presence is
       * what gives the header its own actions button (edit / delete / move).
       */
      filter?: SavedFilter
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
  | { kind: 'worktree'; id: string; wt: GitWorktree }
  | {
      kind: 'terminal'
      id: string
      session: TerminalSession
      /** Branch checked out where the session lives, or its folder name. */
      location: string
      /** True when the panel is showing this session right now. */
      isActive: boolean
      /** Running / finished-unseen / quiet — polled, so it changes without a user gesture. */
      state: TerminalSessionState
      /** The name of the command that state is about, when it could be resolved. */
      command: string | null
    }
  | { kind: 'message'; id: string; text: string; loading?: boolean }
  | { kind: 'divider'; id: string }

/** What a saved filter's sub-group header hands to its actions menu. */
export interface IssueFilterMenuTarget {
  filter: SavedFilter
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
 * pinned down here. With an explicit floor, the `shrink` computation is unambiguous: if the sum
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
  terminals: false,
}

/** Branches pinned by default (always on top, unless the user overrides it). */
export const DEFAULT_PINNED = ['main', 'master']
