import { Archive } from 'lucide-react'
import { Avatar } from '@git-manager/ui'
import { useTranslation } from '@git-manager/i18n'
import { getAvatarUrl } from '../../../lib/avatar'
import { getAuthorInitials } from './GraphAvatarTooltip'

// ── Author avatar helpers ─────────────────────────────────────────────────────

// White initials sit on these fills, so each must clear APCA Bronze (≥75Lc at
// the avatar's ~13px/700). The greens/amber/cyan/lime were darkened one shade
// to pass (e.g. green-600 #16a34a → green-700 #15803d) while keeping the hue.
const AVATAR_COLORS = [
  '#7c3aed', // violet-600  — 82.8Lc
  '#2563eb', // blue-600    — 80.3Lc
  '#15803d', // green-700   — 79.6Lc (was #16a34a green-600, 65.2Lc)
  '#b45309', // amber-700   — 79.5Lc (was #d97706 amber-600, 63.9Lc)
  '#dc2626', // red-600     — 77.0Lc
  '#0e7490', // cyan-700    — 81.6Lc (was #0891b2 cyan-600, 69.3Lc)
  '#be185d', // pink-700    — 83.5Lc
  '#4d7c0f', // lime-700    — 79.7Lc (was #65a30d lime-600, 62.9Lc)
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
  const { t } = useTranslation('git')
  const avatarUrl = getAvatarUrl(email, name)

  if (isStash) {
    return (
      <div
        className={`flex shrink-0 items-center justify-center rounded border border-dashed border-violet-400/60 bg-transparent text-violet-400 ${className}`}
        title={t('commitGraph.stashTitle')}
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
