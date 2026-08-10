import type { GitBranch, GitRef, GitStash, GitSubmodule, GitWorktree } from '@git-manager/git-types'
import {
  buildBranchTree,
  type BranchTreeFolder,
  type BranchTreeNode,
} from '../../../lib/branchTree'
import type { SidebarRow, SidebarSection } from '../sidebar/types'
import type { SidebarSectionContext } from './sidebarGithubSections'

/**
 * The six sidebar sections that are git rather than GitHub: local branches, remotes, tags, stashes,
 * submodules and worktrees.
 *
 * Extracted from `useSidebarRows`'s single `useMemo` for the same reason its GitHub neighbours were
 * (see `sidebarGithubSections.ts`): every one of them is a pure function of already-filtered data,
 * and reading one meant scrolling past the other five. What the hook keeps is the fetching, the
 * filtering, and the order the sections appear in.
 *
 * They share one rule worth stating once, because it is the one that is easy to get wrong: a
 * section returns `null` when it has nothing to show, and *which* nothing counts differs. Tags,
 * stashes and submodules hide whenever they are empty — a repo with no tags has no Tags section at
 * all. Local and Worktrees hide only while a search is narrowing them to zero, because both are
 * always meaningful otherwise: a non-empty repo always has a local branch, and the Worktrees header
 * carries the "add" action, so it has to stay reachable with zero worktrees.
 */

/** How many tags are listed before the section stops and says how many more there are. */
export const TAGS_LIMIT = 100

/**
 * The remote a branch belongs to.
 *
 * Read from `name`, never from `shortName`: the backend already strips the remote from the latter
 * (`origin/build/ci` arrives as `name: 'origin/build/ci'`, `shortName: 'build/ci'`), so splitting
 * the short name would name the remote after the branch's first *folder* — which is what put
 * `build` and `feat` beside `origin` instead of inside it.
 */
export function remoteOf(branch: GitBranch): string {
  const slash = branch.name.indexOf('/')
  return slash > 0 ? branch.name.slice(0, slash) : 'origin'
}

interface PushBranchTreeParams {
  /** Row list being built, appended to in place. */
  rows: SidebarRow[]
  nodes: BranchTreeNode[]
  /** Row id every folder id below is built from, keeping the two sections' ids apart. */
  parentId: string
  /** Depth the level starts at — 0 in the local section, 1 under a remote node. */
  depth: number
  subOpen: (id: string, def?: boolean) => boolean
  branchRow: (branch: GitBranch, displayName: string, depth: number) => SidebarRow
  folderRow: (node: BranchTreeFolder, id: string, depth: number) => SidebarRow
}

/**
 * Flattens a branch tree into rows, walking it rather than iterating a flat list: folders nest, and
 * a closed one has to take its whole subtree off screen, not just its own leaves. Shared by the
 * local and remote sections, which differ only in the rows they build.
 */
function pushBranchTree({
  rows,
  nodes,
  parentId,
  depth,
  subOpen,
  branchRow,
  folderRow,
}: PushBranchTreeParams): void {
  for (const node of nodes) {
    if (node.kind === 'branch') {
      rows.push(branchRow(node.branch, node.displayName, depth))
      continue
    }
    const id = `${parentId}${parentId.endsWith(':') ? '' : '/'}${node.name}`
    rows.push(folderRow(node, id, depth))
    if (subOpen(id, true)) {
      pushBranchTree({
        rows,
        nodes: node.children,
        parentId: id,
        depth: depth + 1,
        subOpen,
        branchRow,
        folderRow,
      })
    }
  }
}

/** Tells whether a branch row is the one currently selected in the panel. */
type IsSelected = (branch: GitBranch) => boolean

interface LocalSectionData {
  /** Pinned branches first, in pin order, then everything else as a folder tree. */
  pinnedBranches: GitBranch[]
  remainingBranches: GitBranch[]
  /** Both lists' total, which is also the header's count. */
  count: number
  isSelected: IsSelected
}

export function buildLocalSection(
  { q, isOpen, subOpen }: SidebarSectionContext,
  { pinnedBranches, remainingBranches, count, isSelected }: LocalSectionData
): SidebarSection | null {
  const rows: SidebarRow[] = []

  if (isOpen) {
    for (const b of pinnedBranches) {
      rows.push({
        kind: 'branch',
        id: `local:${b.name}`,
        branch: b,
        displayName: b.shortName,
        depth: 0,
        isSelected: isSelected(b),
        isPinned: true,
      })
    }
    if (pinnedBranches.length > 0 && remainingBranches.length > 0) {
      rows.push({ kind: 'divider', id: 'div:pinned' })
    }
    pushBranchTree({
      rows,
      nodes: buildBranchTree(remainingBranches, (b) => b.shortName),
      parentId: 'folder:',
      depth: 0,
      subOpen,
      branchRow: (branch, displayName, depth) => ({
        kind: 'branch',
        id: `local:${branch.name}`,
        branch,
        displayName,
        depth,
        isSelected: isSelected(branch),
        isPinned: false,
      }),
      folderRow: (node, id, depth) => ({
        kind: 'folder',
        id,
        name: node.name,
        count: node.branches.length,
        isOpen: subOpen(id, true),
        depth,
        hasHead: node.branches.some((b) => b.isHead),
      }),
    })
  }

  // Hidden entirely when actively filtering down to zero matches — a non-empty repo always has
  // a local section otherwise, so this only ever fires while `q` is set.
  if (q && count === 0) return null

  return { key: 'local', title: 'Local', count, isOpen, rows }
}

