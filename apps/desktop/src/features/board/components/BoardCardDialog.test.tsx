import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { BoardTag } from '@git-manager/git-types'
import { makeCard } from '../test/boardFactories'
import { BoardCardDialog } from './BoardCardDialog'

vi.mock('../api/attachment.api', () => ({ saveBoardAttachment: vi.fn() }))
vi.mock('../../../hooks/usePrEditCandidates', () => ({
  useAssignableUsers: () => ({ users: [], isLoading: false }),
}))

const TAGS: BoardTag[] = [{ id: 't-bug', name: 'bug', color: '#ff0000' }]

function renderCreate(props: Partial<React.ComponentProps<typeof BoardCardDialog>> = {}) {
  const onCreate = vi.fn().mockResolvedValue(undefined)
  render(
    <BoardCardDialog
      mode="create"
      open
      onOpenChange={() => {}}
      repoPath="/repo"
      tags={TAGS}
      dodTemplate=""
      // A board always offers at least one prefix (`offeredCardPrefixes`), and the form requires one.
      cardPrefixes={['GM']}
      onCreate={onCreate}
      {...(props as object)}
    />
  )
  return onCreate
}

function renderEdit(props: Partial<React.ComponentProps<typeof BoardCardDialog>> = {}) {
  const onPatch = vi.fn().mockResolvedValue(undefined)
  render(
    <BoardCardDialog
      mode="edit"
      open
      onOpenChange={() => {}}
      repoPath="/repo"
      tags={TAGS}
      card={makeCard()}
      onPatch={onPatch}
      comments={[]}
      onAddComment={vi.fn().mockResolvedValue(undefined)}
      {...(props as object)}
    />
  )
  return onPatch
}

/**
 * Create mode stays a small form with one button, and that asymmetry is deliberate: per-field saving
 * needs a card to save *to*, and there isn't one yet.
 */
