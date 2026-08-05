import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Board } from '@git-manager/git-types'
import { makeBoard } from '../test/boardFactories'
import { MoveCardDialog } from './MoveCardDialog'

const columns = [
  { id: 'todo', name: 'Todo', order: 0 },
  { id: 'doing', name: 'Doing', order: 1 },
]

function renderDialog(targets: Board[], currentColumnId = 'doing') {
  const onSubmit = vi.fn().mockResolvedValue(undefined)
  render(
    <MoveCardDialog
      open
      onOpenChange={() => {}}
      targets={targets}
      currentColumnId={currentColumnId}
      onSubmit={onSubmit}
    />
  )
  return onSubmit
}

describe('MoveCardDialog', () => {
  /** A move between sprints is normally a move of where the work lives, not of how far along it is. */
  it('defaults to the column the card is already in', async () => {
    const onSubmit = renderDialog([makeBoard({ id: 'b2', name: 'Sprint 13', columns })])
    expect(screen.getByTestId('move-target-column')).toHaveValue('doing')

    await userEvent.click(screen.getByTestId('move-card-submit'))
    expect(onSubmit).toHaveBeenCalledWith('b2', 'doing')
  })

  it('falls back to the first column when the target has no column by that id', () => {
    renderDialog([makeBoard({ id: 'b2', columns })], 'review')
    expect(screen.getByTestId('move-target-column')).toHaveValue('todo')
  })

  it('re-defaults the column when another board is picked', async () => {
    renderDialog([
      makeBoard({ id: 'b2', name: 'Sprint 13', columns }),
      makeBoard({ id: 'b3', name: 'Backlog', columns: [{ id: 'inbox', name: 'Inbox', order: 0 }] }),
    ])

    await userEvent.selectOptions(screen.getByTestId('move-target-board'), 'b3')
    expect(screen.getByTestId('move-target-column')).toHaveValue('inbox')
  })

  it('names each board’s backend, since a GitHub board is not the same destination', () => {
    renderDialog([makeBoard({ id: 'b2', name: 'Sprint 13', source: 'remote', columns })])
    expect(screen.getByRole('option', { name: 'Sprint 13 · GitHub' })).toBeInTheDocument()
  })

  /** Landing on a GitHub board means becoming a real issue — not something to discover afterwards. */
  it('warns that the card becomes an issue only when the target is a GitHub board', async () => {
    renderDialog([
      makeBoard({ id: 'b2', name: 'Sprint 13', columns }),
      makeBoard({ id: 'b3', name: 'Shared', source: 'remote', columns }),
    ])
    expect(screen.queryByText(/becomes a real GitHub issue/)).not.toBeInTheDocument()

    await userEvent.selectOptions(screen.getByTestId('move-target-board'), 'b3')
    expect(screen.getByText(/becomes a real GitHub issue/)).toBeInTheDocument()
  })

  it('says so, and submits nothing, when there is nowhere to move to', () => {
    renderDialog([])
    expect(screen.getByTestId('move-card-no-targets')).toBeInTheDocument()
    expect(screen.getByTestId('move-card-submit')).toBeDisabled()
  })
})
