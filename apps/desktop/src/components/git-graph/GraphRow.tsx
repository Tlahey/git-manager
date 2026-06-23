import { memo } from 'react'
import { MoreVertical } from 'lucide-react'
import type { GitGraphNode } from '@git-manager/git-types'
import { cn } from '@git-manager/ui'
import { GraphSvg } from './GraphSvg'
import { RefLabelGroup } from './RefLabelGroup'
import type { ColumnKey, ResolvedColumn } from './columns'

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

function AuthorAvatar({ name }: { name: string }) {
  return (
    <div
      className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[7px] font-bold text-white"
      style={{ backgroundColor: getAuthorColor(name) }}
      title={name}
    >
      {getAuthorInitials(name)}
    </div>
  )
}

// ── Cellules ──────────────────────────────────────────────────────────────────

function CellContent({ col, node }: { col: ColumnKey; node: GitGraphNode }) {
  const { commit } = node

  switch (col) {
    case 'refs':
      return node.refs.length > 0 ? <RefLabelGroup refs={node.refs} /> : null

    case 'graph':
      return (
        <div className="h-full overflow-hidden">
          <GraphSvg column={node.column} color={node.color} connections={node.connections} />
        </div>
      )

    case 'message': {
      const body = commit.body?.replace(/\s+/g, ' ').trim()
      return (
        <span className="min-w-0 flex-1 truncate text-[10px] leading-tight">
          <span className="text-foreground">{commit.subject}</span>
          {body && <span className="ml-2 text-muted-foreground/70">{body}</span>}
        </span>
      )
    }

    case 'author':
      return (
        <div className="flex min-w-0 items-center gap-1.5">
          <AuthorAvatar name={commit.author.name} />
          <span className="truncate text-[10px] text-muted-foreground">{commit.author.name}</span>
        </div>
      )

    case 'date':
      return (
        <span
          className="truncate text-[10px] text-muted-foreground/70"
          title={formatExactDate(commit.author.timestamp)}
        >
          {formatRelativeDate(commit.author.timestamp)}
        </span>
      )

    case 'sha':
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
}: GraphRowProps) {
  return (
    <div
      onClick={onSelect}
      onContextMenu={onContextMenu}
      className={cn(
        'group relative flex h-[26px] cursor-pointer select-none items-center border-b border-transparent transition-colors hover:bg-accent/50',
        isSelected && 'bg-accent/70',
        isPrimary && 'bg-accent',
      )}
    >
      {columns.map((col) => (
        <div
          key={col.key}
          className="flex h-full min-w-0 items-center px-2"
          style={col.flex ? { flex: '1 1 0%' } : { width: col.width, flexShrink: 0 }}
        >
          <CellContent col={col.key} node={node} />
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
