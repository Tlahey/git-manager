/** Shared helpers for rendering author avatars as colored initials when no image is available.
 * Extracted from `CommitDetailsAvatar` so the blame gutter / history panel reuse the same look. */

// White initials render over these gradients, so BOTH endpoints must clear APCA
// Bronze (≥75Lc) for white text — the lighter `from-*` shade is the binding
// constraint. Each pair was shifted a shade or two darker (the -500 ends failed,
// e.g. green-500 #22c55e was only 49Lc) while keeping the hue recognizable.
const AVATAR_COLORS = [
  'from-purple-600 to-indigo-700', // 81.0 → 91.3Lc
  'from-blue-600 to-cyan-700', // 80.3 → 81.6Lc
  'from-green-700 to-teal-800', // 79.6 → 90.8Lc
  'from-orange-700 to-amber-700', // 79.9 → 79.5Lc
  'from-red-600 to-rose-700', // 77.0 → 84.4Lc
  'from-pink-600 to-fuchsia-700', // 75.7 → 85.1Lc
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
