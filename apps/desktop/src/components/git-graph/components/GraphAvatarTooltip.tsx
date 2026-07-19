// Marqueur d'un commit dans la colonne graph (avatar / dot de merge / stash) + tooltip
// nom/email au survol. Extrait de `GraphRow.tsx` pour être réutilisé par `GraphCell.tsx`.

import { useState } from 'react'
import { createPortal } from 'react-dom'
import type { GitGraphNode } from '@git-manager/git-types'
import { cn } from '@git-manager/ui'
import { Archive } from 'lucide-react'
import { getAvatarUrl } from '../../../lib/avatar'
import { useSettingsStore } from '../../../stores/settings.store'
import { laneCenterX } from '../graphColumnSizing'

export function getAuthorInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }
  return name.slice(0, 2).toUpperCase()
}

interface GraphAvatarTooltipProps {
  node: GitGraphNode
  /** Center x (cell-relative) overriding the node's natural lane position — used when the
   * marker is clamped into the overflow zone or centered in compact mode. */
  centerX?: number
  /** Marker opacity (< 1 while it travels under the overflow fade zone). */
  opacity?: number
}

export function GraphAvatarTooltip({ node, centerX, opacity }: GraphAvatarTooltipProps) {
  const [isHovered, setIsHovered] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const { commit } = node
  const initials = getAuthorInitials(commit.author.name)
  const avatarUrl = getAvatarUrl(commit.author.email, commit.author.name)
  const [imgError, setImgError] = useState(false)

  const rowHeightSetting = useSettingsStore((s) => s.settings.appearance.rowHeight || 'standard')
  const avatarSize = rowHeightSetting === 'small' ? 24 : 32

  const nodeX = centerX ?? laneCenterX(node.column)

  function handleMouseEnter(e: React.MouseEvent) {
    const r = e.currentTarget.getBoundingClientRect()
    setPos({ top: r.top, left: r.left + r.width / 2 })
    setIsHovered(true)
  }

  function handleMouseLeave() {
    setIsHovered(false)
  }

  const isStash = node.refs.some((r) => r.type === 'stash')
  const isMerge = commit.parentOids.length > 1

  return (
    <div
      className="pointer-events-none absolute flex h-full items-center justify-center"
      style={{
        left: nodeX - avatarSize / 2,
        width: avatarSize,
        opacity: opacity !== undefined && opacity < 1 ? opacity : undefined,
      }}
    >
      <div
        className="pointer-events-auto"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {isStash ? (
          <div
            className={cn(
              'flex cursor-pointer select-none items-center justify-center overflow-hidden rounded-md border-2 border-dashed font-bold shadow-sm transition-all duration-150 hover:scale-110 hover:shadow-md',
              avatarSize === 24 ? 'text-[8px]' : 'text-[11px]'
            )}
            style={{
              width: avatarSize,
              height: avatarSize,
              borderColor: node.color,
              color: node.color,
              // Opaque page background so the colored band doesn't show through the dashed ring.
              backgroundColor: 'hsl(var(--background))',
            }}
          >
            <Archive className={avatarSize === 24 ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
          </div>
        ) : isMerge ? (
          /* Merge commit: flat circle filled with the target branch's lane color, no avatar —
           * half the avatar's diameter so it reads as a plain graph node, not a person. */
          <div
            className="cursor-pointer select-none rounded-full border border-background shadow-sm transition-all duration-150 hover:scale-110 hover:shadow-md"
            style={{
              width: avatarSize / 2,
              height: avatarSize / 2,
              backgroundColor: node.color,
            }}
          />
        ) : (
          /* Avatar Circle */
          <div
            className={cn(
              'flex cursor-pointer select-none items-center justify-center overflow-hidden rounded-full border border-background font-bold text-white shadow-sm transition-all duration-150 hover:scale-110 hover:shadow-md',
              avatarSize === 24 ? 'text-[8px]' : 'text-[11px]'
            )}
            style={{
              width: avatarSize,
              height: avatarSize,
              backgroundColor: avatarUrl && !imgError ? undefined : node.color,
            }}
          >
            {avatarUrl && !imgError ? (
              <img
                src={avatarUrl}
                alt={commit.author.name}
                className="h-full w-full object-cover"
                onError={() => setImgError(true)}
              />
            ) : (
              initials
            )}
          </div>
        )}
      </div>

      {isHovered &&
        createPortal(
          <div
            style={{
              position: 'fixed',
              top: pos.top - 10,
              left: pos.left,
              transform: 'translate(-50%, -100%)',
            }}
            className="animate-in fade-in-0 zoom-in-95 pointer-events-none z-[100] flex flex-col gap-0.5 whitespace-nowrap rounded-md border border-border bg-popover/95 px-2.5 py-1.5 text-popover-foreground shadow-xl backdrop-blur-md duration-100"
          >
            <span className="text-[10px] font-semibold leading-none">{commit.author.name}</span>
            <span className="mt-0.5 text-[9px] leading-none text-muted-foreground/90">
              {commit.author.email}
            </span>
            {/* Petit triangle en bas */}
            <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-popover/95" />
          </div>,
          document.body
        )}
    </div>
  )
}
