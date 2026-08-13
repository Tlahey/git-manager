import type {
  Board,
  BoardCard,
  BoardColumn,
  BoardCardKind,
  BoardCardPatch,
  BoardComment,
  BoardTag,
} from '@git-manager/git-types'
import { CreateCardDialog } from './CreateCardDialog'
import { EditCardDialog } from './EditCardDialog'
import type { DisplayedLinkKind, ResolvedLink } from '../lib/cardLinks'

interface BoardCardDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  repoPath: string
  tags: BoardTag[]
  attachmentUrlPrefix?: string
  /** A closed sprint's cards are readable but not editable. */
  readOnly?: boolean
}

/** What the create form collects — an object rather than five positional arguments, since three of
 * them are strings and the reader of a call site should not have to count commas. */
export interface NewCardDraft {
  title: string
  description: string
  dod: string
  /** Which identifier sequence the card draws its number from. Never empty: the form requires one —
   * `''` remains representable only because cards predating board sequences carry it. */
  prefix: string
  kind: BoardCardKind
}

export interface CreateProps extends BoardCardDialogProps {
  mode: 'create'
  /** The board's Definition-of-Done template, seeding the new card's checklist. */
  dodTemplate: string
  /** The prefixes the board offers — see `Board.cardPrefixes`. */
  cardPrefixes: string[]
  /**
   * Creates the card. **Where the dialog goes next is the caller's**, not this component's: the new
   * card reopens in the full editor, so the caller replaces this dialog rather than letting it close
   * itself. Closing here too would be a second state write in the same batch, and the later one wins
   * — which is exactly how the reopen used to be lost. A rejection leaves the dialog up, with what
   * was typed still in it.
   */
  onCreate: (draft: NewCardDraft) => Promise<unknown>
}

export interface EditProps extends BoardCardDialogProps {
  mode: 'edit'
  card: BoardCard
  onPatch: (patch: BoardCardPatch) => Promise<unknown>
  onDelete?: () => Promise<unknown>
  onDuplicate?: () => Promise<unknown>
  onArchive?: () => Promise<unknown>
  onUnarchive?: () => Promise<unknown>
  /** Opens the move-to-another-board dialog — see `MoveCardDialog`. */
  onMove?: () => void
  /** The board's columns and its name, for the status picker and the breadcrumb. Omitted hides
   * both — a card rendered outside a board it can name has neither to show. */
  columns?: BoardColumn[]
  boardName?: string
  boardSource?: Board['source']
  /** The loaded board's cards and the repo's boards, for the relations block — see
   * `CardLinksSection`. Omitted (with `onAddLink`/`onRemoveLink`) hides that block entirely. */
  cards?: BoardCard[]
  boards?: Board[]
  onAddLink?: (target: BoardCard, kind: DisplayedLinkKind) => Promise<unknown>
  /** Opens another card in this dialog's place — the breadcrumb's parent segment. */
  onOpenCard?: (cardId: string) => void
  onRemoveLink?: (link: ResolvedLink) => Promise<unknown>
  /** Creates a tag on the board from the card — see `CardTagPicker`. */
  onCreateTag?: (name: string) => Promise<BoardTag | null>
  comments: BoardComment[]
  commentsLoading?: boolean
  onAddComment: (body: string) => Promise<unknown>
  onCreateBranch?: () => Promise<unknown>
  onCheckoutBranch?: () => Promise<unknown>
  onUnlinkBranch?: () => Promise<unknown>
  onCreatePr?: () => void
  onCreateWorktree?: () => Promise<unknown>
  onUnlinkWorktree?: () => Promise<unknown>
  /** Severs a tracked card's link to its GitHub issue — see `CardTrackingSection`. */
  onUntrack?: () => Promise<unknown>
}

/**
 * The card, in the two shapes it genuinely has.
 *
 * **Edit** is a wide, two-pane record: content on the left (description, checklist, discussion),
 * metadata on the right, and every field editable on click and saved on its own — the same gesture
 * the PR and issue views already teach.
 *
 * **Create** stays a small form with one Create button, and that asymmetry is not an oversight: per
 * field saving needs a card to save *to*, and there isn't one yet. The new card opens in edit mode
 * straight after, which is where the rest of its fields get filled in.
 */
export function BoardCardDialog(props: CreateProps | EditProps) {
  return props.mode === 'create' ? <CreateCardDialog {...props} /> : <EditCardDialog {...props} />
}
