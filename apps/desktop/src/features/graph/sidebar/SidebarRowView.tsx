import {
  ChevronDown,
  ChevronRight,
  FolderGit2,
  Globe,
  Tag as TagIcon,
  Archive as ArchiveIcon,
  GitFork,
  MoreVertical,
} from 'lucide-react'
import { Spinner } from '@git-manager/ui'
import { highlightMatch } from '@git-manager/components'
import { useTranslation } from '@git-manager/i18n'
import type { GitBranch, GitRef, GitWorktree, PullRequest, GitStash } from '@git-manager/git-types'
import type { WorktreeWipStatus } from '../hooks/useWorktreeWipStatuses'
import type { MockIssue } from '../../../lib/github/types'
import type { IssueFilterMenuTarget, SidebarRow } from './types'
import { BranchItem } from './BranchItem'
import { VisibilityToggle } from './VisibilityToggle'
import { RemoteBranchItem } from './RemoteBranchItem'
import { rowIndent } from './rowIndent'
import { PullRequestItem } from './PullRequestItem'
import { IssueItem } from './IssueItem'
import { WorktreeItem } from './WorktreeItem'
import { HoverExpandLabel } from './HoverExpandLabel'
import { SidebarHideableRow } from './SidebarHideableRow'
import { shortOid } from '../../../lib/shortOid'

interface SidebarRowViewProps {
  row: SidebarRow
  /** Repo the rows belong to — a PR row needs it to resolve `owner/repo` for its hover card. */
  repoPath?: string
  onToggleOpen: (id: string) => void
  onSelectBranch: (name: string) => void
  /** Single click on a branch row, alongside `onSelectBranch` — brings its tip commit into view. */
  onFocusBranch?: (branch: GitBranch) => void
  /** Double click on a branch row — switches to it. */
  onCheckoutBranch?: (branch: GitBranch) => void
  /** Clicking a tag scrolls to / selects its commit in the graph instead of re-filtering the whole
   * log to that tag. Falls back to `onSelectBranch(tag.name)` when not provided. */
  onSelectTag?: (commitOid: string) => void
  onTogglePin: (shortName: string) => void
  onContextMenu?: (e: React.MouseEvent, branch: GitBranch) => void
  /**
   * Opens a remote branch's action menu (right-click on the row, or its "…" button). Separate from
   * `onContextMenu` above: a remote row's menu is the wider one, carrying the commit-scoped actions
   * on the branch tip and the row's own Hide toggle.
   */
  onRemoteBranchContextMenu?: (e: React.MouseEvent, branch: GitBranch) => void
  onOpenPr?: (pr: PullRequest) => void
  /** Opens a pull request's action menu (right-click on the row, or its "…" button). */
  onPrContextMenu?: (e: React.MouseEvent, pr: PullRequest) => void
  /** Opens an issue's action menu (right-click on the row, or its "…" button). */
  onIssueContextMenu?: (e: React.MouseEvent, issue: MockIssue) => void
  /** Opens an issue in the app's own issue view. */
  onOpenIssue?: (issue: MockIssue) => void
  /** Opens a saved issue filter's own menu (edit / delete / move) from its sub-group header. */
  onIssueFilterMenu?: (e: React.MouseEvent, group: IssueFilterMenuTarget) => void
  onStashContextMenu?: (e: React.MouseEvent, stash: GitStash) => void
  hiddenStashes?: string[]
  onToggleStashVisibility?: (oid: string) => void
  /** Opens the tag's action menu — same one the graph's tag badge uses. */
  onTagContextMenu?: (e: React.MouseEvent, tag: GitRef) => void
  /** Tag short names whose badge is kept out of the graph. */
  hiddenTags?: string[]
  onToggleTagVisibility?: (tagName: string) => void
  /** Remote-qualified branch names (`origin/build/ci`) whose badge is kept out of the graph. */
  hiddenBranches?: string[]
  /** Hides or shows a set of remote branches at once — a single row passes one name. */
  onToggleBranchesVisibility?: (branchNames: string[], hidden: boolean) => void
  onRemoveWorktree?: (wt: GitWorktree) => void
  /** Remove a worktree *and* delete the branch it had checked out. */
  onRemoveWorktreeAndBranch?: (wt: GitWorktree) => void
  onOpenWorktree?: (wt: GitWorktree) => void
  /** Pending-changes info for linked worktrees with uncommitted changes — drives the bubble/hover
   * breakdown on a worktree row. Absent or no match for a given row = no bubble. */
  worktreeWipStatuses?: WorktreeWipStatus[]
  /** Active sidebar search query — matched substrings are highlighted in the row's label(s). */
  filterQuery?: string
  /** Solo mode on: branch rows show an eye/eye-off toggle to include/exclude them from the graph. */
  soloActive?: boolean
  /** Branch shortNames currently soloed (visible). Used to pick the eye vs eye-off state. */
  soloed?: Set<string>
  /** Toggle a branch's solo (visible) status by its shortName. */
  onToggleSolo?: (shortName: string) => void
}

