import React, { useState } from 'react'
import {
  Pin,
  GitMerge,
  XCircle,
  Circle,
  GitPullRequest,
  AlertCircle,
  MoreHorizontal,
  ExternalLink,
  Link,
} from 'lucide-react'
import { Tag } from '@git-manager/ui'
import { useTranslation } from '@git-manager/i18n'
import type { MockPR } from '../types'
import { StatusBadge, CiBadge } from './Badges'
import { AvatarStack } from './AvatarStack'
import { openUrl, timeAgo } from '../utils'

interface ActionMenuProps {
  items: {
    label: string
    icon: React.ReactNode
    action: () => void
  }[]
  onClose: () => void
}

function ActionMenu({ items, onClose }: ActionMenuProps) {
  return (
    <>
      <div className="fixed inset-0 z-panel" onClick={onClose} />
      <div className="absolute right-0 top-full z-popover mt-1 w-44 overflow-hidden rounded-lg border border-border bg-popover py-1 shadow-xl">
        {items.map((item) => (
          <button
            key={item.label}
            onClick={() => {
              item.action()
              onClose()
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-accent"
          >
            <span className="text-muted-foreground">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </div>
    </>
  )
}

interface PRRowProps {
  pr: MockPR
  pinned: boolean
  onTogglePin: (id: string) => void
}

export function PRRow({ pr, pinned, onTogglePin }: PRRowProps) {
  const { t } = useTranslation('launchpad')
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div
      className="group/pr relative flex cursor-pointer items-center gap-3 border-b border-border/30 px-4 py-2.5 transition-colors last:border-0 hover:bg-accent/30"
      onClick={() => openUrl(pr.url)}
    >
      <button
        onClick={(e) => {
          e.stopPropagation()
          onTogglePin(pr.id)
        }}
        title={pinned ? t('row.unpin') : t('row.pin')}
        className={`shrink-0 transition-colors ${
          pinned ? 'text-amber-400' : 'text-muted-foreground/30 hover:text-amber-400'
        }`}
      >
        <Pin className={`h-3 w-3 ${pinned ? 'fill-amber-400' : ''}`} />
      </button>
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
      <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="flex h-6 w-6 items-center justify-center rounded border border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-accent hover:text-foreground"
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>
        {menuOpen && (
          <ActionMenu
            items={[
              {
                label: t('row.openOnGitHub'),
                icon: <ExternalLink className="h-3 w-3" />,
                action: () => openUrl(pr.url),
              },
              {
                label: t('row.copyLink'),
                icon: <Link className="h-3 w-3" />,
                action: () => navigator.clipboard.writeText(pr.url),
              },
              {
                label: pinned ? t('row.unpin') : t('row.pin'),
                icon: <Pin className="h-3 w-3" />,
                action: () => onTogglePin(pr.id),
              },
            ]}
            onClose={() => setMenuOpen(false)}
          />
        )}
      </div>
    </div>
  )
}
