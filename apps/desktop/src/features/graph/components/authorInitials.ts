// Kept out of `GraphAvatarTooltip.tsx` so that file exports components only — a module mixing a component
// with a plain helper loses Vite's Fast Refresh (`react/only-export-components`).

export function getAuthorInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }
  return name.slice(0, 2).toUpperCase()
}
