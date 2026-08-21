import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeBoard, makeRecoverableBoard } from '../test/boardFactories'
import { RecoverableBoardsBanner } from './RecoverableBoardsBanner'

describe('RecoverableBoardsBanner', () => {
  it('renders nothing when there is nothing to recover', () => {
    render(<RecoverableBoardsBanner boards={[]} onRestore={vi.fn()} />)
    expect(screen.queryByTestId('recoverable-boards-banner')).not.toBeInTheDocument()
  })

  it('lists every recoverable board with a restore button', () => {
    const boards = [
      makeRecoverableBoard({ id: 'b1', name: 'Sprint 12' }),
      makeRecoverableBoard({ id: 'b2', name: 'Backlog' }),
    ]
    render(<RecoverableBoardsBanner boards={boards} onRestore={vi.fn()} />)

    expect(screen.getByText('Sprint 12')).toBeInTheDocument()
    expect(screen.getByText('Backlog')).toBeInTheDocument()
    expect(screen.getByTestId('recoverable-board-restore-b1')).toBeInTheDocument()
    expect(screen.getByTestId('recoverable-board-restore-b2')).toBeInTheDocument()
  })

  /**
   * The case this line exists for: one mirror per lost clone, and boards named after sprints, so the
   * name alone offers the same thing twice. What is on the row has to answer "which one was mine".
   */
  it('says how big each board is and when it last changed, so two of a name can be told apart', () => {
    const boards = [
      makeRecoverableBoard(
        { id: 'b1', name: 'Sprint 12', updatedAt: '2026-08-21T09:30:00.000Z' },
        7
      ),
      makeRecoverableBoard(
        { id: 'b2', name: 'Sprint 12', updatedAt: '2026-05-04T09:30:00.000Z' },
        1
      ),
    ]
    render(<RecoverableBoardsBanner boards={boards} onRestore={vi.fn()} />)

    // The date is formatted for the machine's locale, so the assertion is on the parts this file
    // owns: the count, and that the two rows do not read the same.
    const first = screen.getByTestId('recoverable-board-detail-b1')
    const second = screen.getByTestId('recoverable-board-detail-b2')
    expect(first).toHaveTextContent('7 cards')
    expect(second).toHaveTextContent('1 card')
    expect(first.textContent).not.toBe(second.textContent)
  })

  it('restores the clicked board', async () => {
    const onRestore = vi.fn().mockResolvedValue(makeBoard({ id: 'b1' }))
    const user = userEvent.setup()
    render(
      <RecoverableBoardsBanner
        boards={[makeRecoverableBoard({ id: 'b1' })]}
        onRestore={onRestore}
      />
    )

    await user.click(screen.getByTestId('recoverable-board-restore-b1'))

    expect(onRestore).toHaveBeenCalledWith('b1')
  })

  it('disables restore buttons while a restore is in flight', async () => {
    let resolveRestore!: (board: ReturnType<typeof makeBoard>) => void
    const onRestore = vi.fn(
      () =>
        new Promise<ReturnType<typeof makeBoard>>((resolve) => {
          resolveRestore = resolve
        })
    )
    const boards = [makeRecoverableBoard({ id: 'b1' }), makeRecoverableBoard({ id: 'b2' })]
    const user = userEvent.setup()
    render(<RecoverableBoardsBanner boards={boards} onRestore={onRestore} />)

    await user.click(screen.getByTestId('recoverable-board-restore-b1'))
    expect(screen.getByTestId('recoverable-board-restore-b1')).toBeDisabled()
    expect(screen.getByTestId('recoverable-board-restore-b2')).toBeDisabled()

    resolveRestore(makeBoard({ id: 'b1' }))
    await waitFor(() =>
      expect(screen.getByTestId('recoverable-board-restore-b1')).not.toBeDisabled()
    )
  })
})
