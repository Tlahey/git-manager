import type { ReactNode } from 'react'

/** Which section of the palette a command is listed under. */
export type PaletteGroup = 'lookup' | 'navigation' | 'repo' | 'commit' | 'stash' | 'settings'

export interface PaletteCommand {
  /** Stable id, unique across all groups. Also the `data-testid` suffix: `command-item-<id>`. */
  id: string
  group: PaletteGroup
  /** Already-translated label shown in the list. */
  title: string
  /** Extra terms fed to cmdk's fuzzy filter (aliases, the short sha, …). */
  keywords?: string[]
  /** Optional secondary line shown under the title (the sha, tag, PR ref, …). */
  subtitle?: string
  icon?: ReactNode
  /** Imperative action; the palette closes itself after this runs. */
  run: () => void
}
