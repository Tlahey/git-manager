import { Bug, Layers, SquareCheck, type LucideIcon } from 'lucide-react'
import type { BoardCardKind } from '@git-manager/git-types'

/**
 * What each kind of card looks like: its glyph, and the fill of the square that glyph sits in.
 *
 * A table rather than a chain of ternaries inside the component — the colocated `*.config.ts`
 * convention (see `features/graph/lib/columns.config.ts`): three kinds, three rows, and adding a
 * fourth is one line rather than a new branch in the render.
 *
 * **Colour reinforces, never carries.** Each kind has a glyph that says the same thing on its own —
 * a stack for the epic, the thing that contains others; a bug for a bug; a checked square for a
 * task — so the three stay tellable apart by a colour-blind reader, and `CardKindIcon` spells the
 * kind out in its `title`/`aria-label` either way.
 *
 * **Fixed vivid hues, not theme tokens.** The tile is what the eye finds a kind by across a whole
 * column, so it has to be the same green/red/violet in every theme rather than a token each theme
 * re-grades — the same reasoning that keeps a tag's colour a stored hex. `green-600` rather than a
 * lighter green because the glyph inside is white: at 500 the white fell under the 3:1 non-text
 * contrast floor, and a tile nobody can read the icon on is a coloured square, not an icon. The
 * epic's violet is also the colour the remote backend writes on the `type:epic` label
 * (`api/remoteCardMapping.ts`), so the board and github.com agree on what an epic looks like.
 *
 * **The tile is the only coloured thing.** The identifier next to it stays the footer's own ink: the
 * kind is already said once, in the mark whose job that is, and repeating it in the text beside it
 * would give a card three coloured marks where the eye needs one.
 */
export interface CardKindStyle {
  Icon: LucideIcon
  /** Fill of the square tile the white glyph sits in. */
  chip: string
}

export const CARD_KIND_STYLES: Record<BoardCardKind, CardKindStyle> = {
  task: { Icon: SquareCheck, chip: 'bg-green-600' },
  bug: { Icon: Bug, chip: 'bg-red-500' },
  epic: { Icon: Layers, chip: 'bg-violet-500' },
}

/** Falls back to the task style for a kind written by a newer version of the app — an unknown kind
 * should render as an ordinary ticket, not as a blank space where the glyph should be. */
export function cardKindStyle(kind: BoardCardKind): CardKindStyle {
  return CARD_KIND_STYLES[kind] ?? CARD_KIND_STYLES.task
}
