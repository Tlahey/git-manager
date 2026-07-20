import { Archive } from 'lucide-react'
import { Avatar } from '@git-manager/ui'
import { getAvatarUrl } from '../../../lib/avatar'
import { getAuthorInitials } from './GraphAvatarTooltip'

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

/** Deterministic fallback background color for an author with no gravatar. */
export function getAuthorColor(name: string): string {
  return AVATAR_COLORS[hashString(name) % AVATAR_COLORS.length]
}

interface AuthorAvatarProps {
  name: string
  email?: string
  /** Renders the dashed "stash" glyph instead of an author avatar. */
  isStash?: boolean
  /** Tailwind size classes for the avatar box (default the graph-row size). */
  className?: string
}

/**
 * Small round author avatar: gravatar when available, otherwise initials on a name-hashed color.
 * Shared by the graph rows (`GraphRow`) and the AUTHOR column filter popover
 * (`GraphHeaderAuthorFilter`).
 */
export function AuthorAvatar({
  name,
  email,
  isStash,
  className = 'h-4 w-4 text-[7px]',
}: AuthorAvatarProps) {
  const avatarUrl = getAvatarUrl(email, name)

  if (isStash) {
    return (
      <div
        className={`flex shrink-0 items-center justify-center rounded border border-dashed border-violet-400/60 bg-transparent text-violet-400 ${className}`}
        title="Stash"
      >
        <Archive className="h-2.5 w-2.5" />
      </div>
    )
  }

  return (
    <Avatar
      src={avatarUrl}
      alt={name}
      fallback={getAuthorInitials(name)}
      className={className}
      // Name-hashed fill behind the initials; the image (when present) covers it.
      style={{ backgroundColor: getAuthorColor(name) }}
    />
  )
}
