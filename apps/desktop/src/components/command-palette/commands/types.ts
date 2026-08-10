import type { ReactNode } from 'react'

/** Which section of the palette a command is listed under. */
export type PaletteGroup =
  | 'lookup'
  | 'files'
  | 'navigation'
  | 'repo'
  | 'commit'
  | 'stash'
  /** Branch- and tag-scoped actions (merge, fast-forward, tag push/delete). */
  | 'ref'
  | 'settings'

export interface PaletteCommand {
  /** Stable id, unique across all groups. Also the `data-testid` suffix: `command-item-<id>`. */
  id: string
  group: PaletteGroup
  /** Already-translated label shown in the list. */
  title: string
  /**
   * Value cmdk uses for filtering + selection state; defaults to `title`. Set it explicitly when the
   * title isn't unique (e.g. two files both named `index.ts`) so cmdk doesn't treat them as one item.
   */
  value?: string
  /** Extra terms fed to cmdk's fuzzy filter (aliases, the short sha, …). */
  keywords?: string[]
  /** Optional secondary line shown under the title (the sha, tag, PR ref, …). */
  subtitle?: string
  icon?: ReactNode
  /**
   * Marks part of the title as the search hit (`highlightMatch`, the same one the board and settings
   * searches use). Left unset by rows with nothing worth pointing at — a sentence-length title says
   * everything it has to say already.
   *
   * `query` is what to mark rather than the palette's whole query, and `from` is where in the title
   * marking may begin, because a row can spell out more than the thing being searched: `checkout
   * ada-boost` is found by typing `ada`, and it is the branch that answers it. Marking the verb too
   * would highlight the half the user is not choosing between.
   */
  highlight?: { query: string; from?: number }
  /**
   * Set when running this command *narrows* the palette instead of acting on the repository: the
   * dialog stays open and the query is cleared, so the next screen can be a picker. The branch
   * actions use it to choose their target in a second step (see `refPicker`).
   */
  keepOpen?: boolean
  /** Imperative action; the palette closes itself after this runs, unless `keepOpen` is set. */
  run: () => void
}
