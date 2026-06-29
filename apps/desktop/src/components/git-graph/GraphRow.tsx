import { memo, useState } from 'react'
import { createPortal } from 'react-dom'
import { MoreVertical, FileText } from 'lucide-react'
import type { GitGraphNode } from '@git-manager/git-types'
import { cn } from '@git-manager/ui'
import { GraphSvg } from './GraphSvg'
import { RefLabelGroup } from './RefLabelGroup'
import type { ColumnKey, ResolvedColumn } from './columns'
import { getAvatarUrl } from '../../lib/avatar'

interface GraphRowProps {
  node: GitGraphNode
  columns: ResolvedColumn[]
  isSelected: boolean
  isPrimary: boolean
  /** Clic gauche (gère simple / Cmd+clic / Shift+clic via l'event). */
  onSelect: (e: React.MouseEvent) => void
  /** Clic droit : ouvre le menu contextuel d'actions. */
  onContextMenu: (e: React.MouseEvent) => void
  /** Clic sur l'icône ⋮ : ouvre le menu contextuel d'actions. */
  onOpenMenu: (e: React.MouseEvent) => void
  totalChanges?: number
  onCommitWip?: (message: string) => void
}

function formatRelativeDate(timestamp: number): string {
  const now = Date.now() / 1000
  const diff = now - timestamp

  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)}d ago`
  if (diff < 86400 * 365) return `${Math.floor(diff / (86400 * 30))}mo ago`
  return `${Math.floor(diff / (86400 * 365))}y ago`
}

function formatExactDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString()
}

// ── Author avatar helpers ─────────────────────────────────────────────────────

const AVATAR_COLORS = [
  '#7c3aed',
  '#2563eb',
  '#16a34a',
  '#d97706',
  '#dc2626',
  '#0891b2',
  '#be185d',
  '#65a30d',
]

function hashString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
    hash |= 0
  }
  return Math.abs(hash)
}

function getAuthorColor(name: string): string {
  return AVATAR_COLORS[hashString(name) % AVATAR_COLORS.length]
}

function getAuthorInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }
  return name.slice(0, 2).toUpperCase()
}

function AuthorAvatar({ name, email }: { name: string; email?: string }) {
  const avatarUrl = getAvatarUrl(email, name)
  const [imgError, setImgError] = useState(false)

  return (
    <div
      className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[7px] font-bold text-white overflow-hidden"
      style={{ backgroundColor: avatarUrl && !imgError ? undefined : getAuthorColor(name) }}
      title={name}
    >
      {avatarUrl && !imgError ? (
        <img
          src={avatarUrl}
          alt={name}
          className="h-full w-full object-cover"
          onError={() => setImgError(true)}
        />
      ) : (
        getAuthorInitials(name)
      )}
    </div>
  )
}

export function GraphAvatarTooltip({ node }: { node: GitGraphNode }) {
  const [isHovered, setIsHovered] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const { commit } = node
  const initials = getAuthorInitials(commit.author.name)
  const avatarUrl = getAvatarUrl(commit.author.email, commit.author.name)
  const [imgError, setImgError] = useState(false)

  const COL_WIDTH = 36
  const nodeX = node.column * COL_WIDTH + COL_WIDTH / 2

  function handleMouseEnter(e: React.MouseEvent) {
    const r = e.currentTarget.getBoundingClientRect()
    setPos({ top: r.top, left: r.left + r.width / 2 })
    setIsHovered(true)
  }

  function handleMouseLeave() {
    setIsHovered(false)
  }

  return (
    <div
      className="absolute h-full flex items-center justify-center pointer-events-none"
      style={{ left: nodeX - 16, width: 32 }}
    >
      <div
        className="pointer-events-auto"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {/* Avatar Circle */}
        <div
          className="flex h-[32px] w-[32px] items-center justify-center rounded-full text-[11px] font-bold text-white select-none cursor-pointer border border-background shadow-sm hover:scale-110 hover:shadow-md transition-all duration-150 overflow-hidden"
          style={{ backgroundColor: avatarUrl && !imgError ? undefined : node.color }}
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
            className="z-[100] pointer-events-none flex flex-col gap-0.5 rounded-md border border-border bg-popover/95 backdrop-blur-md px-2.5 py-1.5 shadow-xl text-popover-foreground whitespace-nowrap animate-in fade-in-0 zoom-in-95 duration-100"
          >
            <span className="text-[10px] font-semibold leading-none">{commit.author.name}</span>
            <span className="text-[9px] text-muted-foreground/90 leading-none mt-0.5">{commit.author.email}</span>
            {/* Petit triangle en bas */}
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-popover/95" />
          </div>,
          document.body,
        )}
    </div>
  )
}

function WipCommitInput({
  totalChanges,
  color,
  onCommit,
}: {
  totalChanges: number
  color?: string
  onCommit?: (message: string) => void
}) {
  const [value, setValue] = useState('')

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      e.stopPropagation()
      if (value.trim()) {
        onCommit?.(value)
      }
    }
  }

  return (
    <div className="flex items-center w-full gap-2 pr-4" onClick={(e) => e.stopPropagation()}>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="// WIP"
        style={{ color, borderColor: color ? `${color}40` : undefined }}
        className="flex-1 min-w-0 bg-transparent placeholder-muted-foreground/60 text-[11px] h-6 px-2 rounded border focus:border-primary/60 focus:outline-none transition-colors"
      />
      <div
        className="flex items-center gap-1 shrink-0 text-[10px] font-semibold text-muted-foreground bg-muted/40 px-2 py-0.5 rounded border border-border/30"
        title={`${totalChanges} files changed`}
      >
        <FileText className="h-3 w-3 text-muted-foreground/60" />
        <span>{totalChanges}</span>
      </div>
    </div>
  )
}

// ── Cellules ──────────────────────────────────────────────────────────────────

function CellContent({
  col,
  node,
  refsWidth,
  totalChanges,
  onCommitWip,
}: {
  col: ColumnKey
  node: GitGraphNode
  refsWidth: number
  totalChanges?: number
  onCommitWip?: (message: string) => void
}) {
  const { commit } = node

  switch (col) {
    case 'refs': {
      if (node.refs.length === 0) return null
      const hasOriginMain = node.refs.some(
        (r) =>
          r.shortName.endsWith('/main') ||
          r.shortName.endsWith('/master')
      )
      return (
        <div className="flex items-center w-full h-full min-w-0 overflow-visible">
          <RefLabelGroup refs={node.refs} color={node.color} />
          <div
            className="flex-1 h-[2px] ml-2 pointer-events-none transition-colors"
            style={{
              backgroundColor: hasOriginMain ? node.color : `${node.color}75`,
              marginRight: `-${node.column * 36 + 26}px`,
            }}
          />
        </div>
      )
    }

    case 'graph': {
      const COL_WIDTH = 36
      const nodeX = node.column * COL_WIDTH + COL_WIDTH / 2
      return (
        <div className="w-full h-full relative overflow-visible flex items-center">
          {/* Conteneur de découpe (clip) élargi pour le graph uniquement */}
          <div
            className="absolute overflow-hidden pointer-events-none"
            style={{ left: -refsWidth, right: 0, top: -4, bottom: -5 }}
          >
            {/* Conteneur interne réaligné sur la colonne graph */}
            <div
              className="absolute pointer-events-none"
              style={{ left: refsWidth, right: 0, top: 0, bottom: 0 }}
            >
              <GraphSvg
                column={node.column}
                connections={node.connections}
                isWip={node.commit.oid === 'WIP'}
              />
            </div>
          </div>

          {/* Conteneur de découpe simple et direct pour les avatars */}
          <div className="absolute inset-y-0 left-0 right-0 overflow-hidden pointer-events-none">
            {node.commit.oid === 'WIP' ? (
              <div
                className="absolute h-full flex items-center justify-center pointer-events-none"
                style={{ left: nodeX - 16, width: 32 }}
              >
                <div
                  className="flex h-[32px] w-[32px] items-center justify-center rounded-full border border-dashed select-none shadow-sm transition-all duration-150"
                  style={{ borderColor: node.color, backgroundColor: 'transparent' }}
                />
              </div>
            ) : (
              <GraphAvatarTooltip node={node} />
            )}
          </div>
        </div>
      )
    }

    case 'message': {
      if (node.commit.oid === 'WIP') {
        return <WipCommitInput totalChanges={totalChanges ?? 0} color={node.color} onCommit={onCommitWip} />
      }
      const body = commit.body?.replace(/\s+/g, ' ').trim()
      return (
        <span className="min-w-0 flex-1 truncate text-[11px] leading-tight">
          <span className="text-foreground">{commit.subject}</span>
          {body && <span className="ml-2 text-muted-foreground/70">{body}</span>}
        </span>
      )
    }

    case 'author':
      if (node.commit.oid === 'WIP') return null
      return (
        <div className="flex min-w-0 items-center gap-1.5">
          <AuthorAvatar name={commit.author.name} email={commit.author.email} />
          <span className="truncate text-[10px] text-muted-foreground">{commit.author.name}</span>
        </div>
      )

    case 'date':
      if (node.commit.oid === 'WIP') return null
      return (
        <span
          className="truncate text-[10px] text-muted-foreground/70"
          title={formatExactDate(commit.author.timestamp)}
        >
          {formatRelativeDate(commit.author.timestamp)}
        </span>
      )

    case 'sha':
      if (node.commit.oid === 'WIP') return null
      return (
        <code className="truncate font-mono text-[10px] text-muted-foreground" title={commit.oid}>
          {commit.shortOid}
        </code>
      )
  }
}

// ── GraphRow ──────────────────────────────────────────────────────────────────

export const GraphRow = memo(function GraphRow({
  node,
  columns,
  isSelected,
  isPrimary,
  onSelect,
  onContextMenu,
  onOpenMenu,
  totalChanges,
  onCommitWip,
}: GraphRowProps) {
  const refsColumn = columns.find((c) => c.key === 'refs')
  const refsWidth = refsColumn ? refsColumn.width : 160
  const graphColumn = columns.find((c) => c.key === 'graph')
  const graphWidth = graphColumn ? graphColumn.width : 120
  const COL_WIDTH = 36
  const nodeX = node.column * COL_WIDTH + COL_WIDTH / 2
  // Left edge of the avatar is nodeX - 16. Shifted by 8px cell padding: refsWidth + 8 + nodeX - 16 = refsWidth + nodeX - 8
  const startX = refsWidth + nodeX - 8
  const endX = refsWidth + graphWidth

  return (
    <div
      onClick={onSelect}
      onContextMenu={onContextMenu}
      className={cn(
        'group relative flex h-[32px] my-[4px] cursor-pointer select-none items-center border-b border-transparent transition-colors hover:z-[60]',
      )}
    >
      {/* Background colored band starting from the avatar to the right boundary of the graph column, with border-right */}
      <div
        className="absolute inset-y-0 pointer-events-none border-r-[3px] transition-colors"
        style={{
          left: startX,
          width: Math.max(0, endX - startX),
          backgroundColor: `${node.color}15`, // ~8% opacity
          borderRightColor: node.color,
        }}
      />

      {/* Selection background starting from the end of the graph column to the right end of the row */}
      {(isSelected || isPrimary) && (
        <div
          className={cn(
            "absolute inset-y-0 pointer-events-none transition-colors",
            isPrimary ? "bg-accent" : "bg-accent/70"
          )}
          style={{
            left: endX,
            right: 0,
          }}
        />
      )}

      {/* Hover background starting from the end of the graph column to the right end of the row */}
      <div
        className="absolute inset-y-0 pointer-events-none bg-accent/50 transition-opacity opacity-0 group-hover:opacity-100"
        style={{
          left: endX,
          right: 0,
        }}
      />

      {columns.map((col) => (
        <div
          key={col.key}
          className={cn(
            "relative z-10 flex h-full min-w-0 items-center",
            col.key === 'refs' ? 'justify-start pl-2' : 'mx-2',
            col.key === 'graph' && 'px-0'
          )}
          style={col.flex ? { flex: '1 1 0%' } : { width: col.width, flexShrink: 0 }}
        >
          <CellContent
            col={col.key}
            node={node}
            refsWidth={refsWidth}
            totalChanges={totalChanges}
            onCommitWip={onCommitWip}
          />
        </div>
      ))}

      {/* Icône ⋮ — actions au survol de la ligne (clic gauche alternatif) */}
      <button
        type="button"
        onClick={onOpenMenu}
        className="absolute right-1 top-1/2 hidden h-6 w-6 -translate-y-1/2 items-center justify-center rounded bg-card/90 text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-foreground group-hover:flex"
        title="Actions"
      >
        <MoreVertical className="h-3.5 w-3.5" />
      </button>
    </div>
  )
})
