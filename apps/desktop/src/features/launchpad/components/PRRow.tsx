import {
  Pin,
  GitMerge,
  GitPullRequest,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  PanelRight,
  GitBranch,
} from 'lucide-react'
import { Tag, Tooltip } from '@git-manager/ui'
import { useTranslation } from '@git-manager/i18n'
import type { MockPR } from '../../../lib/github/types'
import { CiBadge } from './Badges'
import { AvatarStack } from './AvatarStack'
import { CommitAvatar } from '../../../components/common/CommitAvatar'
import { PrQuickActions } from './PrQuickActions'
import { SnoozeControl } from './SnoozeControl'
import { openUrl } from '../../../lib/openUrl'
import { formatRelativeTimeCompact } from '../../../lib/relativeDate'
import { useOpenPr } from './OpenPrContext'

interface PRRowProps {
  pr: MockPR
  pinned: boolean
  onTogglePin: (id: string) => void
}

export function PRRow({ pr, pinned, onTogglePin }: PRRowProps) {
  const { t, i18n } = useTranslation('launchpad')
  const openPr = useOpenPr()

  const statusLabel =
    pr.status === 'merged'
      ? t('status.merged')
      : pr.status === 'closed'
        ? t('status.closed')
        : pr.status === 'changes_requested'
          ? t('status.changes')
          : pr.isDraft || pr.status === 'draft'
            ? t('status.draft')
            : pr.status === 'approved'
              ? t('status.approved')
              : t('status.open')

  const tooltipContent = (
    <div className="flex flex-col gap-0.5 p-0.5 text-[10px]">
      <div className="font-semibold text-foreground">
        {t('table.status')}: {statusLabel}
      </div>
      {pr.needsRebase && (
        <div className="font-medium text-tone-warning">⚠️ {t('row.rebaseRequired')}</div>
      )}
    </div>
  )

  return (
    <div
      className="group/pr relative flex items-center gap-3 border-b border-border/30 px-4 py-2.5 transition-colors last:border-0 hover:bg-accent/30"
      data-testid={`pr-row-${pr.id}`}
    >
      {/* Pin + snooze */}
      <div className="flex w-7 shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => onTogglePin(pr.id)}
          title={pinned ? t('row.unpin') : t('row.pin')}
          aria-label={pinned ? t('row.unpin') : t('row.pin')}
          className={`shrink-0 cursor-pointer transition-all ${
            pinned
              ? 'text-amber-400'
              : 'text-muted-foreground/30 opacity-0 group-hover/pr:opacity-100 hover:text-amber-400'
          }`}
        >
          <Pin className={`h-3 w-3 ${pinned ? 'fill-amber-400' : ''}`} />
        </button>
        <SnoozeControl prId={pr.id} />
      </div>

      {/* Last update */}
      <div className="min-w-[52px] shrink-0 text-right text-[10px] text-muted-foreground">
        {formatRelativeTimeCompact(pr.updatedAt, i18n.language)}
      </div>

      {/* Status */}
      <div className="flex w-[70px] shrink-0 items-center justify-start">
        <Tooltip content={tooltipContent}>
          <div className="flex cursor-help items-center gap-1.5">
            {pr.status === 'merged' ? (
              <GitMerge
                className="h-4 w-4 text-purple-500 dark:text-purple-400"
                aria-label={t('status.merged')}
              />
            ) : pr.status === 'closed' ? (
              <XCircle
                className="h-4 w-4 text-red-500 dark:text-red-400"
                aria-label={t('status.closed')}
              />
            ) : pr.status === 'changes_requested' ? (
              <GitPullRequest
                className="h-4 w-4 text-red-500 dark:text-red-400"
                aria-label={t('status.changes')}
              />
            ) : pr.isDraft || pr.status === 'draft' ? (
              <GitPullRequest
                className="h-4 w-4 text-muted-foreground"
                aria-label={t('status.draft')}
              />
            ) : pr.status === 'approved' ? (
              <CheckCircle2
                className="h-4 w-4 text-green-500 dark:text-green-400"
                aria-label={t('status.approved')}
              />
            ) : (
              <GitPullRequest
                className="h-4 w-4 text-green-500 dark:text-green-400"
                aria-label={t('status.open')}
              />
            )}
            {pr.needsRebase && (
              <AlertTriangle
                className="h-4 w-4 text-amber-500 dark:text-amber-400"
                aria-label={t('row.rebaseRequired')}
                data-testid={`pr-rebase-icon-${pr.id}`}
              />
            )}
          </div>
        </Tooltip>
      </div>

      {/* Item: title #id + tags */}
      <div className="min-w-0 flex-1">
        <div className="leading-snug">
          <span className="text-xs font-medium wrap-anywhere text-foreground transition-colors group-hover/pr:text-primary">
            {pr.title}
          </span>{' '}
          <button
            onClick={(e) => {
              e.stopPropagation()
              openUrl(pr.url)
            }}
            title={t('row.openOnGitHub')}
            aria-label={t('row.openOnGitHub')}
            data-testid={`pr-number-link-${pr.id}`}
            className="cursor-pointer font-mono text-[10px] whitespace-nowrap text-muted-foreground/60 transition-colors hover:text-primary hover:underline"
          >
            #{pr.number}
          </button>
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          {pr.additions > 0 && (
            <Tag tone="success" className="px-1 py-px font-mono text-[9px]">
              +{pr.additions}
            </Tag>
          )}
          {pr.deletions > 0 && (
            <Tag tone="danger" className="px-1 py-px font-mono text-[9px]">
              −{pr.deletions}
            </Tag>
          )}
          {pr.filesChanged > 0 && (
            <span className="font-mono text-[10px] text-muted-foreground/60">
              {pr.additions > 0 || pr.deletions > 0
                ? `· ${t('row.filesCount', { count: pr.filesChanged })}`
                : t('row.filesCount', { count: pr.filesChanged })}
            </span>
          )}
          <CiBadge status={pr.ciStatus} details={pr.ciDetails} prUrl={pr.url} />
          {pr.labels.slice(0, 2).map((l) => (
            <span
              key={l}
              className="rounded border border-border/50 bg-muted/60 px-1 py-px text-[9px] text-muted-foreground"
            >
              {l}
            </span>
          ))}
        </div>
      </div>

      {/* Author */}
      <div className="flex w-[90px] shrink-0 items-center gap-1.5">
        {/* A raw <img> used to sit here, so an author GitHub reports without a picture — a deleted
            account, or a pull request followed by URL, whose `authorAvatar` is '' — rendered as a
            broken-image glyph. The graph's avatar falls back to the author's own coloured
            initials instead, which is the same answer everywhere in the app. */}
        <CommitAvatar avatarUrl={pr.authorAvatar} name={pr.author} size={18} />
        <span className="truncate text-[10px] text-muted-foreground">{pr.author}</span>
      </div>

      {/* Collaborators */}
      <div className="flex w-[60px] shrink-0 justify-center">
        {pr.collaborators.length > 0 ? (
          <AvatarStack users={pr.collaborators} max={3} />
        ) : (
          <span className="text-[10px] text-muted-foreground/30">—</span>
        )}
      </div>

      {/* Repo / branch */}
      <div className="w-[130px] shrink-0" onClick={(e) => e.stopPropagation()}>
        <span className="block truncate font-mono text-[10px] text-muted-foreground/70">
          {pr.repo}
        </span>
        {pr.headRef && (
          <span
            className="mt-0.5 flex w-fit max-w-full items-center gap-0.5 rounded border border-border/50 bg-muted/60 px-1 py-px text-[9px] text-muted-foreground"
            title={pr.headRef}
            data-testid={`pr-branch-${pr.id}`}
          >
            <GitBranch className="h-2.5 w-2.5 shrink-0" />
            <span className="truncate font-mono">{pr.headRef}</span>
          </span>
        )}
      </div>

      {/* Actions */}
      <div
        className="flex w-[150px] shrink-0 items-center justify-end gap-1"
        onClick={(e) => e.stopPropagation()}
      >
        <PrQuickActions pr={pr} />
        {openPr && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              openPr(pr)
            }}
            title={t('row.openInApp')}
            aria-label={t('row.openInApp')}
            data-testid={`pr-open-in-app-${pr.id}`}
            className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded border border-transparent text-muted-foreground opacity-0 transition-all group-hover/pr:opacity-100 hover:border-border hover:bg-accent hover:text-foreground"
          >
            <PanelRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}