interface RemotesSectionData {
  /** One entry per remote, in insertion order: `['origin', branches]`. */
  groups: [string, GitBranch[]][]
  /** Every grouped branch, which is the header's count. */
  count: number
  isSelected: IsSelected
}

export function buildRemotesSection(
  { isOpen, subOpen }: SidebarSectionContext,
  { groups, count, isSelected }: RemotesSectionData
): SidebarSection | null {
  // No remote at all — or none matching the search — means no section, unlike Local, which a repo
  // always has.
  if (groups.length === 0) return null

  const rows: SidebarRow[] = []
  if (isOpen) {
    for (const [remoteName, branches] of groups) {
      const gid = `remote:${remoteName}`
      const gopen = subOpen(gid, true)
      rows.push({
        kind: 'remote-group',
        id: gid,
        remoteName,
        count: branches.length,
        isOpen: gopen,
        branchNames: branches.map((b) => b.name),
      })
      if (!gopen) continue
      pushBranchTree({
        rows,
        // `shortName` already reads relative to the remote (the backend strips it), so it is
        // exactly the name the folders below the remote node are cut from.
        nodes: buildBranchTree(branches, (b) => b.shortName),
        parentId: `remote-folder:${remoteName}`,
        // The remote node itself occupies depth 0, so its own children start one in.
        depth: 1,
        subOpen,
        branchRow: (branch, displayName, depth) => ({
          kind: 'remote-branch',
          id: `remote-branch:${branch.name}`,
          branch,
          remoteName,
          displayName,
          depth,
          isSelected: isSelected(branch),
        }),
        folderRow: (node, id, depth) => ({
          kind: 'folder',
          id,
          name: node.name,
          count: node.branches.length,
          isOpen: subOpen(id, true),
          depth,
          branchNames: node.branches.map((b) => b.name),
        }),
      })
    }
  }

  return { key: 'remotes', title: 'Remotes', count, isOpen, rows }
}

interface TagsSectionData {
  tags: GitRef[]
  /** Commit currently selected in the graph — a tag row highlights when it points at it. Clicking
   *  a tag scrolls to its commit rather than filtering the log, so selection follows the commit. */
  selectedCommitOid: string | null
}

export function buildTagsSection(
  { t, isOpen }: SidebarSectionContext,
  { tags, selectedCommitOid }: TagsSectionData
): SidebarSection | null {
  if (tags.length === 0) return null

  const rows: SidebarRow[] = []
  if (isOpen) {
    for (const tag of tags.slice(0, TAGS_LIMIT)) {
      rows.push({
        kind: 'tag',
        id: `tag:${tag.name}`,
        tag,
        isSelected: !!selectedCommitOid && selectedCommitOid === tag.commitOid,
      })
    }
    if (tags.length > TAGS_LIMIT) {
      rows.push({
        kind: 'message',
        id: 'tag:more',
        text: t('sidebar.tags.more', { count: tags.length - TAGS_LIMIT }),
      })
    }
  }

  return { key: 'tags', title: 'Tags', count: tags.length, isOpen, rows }
}

export function buildStashesSection(
  { isOpen }: SidebarSectionContext,
  { stashes, selectedBranch }: { stashes: GitStash[]; selectedBranch: string | null }
): SidebarSection | null {
  if (stashes.length === 0) return null

  const rows: SidebarRow[] = []
  if (isOpen) {
    for (const stash of stashes) {
      rows.push({
        kind: 'stash',
        id: `stash:${stash.index}`,
        stash,
        isSelected: selectedBranch === stash.commitOid,
      })
    }
  }

  return { key: 'stashes', title: 'Stashes', count: stashes.length, isOpen, rows }
}

export function buildSubmodulesSection(
  { isOpen }: SidebarSectionContext,
  { submodules }: { submodules: GitSubmodule[] }
): SidebarSection | null {
  if (submodules.length === 0) return null

  const rows: SidebarRow[] = isOpen
    ? submodules.map((sm) => ({ kind: 'submodule' as const, id: `sm:${sm.path}`, sm }))
    : []

  return { key: 'submodules', title: 'Submodules', count: submodules.length, isOpen, rows }
}

/**
 * Always shown when unfiltered — unlike Submodules/Tags/Stashes, which hide when empty. This is the
 * only section whose header carries an "add" action, so it must stay reachable with zero worktrees.
 * It still hides while actively filtering down to zero matches.
 */
export function buildWorktreesSection(
  { t, q, isOpen }: SidebarSectionContext,
  { worktrees }: { worktrees: GitWorktree[] }
): SidebarSection | null {
  if (q && worktrees.length === 0) return null

  const rows: SidebarRow[] = []
  if (isOpen) {
    if (worktrees.length === 0) {
      rows.push({ kind: 'message', id: 'wt:empty', text: t('sidebar.worktrees.empty') })
    } else {
      for (const wt of worktrees) {
        rows.push({ kind: 'worktree', id: `wt:${wt.path}`, wt })
      }
    }
  }

  return {
    key: 'worktrees',
    title: 'Worktrees',
    count: worktrees.length || undefined,
    isOpen,
    rows,
  }
}
