import { Pin, MessageSquare, ThumbsUp, GitBranch, GitBranchPlus, Loader2 } from 'lucide-react'
import { Tag } from '@git-manager/ui'
import { useTranslation } from '@git-manager/i18n'
import type { MockIssue } from '../types'
import { StatusBadge } from './Badges'
import { AvatarStack } from './AvatarStack'
import { SnoozeControl } from './SnoozeControl'
import { IssueQuickActions } from './IssueQuickActions'
import { openUrl, timeAgo } from '../utils'
import { useOpenIssue } from '../OpenIssueContext'
import { useIssueActions } from '../../../hooks/useIssueActions'

interface IssueRowProps {
  issue: MockIssue
  pinned: boolean
  onTogglePin: (id: string) => void
  /** Called after a mutation (e.g. the issue is closed) so the list can revalidate. */
  onChanged?: () => void
}

export function IssueRow({ issue, pinned, onTogglePin, onChanged }: IssueRowProps) {
  const { t } = useTranslation('launchpad')
  const openIssue = useOpenIssue()
  const { repoPath, branch, viewRepo, createBranch, creatingBranch, close, closing, canClose } =
    useIssueActions(issue, onChanged)

  const open = () => (openIssue ? openIssue(issue) : openUrl(issue.url))
  const extraLabels = issue.labels.length - 1

  return (
    // The `pr` group name is intentional: SnoozeControl + the pin reveal on `group-hover/pr`.
    <div
      className="group/pr relative flex cursor-pointer items-center gap-3 border-b border-border/30 px-4 py-2.5 transition-colors last:border-0 hover:bg-accent/30"
      onClick={open}
      data-testid={`issue-row-${issue.id}`}
    >
      {/* Pin + snooze */}
      <div className="flex w-7 shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => onTogglePin(issue.id)}
          title={pinned ? t('row.unpin') : t('row.pin')}
          className={`shrink-0 transition-all ${
            pinned
              ? 'text-amber-400'
              : 'text-muted-foreground/30 opacity-0 hover:text-amber-400 group-hover/pr:opacity-100'
          }`}
        >
          <Pin className={`h-3 w-3 ${pinned ? 'fill-amber-400' : ''}`} />
        </button>
        <SnoozeControl prId={issue.id} />
      </div>

      {/* Last update */}
      <div className="min-w-[52px] shrink-0 text-right text-[10px] text-muted-foreground">
        {timeAgo(issue.updatedAt)}
      </div>

      {/* Status */}
      <div className="flex w-[70px] shrink-0 justify-center">
        <StatusBadge status={issue.status} />
      </div>

      {/* Item: title #id + tags */}
      <div className="min-w-0 flex-1">
        <div className="leading-snug">
          <span className="text-xs font-medium text-foreground transition-colors [overflow-wrap:anywhere] group-hover/pr:text-primary">
            {issue.title}
          </span>{' '}
          <span className="whitespace-nowrap font-mono text-[10px] text-muted-foreground/60">
            #{issue.number}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground/50">
            <MessageSquare className="h-2.5 w-2.5" />
            {issue.comments}
          </span>
          {issue.thumbsUp > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground/50">
              <ThumbsUp className="h-2.5 w-2.5" />
              {issue.thumbsUp}
            </span>
          )}
          {issue.labels[0] && (
            <span className="rounded border border-border/50 bg-muted/60 px-1 py-px text-[9px] text-muted-foreground">
              {issue.labels[0]}
            </span>
          )}
          {extraLabels > 0 && (
            <Tag tone="neutral" className="shrink-0 px-1 text-[9px]">
              +{extraLabels}
            </Tag>
          )}
        </div>
      </div>

      {/* Author */}
      <div className="flex w-[90px] shrink-0 items-center gap-1.5">
        <img
          src={issue.authorAvatar}
          alt={issue.author}
          className="rounded-full border border-border bg-muted object-cover"
          style={{ width: 18, height: 18 }}
        />
        <span className="truncate text-[10px] text-muted-foreground">{issue.author}</span>
      </div>

      {/* Collaborators */}
      <div className="flex w-[60px] shrink-0 justify-center">
        {issue.assignees.length > 0 ? (
          <AvatarStack users={issue.assignees} max={3} />
        ) : (
          <span className="text-[10px] text-muted-foreground/30">—</span>
        )}
      </div>

      {/* Repo / branch */}
      <div className="w-[130px] shrink-0" onClick={(e) => e.stopPropagation()}>
        <span className="block truncate font-mono text-[10px] text-muted-foreground/70">
          {issue.repo}
        </span>
        {branch ? (
          <span
            className="mt-0.5 flex w-fit max-w-full items-center gap-0.5 rounded border border-border/50 bg-muted/60 px-1 py-px text-[9px] text-muted-foreground"
            title={branch}
            data-testid={`issue-branch-${issue.id}`}
          >
            <GitBranch className="h-2.5 w-2.5 shrink-0" />
            <span className="truncate font-mono">{branch}</span>
          </span>
        ) : repoPath ? (
          <button
            onClick={createBranch}
            disabled={creatingBranch}
            data-testid={`issue-create-branch-${issue.id}`}
            className="mt-0.5 flex w-fit items-center gap-0.5 rounded border border-border/50 px-1 py-px text-[9px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-50"
          >
            {creatingBranch ? (
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
            ) : (
              <GitBranchPlus className="h-2.5 w-2.5" />
            )}
            {t('row.createBranch')}
          </button>
        ) : null}
      </div>

      {/* Actions: a split button with a dropdown (View / Mark as closed / View repo / …) */}
      <div
        className="flex w-[124px] shrink-0 items-center justify-end"
        onClick={(e) => e.stopPropagation()}
      >
        <IssueQuickActions
          issue={issue}
          viewRepo={viewRepo}
          close={close}
          closing={closing}
          canClose={canClose}
        />
      </div>
    </div>
  )
}
