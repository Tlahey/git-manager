/** Shared helpers for rendering author avatars as colored initials when no image is available.
 * Extracted from `CommitDetailsAvatar` so the blame gutter / history panel reuse the same look. */

const AVATAR_COLORS = [
  'from-purple-500 to-indigo-600',
  'from-blue-500 to-cyan-600',
  'from-green-500 to-teal-600',
  'from-orange-500 to-amber-600',
  'from-red-500 to-rose-600',
  'from-pink-500 to-fuchsia-600',
]

function hashString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
    hash |= 0
  }
  return Math.abs(hash)
}

/** Deterministic Tailwind gradient classes for an author's initials background. */
export function getAuthorAvatarStyle(name: string): string {
  return AVATAR_COLORS[hashString(name) % AVATAR_COLORS.length]
}

/** Up to two uppercase initials from a display name (first+last, or first two chars). */
export function getAuthorInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2 && parts[0] && parts[parts.length - 1]) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }
  return name.trim().slice(0, 2).toUpperCase()
}
