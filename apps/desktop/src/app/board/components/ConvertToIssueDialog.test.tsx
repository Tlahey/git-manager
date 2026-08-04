import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Board } from '@git-manager/git-types'
import { makeBoard } from '../../../test/boardFactories'
import { ConvertToIssueDialog } from './ConvertToIssueDialog'

function remoteBoard(overrides: Partial<Board> = {}): Board {
  return makeBoard({
    id: 'r1',
    name: 'Team board',
    source: 'remote',
    columns: [
      { id: 'todo', name: 'Todo', order: 0 },
      { id: 'done', name: 'Done', order: 1 },
    ],
    ...overrides,
  })
}

describe('ConvertToIssueDialog', () => {
  it('defaults to the first board and its first column', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(
      <ConvertToIssueDialog
        open
        onOpenChange={() => {}}
        remoteBoards={[remoteBoard()]}
        onSubmit={onSubmit}
      />
    )
    await userEvent.click(screen.getByTestId('convert-to-issue-submit'))
    expect(onSubmit).toHaveBeenCalledWith('r1', 'todo')
  })

  it('updates the column choices when a different board is selected', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    const secondBoard = remoteBoard({
      id: 'r2',
      name: 'Other board',
      columns: [{ id: 'backlog', name: 'Backlog', order: 0 }],
    })
    render(
      <ConvertToIssueDialog
        open
        onOpenChange={() => {}}
        remoteBoards={[remoteBoard(), secondBoard]}
        onSubmit={onSubmit}
      />
    )

    await userEvent.selectOptions(screen.getByTestId('convert-target-board'), 'r2')
    expect(screen.getByRole('option', { name: 'Backlog' })).toBeInTheDocument()

    await userEvent.click(screen.getByTestId('convert-to-issue-submit'))
    expect(onSubmit).toHaveBeenCalledWith('r2', 'backlog')
  })
})