export function SidebarRowView({
  row,
  repoPath,
  onToggleOpen,
  onSelectBranch,
  onFocusBranch,
  onCheckoutBranch,
  onSelectTag,
  onTogglePin,
  onContextMenu,
  onRemoteBranchContextMenu,
  onOpenPr,
  onPrContextMenu,
  onIssueContextMenu,
  onOpenIssue,
  onIssueFilterMenu,
  onStashContextMenu,
  hiddenStashes = [],
  onToggleStashVisibility,
  onTagContextMenu,
  hiddenTags = [],
  onToggleTagVisibility,
  hiddenBranches = [],
  onToggleBranchesVisibility,
  onRemoveWorktree,
  onRemoveWorktreeAndBranch,
  onOpenWorktree,
  worktreeWipStatuses = [],
  filterQuery = '',
  soloActive = false,
  soloed,
  onToggleSolo,
}: SidebarRowViewProps) {
  const { t } = useTranslation('git')
  switch (row.kind) {
    case 'branch':
      return (
        <BranchItem
          branch={row.branch}
          displayName={row.displayName}
          isSelected={row.isSelected}
          depth={row.depth}
          isPinned={row.isPinned}
          onSelect={onSelectBranch}
          onFocus={onFocusBranch}
          onCheckout={onCheckoutBranch}
          onTogglePin={onTogglePin}
          onContextMenu={onContextMenu}
          filterQuery={filterQuery}
          soloActive={soloActive}
          isSoloed={soloed?.has(row.branch.shortName) ?? false}
          isHidden={hiddenBranches.includes(row.branch.shortName)}
          onToggleSolo={onToggleSolo}
        />
      )

    case 'folder':
    case 'remote-group': {
      // One code path for every group header over a set of branches — a remote node and a folder
      // in either section. They differ only by icon, by the HEAD dot, and by whether the branches
      // below them have a graph badge to hide.
      const isRemoteNode = row.kind === 'remote-group'
      const branchNames = row.branchNames
      const hiddenBelow = branchNames?.filter((n) => hiddenBranches.includes(n)).length ?? 0
      const allHidden = !!branchNames?.length && hiddenBelow === branchNames.length
      const label = allHidden
        ? t('sidebar.remote.showAllInGraph')
        : t('sidebar.remote.hideAllInGraph')
      return (
        <div
          className={`group/folder relative flex w-full items-center text-xs transition-colors hover:bg-sidebar-accent/40 ${
            allHidden ? 'opacity-50' : ''
          }`}
          data-testid={`sidebar-row-${row.id}`}
        >
          {/* Hiding is a remote-branch affordance: a local branch has no badge of its own to drop
              from the graph, so a local folder gets no toggle. */}
          {branchNames && (
            <VisibilityToggle
              isHidden={allHidden}
              partial={hiddenBelow > 0 && !allHidden}
              onToggle={() => onToggleBranchesVisibility?.(branchNames, !allHidden)}
              label={label}
              dataToggle="remote-visibility"
              hoverClass="group-hover/folder:opacity-100"
            />
          )}
          <button
            onClick={() => onToggleOpen(row.id)}
            style={{ paddingLeft: rowIndent(isRemoteNode ? 0 : row.depth) }}
            className="flex min-w-0 flex-1 items-center gap-1.5 py-[3px] pr-2 text-left text-sidebar-muted-foreground transition-colors hover:text-sidebar-foreground"
          >
            <span className="shrink-0">
              {row.isOpen ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
            </span>
            {isRemoteNode ? (
              <Globe className="h-3 w-3 shrink-0 opacity-50" />
            ) : (
              <FolderGit2 className="h-3 w-3 shrink-0 opacity-50" />
            )}
            <span className="flex-1 truncate font-medium">
              {row.kind === 'folder' && row.hasHead && (
                <span className="mr-1 text-[9px] text-emerald-400">●</span>
              )}
              {row.kind === 'remote-group' ? row.remoteName : row.name}
            </span>
            <span className="shrink-0 text-[10px] text-sidebar-muted-foreground/40 tabular-nums">
              {row.count}
            </span>
          </button>
        </div>
      )
    }

    case 'remote-branch':
      return (
        <RemoteBranchItem
          branch={row.branch}
          displayName={row.displayName}
          depth={row.depth}
          isSelected={row.isSelected}
          onSelect={onSelectBranch}
          onFocus={onFocusBranch}
          onCheckout={onCheckoutBranch}
          onContextMenu={onRemoteBranchContextMenu}
          isHidden={hiddenBranches.includes(row.branch.name)}
          onToggleVisibility={onToggleBranchesVisibility}
          filterQuery={filterQuery}
          soloActive={soloActive}
          isSoloed={soloed?.has(row.branch.name) ?? false}
          onToggleSolo={onToggleSolo}
        />
      )

    case 'subgroup': {
      // A saved issue filter carries its own actions button; the PR sub-groups are fixed and get
      // none. The toggle stays a real <button>, with the actions one as its sibling rather than a
      // child — nesting buttons is invalid markup and breaks keyboard activation.
      const filter = row.filter
      return (
        <div className="group/subgroup flex w-full items-center text-[10px] font-semibold tracking-widest text-sidebar-muted-foreground/60 uppercase transition-colors hover:bg-sidebar-accent/30">
          <button
            onClick={() => onToggleOpen(row.id)}
            className="flex min-w-0 flex-1 items-center gap-1 py-[3px] pr-1 pl-4 text-left transition-colors hover:text-sidebar-muted-foreground"
          >
            <span className="shrink-0">
              {row.isOpen ? (
                <ChevronDown className="h-2.5 w-2.5" />
              ) : (
                <ChevronRight className="h-2.5 w-2.5" />
              )}
            </span>
            <span className="flex-1 truncate">{row.label}</span>
            <span className="tabular-nums">{row.count}</span>
          </button>
          {filter && onIssueFilterMenu ? (
            <button
              onClick={(e) =>
                onIssueFilterMenu(e, {
                  filter,
                  canMoveUp: row.canMoveUp,
                  canMoveDown: row.canMoveDown,
                })
              }
              className="mr-1 shrink-0 rounded p-0.5 opacity-0 transition-all group-hover/subgroup:opacity-100 hover:bg-sidebar-accent/80 hover:text-sidebar-foreground"
              aria-label={t('sidebar.issueFilters.actions')}
              title={t('sidebar.issueFilters.actions')}
              data-testid={`issue-filter-actions-${filter.id}`}
            >
              <MoreVertical className="h-3 w-3" />
            </button>
          ) : (
            <span className="w-3 shrink-0" />
          )}
        </div>
      )
    }

    case 'pr':
      return (
        <PullRequestItem
          pr={row.pr}
          repoPath={repoPath}
          onOpen={onOpenPr}
          isSelected={row.isSelected}
          filterQuery={filterQuery}
          depth={row.depth}
          onContextMenu={onPrContextMenu}
        />
      )

    case 'issue':
      return (
        <IssueItem
          issue={row.issue}
          filterQuery={filterQuery}
          onContextMenu={onIssueContextMenu}
          onOpen={onOpenIssue}
        />
      )

    case 'tag': {
      const isHidden = hiddenTags.includes(row.tag.shortName)
      return (
        <SidebarHideableRow
          kind="tag"
          icon={<TagIcon className="h-3 w-3 shrink-0 opacity-30" />}
          label={highlightMatch(row.tag.shortName, filterQuery)}
          commitOid={row.tag.commitOid}
          isSelected={row.isSelected}
          isHidden={isHidden}
          // Clicking a tag scrolls to / selects its commit in the graph; the fallback re-filters
          // the log to the tag, which is what callers without `onSelectTag` still expect.
          onSelect={() =>
            onSelectTag ? onSelectTag(row.tag.commitOid) : onSelectBranch(row.tag.name)
          }
          onOpenMenu={(e) => onTagContextMenu?.(e, row.tag)}
          onToggleVisibility={() => onToggleTagVisibility?.(row.tag.shortName)}
          visibilityLabel={isHidden ? t('sidebar.tag.showInGraph') : t('sidebar.tag.hideInGraph')}
          actionsLabel={t('sidebar.tagActions')}
          testId={`tag-item-${row.tag.shortName}`}
          actionsTestId={`tag-actions-button-${row.tag.shortName}`}
        />
      )
    }

    case 'stash': {
      const isHidden = hiddenStashes.includes(row.stash.commitOid)
      return (
        <SidebarHideableRow
          kind="stash"
          icon={<ArchiveIcon className="h-3 w-3 shrink-0 text-violet-400 opacity-40" />}
          label={highlightMatch(row.stash.message || `stash@{${row.stash.index}}`, filterQuery)}
          // A stash message runs long where a tag name does not, so this one takes the row.
          labelFills
          commitOid={row.stash.commitOid}
          isSelected={row.isSelected}
          isHidden={isHidden}
          onSelect={() => onSelectBranch(row.stash.commitOid)}
          onOpenMenu={(e) => onStashContextMenu?.(e, row.stash)}
          onToggleVisibility={() => onToggleStashVisibility?.(row.stash.commitOid)}
          visibilityLabel={
            isHidden ? t('sidebar.stash.showInGraph') : t('sidebar.stash.hideInGraph')
          }
          actionsLabel={t('sidebar.stashActions')}
          testId={`stash-item-${row.stash.index}`}
          actionsTestId={`stash-actions-button-${row.stash.index}`}
        />
      )
    }

    case 'submodule':
      return (
        <div
          data-testid={`submodule-item-${row.sm.path}`}
          className="group/sm relative flex items-start gap-1.5 py-[3px] pr-2 pl-6 text-xs text-sidebar-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
        >
          <GitFork className="mt-0.5 h-3 w-3 shrink-0 opacity-30" />
          <div className="min-w-0 flex-1">
            <HoverExpandLabel className="font-medium">
              {highlightMatch(row.sm.path, filterQuery)}
            </HoverExpandLabel>
            <span className="block truncate text-[10px] text-sidebar-muted-foreground/50">
              {row.sm.url.replace(/^(https?:\/\/|git@)/, '').replace(/\.git$/, '')}
            </span>
          </div>
          {row.sm.headOid && (
            <span className="shrink-0 font-mono text-[10px] text-sidebar-muted-foreground/30 tabular-nums">
              {shortOid(row.sm.headOid)}
            </span>
          )}
        </div>
      )

    case 'worktree':
      return (
        <WorktreeItem
          wt={row.wt}
          wipStatus={worktreeWipStatuses.find((s) => s.path === row.wt.path)}
          filterQuery={filterQuery}
          onOpenWorktree={onOpenWorktree}
          onRemoveWorktree={onRemoveWorktree}
          onRemoveWorktreeAndBranch={onRemoveWorktreeAndBranch}
        />
      )

    case 'message':
      return (
        <div className="flex items-center gap-2 px-4 py-1.5 text-[11px] text-sidebar-muted-foreground/70">
          {row.loading && <Spinner className="h-3 w-3 text-sidebar-muted-foreground" />}
          <span>{row.text}</span>
        </div>
      )

    case 'divider':
      return <div className="my-1 border-t border-sidebar-border/50" />

    default:
      return null
  }
}