describe('BoardCardDialog — create', () => {
  it('creates a card with the entered title and description', async () => {
    const onCreate = renderCreate()

    await userEvent.type(screen.getByTestId('board-card-title-input'), 'Fix the header')
    await userEvent.type(screen.getByTestId('board-card-description-input'), 'It overlaps')
    await userEvent.click(screen.getByTestId('board-card-save'))

    expect(onCreate).toHaveBeenCalledWith({
      title: 'Fix the header',
      description: 'It overlaps',
      dod: '',
      prefix: 'GM',
      kind: 'task',
    })
  })

  it('disables creation until a title is entered', () => {
    renderCreate()
    expect(screen.getByTestId('board-card-save')).toBeDisabled()
  })

  it('seeds the checklist from the board template and passes it on', async () => {
    const onCreate = renderCreate({ dodTemplate: '- [ ] Tests pass' })
    // A list of the template's items, not the markdown they are stored as.
    expect(screen.getByTestId('card-dod-text-0')).toHaveValue('Tests pass')

    await userEvent.type(screen.getByTestId('board-card-title-input'), 'Task')
    await userEvent.click(screen.getByTestId('board-card-save'))
    expect(onCreate).toHaveBeenCalledWith({
      title: 'Task',
      description: '',
      dod: '- [ ] Tests pass',
      prefix: 'GM',
      kind: 'task',
    })
  })

  /** The point of the list: an item the project proposes by default can be dropped for this card
   * without editing markdown, which is what the textarea asked for. */
  it('drops an item the template proposed', async () => {
    const onCreate = renderCreate({ dodTemplate: '- [ ] Tests pass\n- [ ] Reviewed' })

    await userEvent.click(screen.getByTestId('card-dod-remove-0'))
    await userEvent.type(screen.getByTestId('board-card-title-input'), 'Task')
    await userEvent.click(screen.getByTestId('board-card-save'))

    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ dod: '- [ ] Reviewed' }))
  })

  it('adds an item of its own from the + beside the draft row', async () => {
    const onCreate = renderCreate({ dodTemplate: '- [ ] Tests pass' })

    await userEvent.type(screen.getByTestId('card-dod-add-input'), 'Changelog updated')
    await userEvent.click(screen.getByTestId('card-dod-add-button'))

    await userEvent.type(screen.getByTestId('board-card-title-input'), 'Task')
    await userEvent.click(screen.getByTestId('board-card-save'))

    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({ dod: '- [ ] Tests pass\n- [ ] Changelog updated' })
    )
  })

  /** Nothing is done on a card that does not exist yet, so the template's items are listed without
   * tick boxes — the same reading `BoardSettingsDialog` gives the template it comes from. */
  it('offers no tick boxes on a card that has not been created', () => {
    renderCreate({ dodTemplate: '- [ ] Tests pass' })
    expect(screen.queryByTestId('card-dod-check-0')).not.toBeInTheDocument()
  })

  it('shows no metadata sidebar — there is no card to attach it to yet', () => {
    renderCreate()
    expect(screen.queryByTestId('card-meta-sidebar')).not.toBeInTheDocument()
  })

  /**
   * The caller replaces this dialog with the new card's editor. Closing here as well would be a
   * second state write in the same batch and the later one wins — which is how the reopen was lost.
   */
  it('leaves closing to its caller rather than closing itself', async () => {
    const onOpenChange = vi.fn()
    renderCreate({ onOpenChange })

    await userEvent.type(screen.getByTestId('board-card-title-input'), 'Task')
    await userEvent.click(screen.getByTestId('board-card-save'))

    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it('still closes on cancel, which is the caller saying nothing happened', async () => {
    const onOpenChange = vi.fn()
    renderCreate({ onOpenChange })

    await userEvent.click(screen.getByText('Cancel'))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})

describe('BoardCardDialog — create, prefix and kind', () => {
  it('starts on the board’s first prefix, which is the one it was created with', async () => {
    const onCreate = renderCreate({ cardPrefixes: ['GM', 'BUG'] })
    expect(screen.getByTestId('card-prefix-input')).toHaveValue('GM')

    await userEvent.type(screen.getByTestId('board-card-title-input'), 'Task')
    await userEvent.click(screen.getByTestId('board-card-save'))
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ prefix: 'GM' }))
  })

  it('takes another of the board’s sequences from the list', async () => {
    const onCreate = renderCreate({ cardPrefixes: ['GM', 'BUG'] })

    await userEvent.click(screen.getByTestId('card-prefix-input'))
    await userEvent.click(screen.getByTestId('card-prefix-option-BUG'))

    await userEvent.type(screen.getByTestId('board-card-title-input'), 'Task')
    await userEvent.click(screen.getByTestId('board-card-save'))
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ prefix: 'BUG' }))
  })

  /** The typed prefix reaches the card straight away; the *board* picks it up from the same write
   * that allocates the number, so no separate board save happens here. */
  it('starts a new sequence by typing it, uppercased', async () => {
    const onCreate = renderCreate({ cardPrefixes: ['GM'] })

    await userEvent.clear(screen.getByTestId('card-prefix-input'))
    await userEvent.type(screen.getByTestId('card-prefix-input'), 'ops')
    expect(screen.getByTestId('card-prefix-input')).toHaveValue('OPS')

    await userEvent.type(screen.getByTestId('board-card-title-input'), 'Task')
    await userEvent.click(screen.getByTestId('board-card-save'))
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ prefix: 'OPS' }))
  })

  /** Every ticket gets an identifier, so an emptied prefix is an unfinished form, not a choice. */
  it('will not create a card with no prefix', async () => {
    renderCreate({ cardPrefixes: ['GM'] })

    await userEvent.type(screen.getByTestId('board-card-title-input'), 'Task')
    expect(screen.getByTestId('board-card-save')).toBeEnabled()

    await userEvent.clear(screen.getByTestId('card-prefix-input'))
    expect(screen.getByTestId('board-card-save')).toBeDisabled()
  })

  it('creates a task unless another kind is picked', async () => {
    const onCreate = renderCreate()

    await userEvent.click(screen.getByTestId('card-kind-select'))
    await userEvent.click(screen.getByTestId('card-kind-bug-option'))
    await userEvent.type(screen.getByTestId('board-card-title-input'), 'Crash on open')
    await userEvent.click(screen.getByTestId('board-card-save'))

    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ kind: 'bug' }))
  })
})

describe('BoardCardDialog — where the card is', () => {
  const columns = [
    { id: 'todo', name: 'To do', order: 0 },
    { id: 'done', name: 'Done', order: 1 },
  ]

  it('names the board and the card above the title', () => {
    renderEdit({ boardName: 'Sprint 12', card: makeCard({ prefix: 'GM', number: 7 }) })
    expect(screen.getByTestId('card-breadcrumb')).toHaveTextContent('Sprint 12')
    expect(screen.getByTestId('card-identifier')).toHaveTextContent('GM-7')
  })

  /** The one gesture the dialog was missing: changing a card's column meant closing it, finding it
   * on the board and dragging it. */
  it('moves the card to another column, patching that alone', async () => {
    const onPatch = renderEdit({ columns })

    await userEvent.click(screen.getByTestId('card-status-picker'))
    await userEvent.click(screen.getByTestId('card-status-option-done'))

    expect(onPatch).toHaveBeenCalledWith({ columnId: 'done' })
  })

  it('offers no column picker on a closed sprint', () => {
    renderEdit({ columns, readOnly: true })
    expect(screen.queryByTestId('card-status-picker')).not.toBeInTheDocument()
    expect(screen.getByTestId('card-status-readonly')).toBeInTheDocument()
  })
})

