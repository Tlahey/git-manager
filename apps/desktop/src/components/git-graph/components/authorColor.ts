// Kept out of `AuthorAvatar.tsx` so that file exports components only — a module mixing a component
// with a plain helper loses Vite's Fast Refresh (`react/only-export-components`).

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
