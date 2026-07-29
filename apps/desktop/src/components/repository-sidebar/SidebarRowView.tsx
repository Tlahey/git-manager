import {
  ChevronDown,
  ChevronRight,
  FolderGit2,
  Globe,
  GitBranch as BranchIcon,
  Tag as TagIcon,
  Archive as ArchiveIcon,
  Eye,
  EyeOff,
  GitFork,
  MoreVertical,
} from 'lucide-react'
import { Spinner } from '@git-manager/ui'
import { highlightMatch } from '@git-manager/components'
import { useTranslation } from '@git-manager/i18n'
import type { GitBranch, GitRef, GitWorktree, PullRequest, GitStash } from '@git-manager/git-types'
import type { WorktreeWipStatus } from '../../hooks/useWorktreeWipStatuses'
import type { MockIssue } from '../../app/pull-requests/types'
import type { IssueFilterMenuTarget, SidebarRow } from './types'
import { BranchItem } from './BranchItem'
import { SoloToggle } from './SoloToggle'
import { PullRequestItem } from './PullRequestItem'
import { IssueItem } from './IssueItem'
import { WorktreeItem } from './WorktreeItem'
import { HoverExpandLabel } from './HoverExpandLabel'

interface SidebarRowViewProps {
  row: SidebarRow
  /** Repo the rows belong to — a PR row needs it to resolve `owner/repo` for its hover card. */
  repoPath?: string
  onToggleOpen: (id: string) => void
  onSelectBranch: (name: string) => void
  /** Clicking a tag scrolls to / selects its commit in the graph instead of re-filtering the whole
   * log to that tag. Falls back to `onSelectBranch(tag.name)` when not provided. */
  onSelectTag?: (commitOid: string) => void
  onTogglePin: (shortName: string) => void
  onContextMenu?: (e: React.MouseEvent, branch: GitBranch) => void
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
  onSelectTag,
  onTogglePin,
  onContextMenu,
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
          onTogglePin={onTogglePin}
          onContextMenu={onContextMenu}
          pr={row.pr}
          onOpenPr={onOpenPr}
          filterQuery={filterQuery}
          soloActive={soloActive}
          isSoloed={soloed?.has(row.branch.shortName) ?? false}
          onToggleSolo={onToggleSolo}
        />
      )

    case 'folder':
      return (
        <button
          onClick={() => onToggleOpen(row.id)}
          className="flex w-full items-center gap-1.5 py-[3px] pl-4 pr-2 text-left text-xs text-sidebar-muted-foreground transition-colors hover:bg-sidebar-accent/40 hover:text-sidebar-foreground"
        >
          <span className="shrink-0">
            {row.isOpen ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </span>
          <FolderGit2 className="h-3 w-3 shrink-0 opacity-50" />
          <span className="flex-1 truncate font-medium">
            {row.hasHead && <span className="mr-1 text-[9px] text-emerald-400">●</span>}
            {row.prefix.replace(/\/$/, '')}
          </span>
          <span className="shrink-0 text-[10px] tabular-nums text-sidebar-muted-foreground/40">
            {row.count}
          </span>
        </button>
      )

    case 'remote-group':
      return (
        <button
          onClick={() => onToggleOpen(row.id)}
          className="flex w-full items-center gap-1.5 py-[3px] pl-4 pr-2 text-left text-xs text-sidebar-muted-foreground transition-colors hover:bg-sidebar-accent/40 hover:text-sidebar-foreground"
        >
          <span className="shrink-0">
            {row.isOpen ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </span>
          <Globe className="h-3 w-3 shrink-0 opacity-50" />
          <span className="flex-1 truncate font-medium">{row.remoteName}</span>
          <span className="shrink-0 text-[10px] tabular-nums text-sidebar-muted-foreground/40">
            {row.count}
          </span>
        </button>
      )

    case 'remote-branch': {
      const displayName = row.branch.shortName.replace(new RegExp(`^${row.remoteName}/`), '')
      const isSoloed = soloed?.has(row.branch.shortName) ?? false
      const dimmed = soloActive && !isSoloed
      return (
        <div
          className={`group/rbranch relative flex items-center gap-1.5 py-[3px] pl-10 pr-2 text-xs transition-colors ${
            row.isSelected
              ? 'bg-sidebar-accent text-sidebar-foreground'
              : 'text-sidebar-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground'
          } ${dimmed ? 'opacity-50' : ''}`}
          onClick={() => onSelectBranch(row.branch.name)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && onSelectBranch(row.branch.name)}
        >
          {soloActive && onToggleSolo && (
            <SoloToggle
              isSoloed={isSoloed}
              onToggle={() => onToggleSolo(row.branch.shortName)}
            />
          )}
          <BranchIcon className="h-3 w-3 shrink-0 opacity-30" />
          <HoverExpandLabel>{highlightMatch(displayName, filterQuery)}</HoverExpandLabel>
          {(row.branch.aheadCount > 0 || row.branch.behindCount > 0) && (
            <span className="shrink-0 text-[10px] tabular-nums">
              {row.branch.aheadCount > 0 && (
                <span className="text-blue-400">↑{row.branch.aheadCount}</span>
              )}
              {row.branch.behindCount > 0 && (
                <span className="ml-0.5 text-orange-400">↓{row.branch.behindCount}</span>
              )}
            </span>
          )}
        </div>
      )
    }

    case 'subgroup': {
      // A saved issue filter carries its own actions button; the PR sub-groups are fixed and get
      // none. The toggle stays a real <button>, with the actions one as its sibling rather than a
      // child — nesting buttons is invalid markup and breaks keyboard activation.
      const filter = row.filter
      return (
        <div className="group/subgroup flex w-full items-center text-[10px] font-semibold uppercase tracking-widest text-sidebar-muted-foreground/60 transition-colors hover:bg-sidebar-accent/30">
          <button
            onClick={() => onToggleOpen(row.id)}
            className="flex min-w-0 flex-1 items-center gap-1 py-[3px] pl-4 pr-1 text-left transition-colors hover:text-sidebar-muted-foreground"
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
              className="mr-1 shrink-0 rounded p-0.5 opacity-0 transition-all hover:bg-sidebar-accent/80 hover:text-sidebar-foreground group-hover/subgroup:opacity-100"
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
      const visibilityLabel = isHidden
        ? t('sidebar.tag.showInGraph')
        : t('sidebar.tag.hideInGraph')
      const select = () =>
        onSelectTag ? onSelectTag(row.tag.commitOid) : onSelectBranch(row.tag.name)
      return (
        <div
          className={`group/tag relative flex items-center gap-1.5 py-[3px] pl-6 pr-6 text-xs transition-colors ${
            row.isSelected
              ? 'bg-sidebar-accent font-medium text-sidebar-foreground'
              : 'text-sidebar-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground'
          } ${isHidden ? 'opacity-50' : ''}`}
          onClick={(e) => {
            if ((e.target as HTMLElement).closest('[data-toggle]')) return
            select()
          }}
          onContextMenu={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onTagContextMenu?.(e, row.tag)
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return
            if ((e.target as HTMLElement).closest('[data-toggle]')) return
            select()
          }}
          data-testid={`tag-item-${row.tag.shortName}`}
        >
          <span
            data-toggle="tag-visibility"
            onClick={(e) => {
              e.stopPropagation()
              e.preventDefault()
              onToggleTagVisibility?.(row.tag.shortName)
            }}
            // Like the stash toggle: an affordance on hover while the tag shows, but pinned on
            // screen once it is hidden, since the icon is the only thing saying so.
            className={`absolute left-1 z-content shrink-0 cursor-pointer rounded p-0.5 text-sidebar-muted-foreground transition-all hover:bg-sidebar-accent/80 hover:text-sidebar-foreground ${
              isHidden ? 'opacity-100' : 'opacity-0 group-hover/tag:opacity-100'
            }`}
            title={visibilityLabel}
            aria-label={visibilityLabel}
          >
            {isHidden ? (
              <EyeOff className="h-3.5 w-3.5 text-sidebar-muted-foreground/60" />
            ) : (
              <Eye className="h-3.5 w-3.5 text-violet-400" />
            )}
          </span>
          <TagIcon className="h-3 w-3 shrink-0 opacity-30" />
          <HoverExpandLabel>{highlightMatch(row.tag.shortName, filterQuery)}</HoverExpandLabel>
          <span className="shrink-0 font-mono text-[10px] font-normal tabular-nums text-sidebar-muted-foreground/40">
            {row.tag.commitOid.slice(0, 7)}
          </span>
          <button
            data-toggle="tag-actions"
            onClick={(e) => {
              e.stopPropagation()
              onTagContextMenu?.(e, row.tag)
            }}
            className="absolute right-1 top-1/2 -translate-y-1/2 shrink-0 rounded p-0.5 text-sidebar-muted-foreground opacity-0 transition-all hover:bg-sidebar-accent/80 hover:text-sidebar-foreground group-hover/tag:opacity-100"
            aria-label={t('sidebar.tagActions')}
            title={t('sidebar.tagActions')}
            data-testid={`tag-actions-button-${row.tag.shortName}`}
          >
            <MoreVertical className="h-3.5 w-3.5" />
          </button>
        </div>
      )
    }

    case 'stash': {
      const isHidden = hiddenStashes.includes(row.stash.commitOid)
      const visibilityLabel = isHidden
        ? t('sidebar.stash.showInGraph')
        : t('sidebar.stash.hideInGraph')
      return (
        <div
          className={`group/stash relative flex cursor-pointer items-center gap-1.5 py-[3px] pl-6 pr-6 text-xs transition-colors ${
            row.isSelected
              ? 'bg-sidebar-accent font-medium text-sidebar-foreground'
              : 'text-sidebar-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground'
          } ${isHidden ? 'opacity-50' : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            if ((e.target as HTMLElement).closest('[data-toggle]')) {
              return
            }
            onSelectBranch(row.stash.commitOid)
          }}
          onContextMenu={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onStashContextMenu?.(e, row.stash)
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Enter') {
              if ((e.target as HTMLElement).closest('[data-toggle]')) return
              onSelectBranch(row.stash.commitOid)
            }
          }}
          data-testid={`stash-item-${row.stash.index}`}
        >
          <span
            data-toggle="stash-visibility"
            onClick={(e) => {
              e.stopPropagation()
              e.preventDefault()
              onToggleStashVisibility?.(row.stash.commitOid)
            }}
            onMouseDown={(e) => {
              e.stopPropagation()
              e.preventDefault()
            }}
            onMouseUp={(e) => {
              e.stopPropagation()
              e.preventDefault()
            }}
            // A hidden stash keeps its toggle on screen at all times: the icon is the only thing
            // saying the stash is being kept out of the graph, and an affordance that only appears
            // under the pointer would leave that state invisible at rest.
            className={`absolute left-1 z-content shrink-0 cursor-pointer rounded p-0.5 text-sidebar-muted-foreground transition-all hover:bg-sidebar-accent/80 hover:text-sidebar-foreground ${
              isHidden ? 'opacity-100' : 'opacity-0 group-hover/stash:opacity-100'
            }`}
            title={visibilityLabel}
            aria-label={visibilityLabel}
          >
            {isHidden ? (
              <EyeOff className="h-3.5 w-3.5 text-sidebar-muted-foreground/60" />
            ) : (
              <Eye className="h-3.5 w-3.5 text-violet-400" />
            )}
          </span>
          <ArchiveIcon className="h-3 w-3 shrink-0 text-violet-400 opacity-40" />
          <HoverExpandLabel className="min-w-0 flex-1 truncate">
            {highlightMatch(row.stash.message || `stash@{${row.stash.index}}`, filterQuery)}
          </HoverExpandLabel>
          <span className="shrink-0 font-mono text-[10px] font-normal tabular-nums text-sidebar-muted-foreground/40">
            {row.stash.commitOid.slice(0, 7)}
          </span>
          {/* Same actions as the row's right-click, reachable by pointing — the context menu was
              the only way in, which is not something a hover-only affordance advertises. It opens
              the very same native menu spec rather than a second, forkable definition of it. */}
          <button
            // Marked like the visibility toggle so the row's own click/Enter handlers skip it —
            // otherwise activating it with the keyboard would also select the stash.
            data-toggle="stash-actions"
            onClick={(e) => {
              e.stopPropagation()
              onStashContextMenu?.(e, row.stash)
            }}
            className="absolute right-1 top-1/2 -translate-y-1/2 shrink-0 rounded p-0.5 text-sidebar-muted-foreground opacity-0 transition-all hover:bg-sidebar-accent/80 hover:text-sidebar-foreground group-hover/stash:opacity-100"
            aria-label={t('sidebar.stashActions')}
            title={t('sidebar.stashActions')}
            data-testid={`stash-actions-button-${row.stash.index}`}
          >
            <MoreVertical className="h-3.5 w-3.5" />
          </button>
        </div>
      )
    }

    case 'submodule':
      return (
        <div
          data-testid={`submodule-item-${row.sm.path}`}
          className="group/sm relative flex items-start gap-1.5 py-[3px] pl-6 pr-2 text-xs text-sidebar-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
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
            <span className="shrink-0 font-mono text-[10px] tabular-nums text-sidebar-muted-foreground/30">
              {row.sm.headOid.slice(0, 7)}
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
