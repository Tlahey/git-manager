import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { BoardTag } from '@git-manager/git-types'
import { BoardSettingsDialog } from './BoardSettingsDialog'

const TAGS: BoardTag[] = [{ id: 'bug', name: 'bug', color: '#ff0000' }]

function renderDialog(props: Partial<React.ComponentProps<typeof BoardSettingsDialog>> = {}) {
  const onSave = vi.fn().mockResolvedValue(undefined)
  render(
    <BoardSettingsDialog
      open
      onOpenChange={() => {}}
      name="Sprint 12"
      tags={TAGS}
      dodTemplate="- [ ] Tests pass"
      cardPrefixes={[]}
      onSave={onSave}
      {...props}
    />
  )
  return onSave
}

describe('BoardSettingsDialog', () => {
  it('pre-fills the board’s current settings', () => {
    renderDialog()
    expect(screen.getByTestId('board-settings-name')).toHaveValue('Sprint 12')
    // The template is a list now, not a markdown box: the item shows as an editable row.
    expect(screen.getByTestId('card-dod-text-0')).toHaveValue('Tests pass')
    expect(screen.getByTestId('board-settings-tag-bug')).toBeInTheDocument()
  })

  it('saves the name, tags and template together', async () => {
    const onSave = renderDialog()
    await userEvent.clear(screen.getByTestId('board-settings-name'))
    await userEvent.type(screen.getByTestId('board-settings-name'), 'Sprint 13')
    await userEvent.click(screen.getByTestId('board-settings-save'))

    expect(onSave).toHaveBeenCalledWith('Sprint 13', TAGS, '- [ ] Tests pass', [])
  })

  it('will not save a board with no name', async () => {
    renderDialog()
    await userEvent.clear(screen.getByTestId('board-settings-name'))
    expect(screen.getByTestId('board-settings-save')).toBeDisabled()
  })

  it('adds a tag with a colour of its own', async () => {
    const onSave = renderDialog({ tags: [] })
    await userEvent.type(screen.getByTestId('board-settings-new-tag'), 'frontend')
    await userEvent.click(screen.getByTestId('board-settings-add-tag'))
    await userEvent.click(screen.getByTestId('board-settings-save'))

    expect(onSave).toHaveBeenCalledWith(
      'Sprint 12',
      [{ id: 'frontend', name: 'frontend', color: expect.stringMatching(/^#[0-9a-f]{6}$/i) }],
      '- [ ] Tests pass',
      []
    )
  })

  it('refuses to add the same tag twice', async () => {
    const onSave = renderDialog()
    await userEvent.type(screen.getByTestId('board-settings-new-tag'), 'bug')
    await userEvent.click(screen.getByTestId('board-settings-add-tag'))
    await userEvent.click(screen.getByTestId('board-settings-save'))

    expect(onSave).toHaveBeenCalledWith('Sprint 12', TAGS, '- [ ] Tests pass', [])
  })

  it('removes a tag', async () => {
    const onSave = renderDialog()
    await userEvent.click(screen.getByTestId('board-settings-remove-tag-bug'))
    await userEvent.click(screen.getByTestId('board-settings-save'))

    expect(onSave).toHaveBeenCalledWith('Sprint 12', [], '- [ ] Tests pass', [])
  })

  /** Draft-then-save matters here beyond tidiness: on a GitHub board, saving pushes each tag to the
   * repository as a real label, so a half-typed name must never reach a mutation. */
  it('discards edits when cancelled', async () => {
    const onSave = renderDialog()
    await userEvent.type(screen.getByTestId('board-settings-new-tag'), 'half-typed')
    await userEvent.click(screen.getByText('Cancel'))
    expect(onSave).not.toHaveBeenCalled()
  })

  /** The board offers a *list* of prefixes now, since a card picks its own at creation. Adding one
   * normalizes it here; removing one only stops it being offered — cards already carrying it keep
   * their identifiers. */
  it('adds and removes the prefixes the board offers', async () => {
    const onSave = renderDialog({ cardPrefixes: ['GM'] })
    expect(screen.getByTestId('board-settings-prefix-GM')).toBeInTheDocument()

    await userEvent.type(screen.getByTestId('board-settings-prefix'), 'ops')
    await userEvent.click(screen.getByTestId('board-settings-prefix-add'))
    // Normalized on the way in, so the list never holds two spellings of one prefix.
    expect(screen.getByTestId('board-settings-prefix-OPS')).toBeInTheDocument()

    await userEvent.click(screen.getByTestId('board-settings-prefix-remove-GM'))
    await userEvent.click(screen.getByTestId('board-settings-save'))

    expect(onSave).toHaveBeenCalledWith('Sprint 12', TAGS, '- [ ] Tests pass', ['OPS'])
  })

  it('refuses to add the same prefix twice', async () => {
    renderDialog({ cardPrefixes: ['GM'] })

    await userEvent.type(screen.getByTestId('board-settings-prefix'), 'gm')
    await userEvent.click(screen.getByTestId('board-settings-prefix-add'))

    expect(screen.getAllByTestId(/^board-settings-prefix-GM$/)).toHaveLength(1)
  })
})
