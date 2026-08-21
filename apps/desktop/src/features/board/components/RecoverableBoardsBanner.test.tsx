import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeBoard } from '../test/boardFactories'
import { RecoverableBoardsBanner } from './RecoverableBoardsBanner'

describe('RecoverableBoardsBanner', () => {
  it('renders nothing when there is nothing to recover', () => {
    render(<RecoverableBoardsBanner boards={[]} onRestore={vi.fn()} />)
    expect(screen.queryByTestId('recoverable-boards-banner')).not.toBeInTheDocument()
  })

  it('lists every recoverable board with a restore button', () => {
    const boards = [
      makeBoard({ id: 'b1', name: 'Sprint 12' }),
      makeBoard({ id: 'b2', name: 'Backlog' }),
    ]
    render(<RecoverableBoardsBanner boards={boards} onRestore={vi.fn()} />)

    expect(screen.getByText('Sprint 12')).toBeInTheDocument()
    expect(screen.getByText('Backlog')).toBeInTheDocument()
    expect(screen.getByTestId('recoverable-board-restore-b1')).toBeInTheDocument()
    expect(screen.getByTestId('recoverable-board-restore-b2')).toBeInTheDocument()
  })

  it('restores the clicked board', async () => {
    const onRestore = vi.fn().mockResolvedValue(makeBoard({ id: 'b1' }))
    const user = userEvent.setup()
    render(<RecoverableBoardsBanner boards={[makeBoard({ id: 'b1' })]} onRestore={onRestore} />)

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
    const boards = [makeBoard({ id: 'b1' }), makeBoard({ id: 'b2' })]
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