describe('BoardCardDialog — edit layout', () => {
  it('shows the content column and the metadata sidebar side by side', () => {
    renderEdit()
    expect(screen.getByTestId('card-description-section')).toBeInTheDocument()
    expect(screen.getByTestId('card-dod-section')).toBeInTheDocument()
    expect(screen.getByTestId('card-comments-section')).toBeInTheDocument()
    expect(screen.getByTestId('card-meta-sidebar')).toBeInTheDocument()
  })

  it('has no dialog-wide save button — each field commits on its own', () => {
    renderEdit()
    expect(screen.queryByTestId('board-card-save')).not.toBeInTheDocument()
  })

  it('saves the title on its own', async () => {
    const onPatch = renderEdit()

    await userEvent.click(screen.getByTestId('card-title-display'))
    const input = screen.getByTestId('card-title-input')
    await userEvent.clear(input)
    await userEvent.type(input, 'Renamed')
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onPatch).toHaveBeenCalledWith({ title: 'Renamed' })
  })

  it('saves the description on its own', async () => {
    const onPatch = renderEdit()

    await userEvent.click(screen.getByTestId('card-description-display'))
    await userEvent.type(screen.getByTestId('card-description-input'), 'Some detail')
    await userEvent.click(screen.getByTestId('card-description-save'))

    expect(onPatch).toHaveBeenCalledWith({ description: 'Some detail' })
  })
})

describe('BoardCardDialog — actions menu', () => {
  it('offers duplicate, move and delete', async () => {
    renderEdit({
      onDuplicate: vi.fn().mockResolvedValue(undefined),
      onMove: vi.fn(),
      onDelete: vi.fn().mockResolvedValue(undefined),
    })

    await userEvent.click(screen.getByTestId('card-dialog-actions-menu'))
    expect(screen.getByTestId('card-action-duplicate')).toBeInTheDocument()
    expect(screen.getByTestId('card-action-move')).toBeInTheDocument()
    expect(screen.getByTestId('card-action-delete')).toBeInTheDocument()
  })

  it('duplicates the card', async () => {
    const onDuplicate = vi.fn().mockResolvedValue(undefined)
    renderEdit({ onDuplicate })

    await userEvent.click(screen.getByTestId('card-dialog-actions-menu'))
    await userEvent.click(screen.getByTestId('card-action-duplicate'))
    expect(onDuplicate).toHaveBeenCalledTimes(1)
  })

  /** Deleting only *asks*: the caller owns the confirmation, and closing the dialog with it. */
  it('asks its caller to delete rather than deleting outright', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined)
    renderEdit({ onDelete })

    await userEvent.click(screen.getByTestId('card-dialog-actions-menu'))
    await userEvent.click(screen.getByTestId('card-action-delete'))

    expect(onDelete).toHaveBeenCalledTimes(1)
  })

  it('offers archiving, and unarchiving once the card is archived', async () => {
    renderEdit({ onArchive: vi.fn().mockResolvedValue(undefined) })
    await userEvent.click(screen.getByTestId('card-dialog-actions-menu'))
    expect(screen.getByTestId('card-action-archive')).toBeInTheDocument()
    expect(screen.queryByTestId('card-action-unarchive')).not.toBeInTheDocument()
  })
})

describe('BoardCardDialog — read-only for a closed sprint', () => {
  it('offers no actions menu at all', () => {
    renderEdit({ readOnly: true, onDelete: vi.fn(), onDuplicate: vi.fn() })
    expect(screen.queryByTestId('card-dialog-actions-menu')).not.toBeInTheDocument()
  })

  it('leaves the title and the fields uneditable', () => {
    renderEdit({ readOnly: true })
    expect(screen.getByTestId('card-title-display')).toBeDisabled()
    expect(screen.getByTestId('card-description-display')).not.toHaveAttribute('role', 'button')
    expect(screen.queryByTestId('card-dod-edit')).not.toBeInTheDocument()
  })
})

/**
 * Archiving a card from this dialog used to change the screen in no way at all: the action
 * succeeded, the card left the board *behind* the dialog, and the only thing that said so was the
 * `⋯` menu quietly swapping "Archive" for "Restore". The badge is the answer to "did that work?".
 */
describe('BoardCardDialog — the card says when it is archived', () => {
  it('shows the badge on an archived card', () => {
    renderEdit({ card: makeCard({ archivedAt: '2026-08-04T09:30:00.000Z' }) })
    expect(screen.getByTestId('card-dialog-archived')).toHaveTextContent('Archived')
  })

  it('shows nothing on a card that is still on the board', () => {
    renderEdit({ card: makeCard() })
    expect(screen.queryByTestId('card-dialog-archived')).not.toBeInTheDocument()
  })

  /**
   * In the header row, where the eye already is — not somewhere in the scrolling body, which on an
   * 85vh dialog is a place a confirmation can be missed entirely.
   */
  it('puts the badge in the title row', () => {
    renderEdit({ card: makeCard({ archivedAt: '2026-08-04T00:00:00.000Z' }) })

    // `DialogTitle` is the header's `h2`; a badge moved into the body would no longer be inside one.
    expect(screen.getByTestId('card-dialog-archived').closest('h2')).not.toBeNull()
  })
})
