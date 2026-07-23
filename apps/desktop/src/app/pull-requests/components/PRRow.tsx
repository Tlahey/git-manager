import { Pin, GitMerge, XCircle, Circle, GitPullRequest, AlertCircle, PanelRight } from 'lucide-react'
import { Tag } from '@git-manager/ui'
import { useTranslation } from '@git-manager/i18n'
import type { MockPR } from '../types'
import { StatusBadge, CiBadge } from './Badges'
import { AvatarStack } from './AvatarStack'
import { PrQuickActions } from './PrQuickActions'
import { SnoozeControl } from './SnoozeControl'
import { openUrl, timeAgo } from '../utils'
import { useOpenPr } from '../OpenPrContext'

interface PRRowProps {
  pr: MockPR
  pinned: boolean
  onTogglePin: (id: string) => void
}

export function PRRow({ pr, pinned, onTogglePin }: PRRowProps) {
  const { t } = useTranslation('launchpad')
  const openPr = useOpenPr()

  return (
    <div
      className="group/pr relative flex cursor-pointer items-center gap-3 border-b border-border/30 px-4 py-2.5 transition-colors last:border-0 hover:bg-accent/30"
      onClick={() => (openPr ? openPr(pr) : openUrl(pr.url))}
    >
      <div className="flex shrink-0 items-center gap-1">
        <button
          onClick={(e) => {
            e.stopPropagation()
            onTogglePin(pr.id)
          }}
          title={pinned ? t('row.unpin') : t('row.pin')}
          className={`shrink-0 transition-all ${
            pinned
              ? 'text-amber-400'
              : 'text-muted-foreground/30 opacity-0 hover:text-amber-400 group-hover/pr:opacity-100'
          }`}
        >
          <Pin className={`h-3 w-3 ${pinned ? 'fill-amber-400' : ''}`} />
        </button>
        <SnoozeControl prId={pr.id} />
      </div>
      <div className="shrink-0">
        {pr.status === 'merged' ? (
          <GitMerge className="h-4 w-4 text-purple-400" />
        ) : pr.status === 'closed' ? (
          <XCircle className="h-4 w-4 text-destructive" />
        ) : pr.isDraft ? (
          <Circle className="h-4 w-4 text-muted-foreground" />
        ) : (
          <GitPullRequest className="h-4 w-4 text-green-400" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-xs font-medium text-foreground transition-colors group-hover/pr:text-primary">
            {pr.title}
          </span>
          <span className="shrink-0 font-mono text-[10px] text-muted-foreground/60">
            #{pr.number}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          {pr.additions > 0 || pr.deletions > 0 ? (
            <span className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground/60">
              <span className="text-green-400">+{pr.additions}</span>
              <span className="text-red-400">−{pr.deletions}</span>
              {pr.filesChanged > 0 && (
                <span className="text-muted-foreground/40">
                  · {t('row.filesCount', { count: pr.filesChanged })}
                </span>
              )}
            </span>
          ) : pr.filesChanged > 0 ? (
            <span className="font-mono text-[10px] text-muted-foreground/60">
              {t('row.filesCount', { count: pr.filesChanged })}
            </span>
          ) : null}
          {pr.labels.slice(0, 2).map((l) => (
            <span
              key={l}
              className="rounded border border-border/50 bg-muted/60 px-1 py-px text-[9px] text-muted-foreground"
            >
              {l}
            </span>
          ))}
          {pr.needsRebase && (
            <Tag tone="warning" className="shrink-0 gap-0.5 px-1 text-[9px] font-medium">
              <AlertCircle className="h-2.5 w-2.5" /> {t('row.rebaseRequired')}
            </Tag>
          )}
        </div>
      </div>
      <div className="min-w-[52px] shrink-0 text-right text-[10px] text-muted-foreground">
        {timeAgo(pr.updatedAt)}
      </div>
      <div className="flex w-[80px] shrink-0 justify-center">
        <StatusBadge status={pr.status} />
      </div>
      <div className="flex w-[90px] shrink-0 items-center gap-1.5">
        <img
          src={pr.authorAvatar}
          alt={pr.author}
          className="rounded-full border border-border bg-muted object-cover"
          style={{ width: 18, height: 18 }}
        />
        <span className="truncate text-[10px] text-muted-foreground">{pr.author}</span>
      </div>
      <div className="flex w-[60px] shrink-0 justify-center">
        {pr.collaborators.length > 0 ? (
          <AvatarStack users={pr.collaborators} max={3} />
        ) : (
          <span className="text-[10px] text-muted-foreground/30">—</span>
        )}
      </div>
      <div className="w-[110px] shrink-0">
        <span className="block truncate font-mono text-[10px] text-muted-foreground/70">
          {pr.repo}
        </span>
      </div>
      <div className="flex w-[60px] shrink-0 justify-center">
        <CiBadge status={pr.ciStatus} details={pr.ciDetails} prUrl={pr.url} />
      </div>
      <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
        <PrQuickActions pr={pr} />
      </div>
      {openPr && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            openPr(pr)
          }}
          title={t('row.openInApp')}
          aria-label={t('row.openInApp')}
          data-testid={`pr-open-in-app-${pr.id}`}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-transparent text-muted-foreground opacity-0 transition-all hover:border-border hover:bg-accent hover:text-foreground group-hover/pr:opacity-100"
        >
          <PanelRight className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}
