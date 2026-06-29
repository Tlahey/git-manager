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
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute right-0 top-full z-50 mt-1 w-44 rounded-lg border border-border bg-popover shadow-xl py-1 overflow-hidden">
        {items.map((item) => (
          <button
            key={item.label}
            onClick={() => {
              item.action()
              onClose()
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-foreground hover:bg-accent transition-colors"
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
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div
      className="group/pr relative flex items-center gap-3 px-4 py-2.5 hover:bg-accent/30 transition-colors cursor-pointer border-b border-border/30 last:border-0"
      onClick={() => openUrl(pr.url)}
    >
      <button
        onClick={(e) => {
          e.stopPropagation()
          onTogglePin(pr.id)
        }}
        title={pinned ? 'Unpin' : 'Pin'}
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
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-medium text-foreground group-hover/pr:text-primary transition-colors truncate">
            {pr.title}
          </span>
          <span className="text-[10px] font-mono text-muted-foreground/60 shrink-0">
            #{pr.number}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {pr.additions > 0 || pr.deletions > 0 ? (
            <span className="text-[10px] font-mono text-muted-foreground/60 flex items-center gap-1">
              <span className="text-green-400">+{pr.additions}</span>
              <span className="text-red-400">−{pr.deletions}</span>
              {pr.filesChanged > 0 && <span className="text-muted-foreground/40">· {pr.filesChanged} files</span>}
            </span>
          ) : pr.filesChanged > 0 ? (
            <span className="text-[10px] font-mono text-muted-foreground/60">
              {pr.filesChanged} files
            </span>
          ) : null}
          {pr.labels.slice(0, 2).map((l) => (
            <span
              key={l}
              className="text-[9px] bg-muted/60 text-muted-foreground border border-border/50 rounded px-1 py-px"
            >
              {l}
            </span>
          ))}
          {pr.needsRebase && (
            <span className="text-[9px] bg-amber-500/15 text-amber-500 border border-amber-500/35 rounded px-1 py-0.5 flex items-center gap-0.5 font-medium shrink-0">
              <AlertCircle className="h-2.5 w-2.5 text-amber-500" /> Rebase required
            </span>
          )}
        </div>
      </div>
      <div className="shrink-0 text-[10px] text-muted-foreground min-w-[52px] text-right">
        {timeAgo(pr.updatedAt)}
      </div>
      <div className="shrink-0 w-[80px] flex justify-center">
        <StatusBadge status={pr.status} />
      </div>
      <div className="shrink-0 flex items-center gap-1.5 w-[90px]">
        <img
          src={pr.authorAvatar}
          alt={pr.author}
          className="rounded-full bg-muted border border-border object-cover"
          style={{ width: 18, height: 18 }}
        />
        <span className="text-[10px] text-muted-foreground truncate">{pr.author}</span>
      </div>
      <div className="shrink-0 w-[60px] flex justify-center">
        {pr.collaborators.length > 0 ? (
          <AvatarStack users={pr.collaborators} max={3} />
        ) : (
          <span className="text-muted-foreground/30 text-[10px]">—</span>
        )}
      </div>
      <div className="shrink-0 w-[110px]">
        <span className="text-[10px] font-mono text-muted-foreground/70 truncate block">
          {pr.repo}
        </span>
      </div>
      <div className="shrink-0 w-[60px] flex justify-center">
        <CiBadge status={pr.ciStatus} details={pr.ciDetails} />
      </div>
      <div className="shrink-0 relative" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="h-6 w-6 flex items-center justify-center rounded border border-transparent hover:border-border hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>
        {menuOpen && (
          <ActionMenu
            items={[
              {
                label: 'Open on GitHub',
                icon: <ExternalLink className="h-3 w-3" />,
                action: () => openUrl(pr.url),
              },
              {
                label: 'Copy link',
                icon: <Link className="h-3 w-3" />,
                action: () => navigator.clipboard.writeText(pr.url),
              },
              {
                label: pinned ? 'Unpin' : 'Pin',
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
