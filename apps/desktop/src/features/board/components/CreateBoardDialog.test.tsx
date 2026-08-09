import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CreateBoardDialog } from './CreateBoardDialog'

describe('CreateBoardDialog', () => {
  it('creates a local board by default', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<CreateBoardDialog open onOpenChange={() => {}} canUseRemote onSubmit={onSubmit} />)

    await userEvent.type(screen.getByTestId('board-name-input'), 'Sprint 12')
    await userEvent.click(screen.getByTestId('create-board-submit'))

    // 'SPR', not '': a board created with an empty prefix field used to hand every card an empty
    // prefix and the number 0 — no identifier at all, ever. See `defaultCardPrefix`.
    expect(onSubmit).toHaveBeenCalledWith('Sprint 12', 'local', '', 'SPR', true)
  })

  it('can switch to the remote backend when available', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<CreateBoardDialog open onOpenChange={() => {}} canUseRemote onSubmit={onSubmit} />)

    await userEvent.type(screen.getByTestId('board-name-input'), 'Team board')
    await userEvent.click(screen.getByText('GitHub'))
    await userEvent.click(screen.getByTestId('create-board-submit'))

    expect(onSubmit).toHaveBeenCalledWith('Team board', 'remote', '', 'TB', true)
  })

  it('passes on a Definition-of-Done template for the board’s cards to start from', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<CreateBoardDialog open onOpenChange={() => {}} canUseRemote={false} onSubmit={onSubmit} />)

    await userEvent.type(screen.getByTestId('board-name-input'), 'Sprint 12')
    // The template is written as the list it is — the `- [ ]` markdown is what gets stored, not what
    // gets typed.
    await userEvent.type(screen.getByTestId('card-dod-add-input'), 'Reviewed{Enter}')
    await userEvent.click(screen.getByTestId('create-board-submit'))

    expect(onSubmit).toHaveBeenCalledWith('Sprint 12', 'local', '- [ ] Reviewed', 'SPR', true)
  })

  it('disables the remote option when the repo has no connected GitHub account', () => {
    render(<CreateBoardDialog open onOpenChange={() => {}} canUseRemote={false} onSubmit={vi.fn()} />)
    const remoteRadio = screen.getByRole('radio', { name: /GitHub/ })
    expect(remoteRadio).toBeDisabled()
    expect(
      screen.getByText('Connect a GitHub account for this repository to use a shared board.')
    ).toBeInTheDocument()
  })

  it('disables creation until a name is entered', () => {
    render(<CreateBoardDialog open onOpenChange={() => {}} canUseRemote onSubmit={vi.fn()} />)
    expect(screen.getByTestId('create-board-submit')).toBeDisabled()
  })

  it('passes on the card prefix that numbers this board’s tickets', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<CreateBoardDialog open onOpenChange={() => {}} canUseRemote={false} onSubmit={onSubmit} />)

    await userEvent.type(screen.getByTestId('board-name-input'), 'Sprint 12')
    await userEvent.type(screen.getByTestId('board-prefix-input'), 'GM')
    await userEvent.click(screen.getByTestId('create-board-submit'))

    expect(onSubmit).toHaveBeenCalledWith('Sprint 12', 'local', '', 'GM', true)
  })

  /** The hint has to promise what the board will actually do: it used to show `GM-1` for an empty
   * field on a board that then numbered nothing at all. */
  it('previews the prefix the board will use, typed or derived', async () => {
    render(<CreateBoardDialog open onOpenChange={() => {}} canUseRemote={false} onSubmit={vi.fn()} />)

    await userEvent.type(screen.getByTestId('board-name-input'), 'Mobile App')
    expect(screen.getByText('Cards get an identifier like MA-1, MA-2…')).toBeInTheDocument()

    await userEvent.type(screen.getByTestId('board-prefix-input'), 'ops')
    expect(screen.getByText('Cards get an identifier like OPS-1, OPS-2…')).toBeInTheDocument()
  })
})

/**
 * Whether a board is an iteration decides whether it can ever be closed, which is a statement about
 * what the board *is* rather than a preference to revise later — so it is asked here, once.
 */
describe('CreateBoardDialog — iteration', () => {
  it('defaults to an iteration and previews the numbered name', async () => {
    render(<CreateBoardDialog open onOpenChange={() => {}} canUseRemote onSubmit={vi.fn()} />)

    expect(screen.getByTestId('board-iteration-input')).toBeChecked()
    await userEvent.type(screen.getByTestId('board-name-input'), 'Sprint')
    expect(screen.getByText(/It will be created as "Sprint 1"/)).toBeInTheDocument()
  })

  it('describes a standing board instead once unticked', async () => {
    render(<CreateBoardDialog open onOpenChange={() => {}} canUseRemote onSubmit={vi.fn()} />)

    await userEvent.click(screen.getByTestId('board-iteration-input'))

    expect(screen.getByText(/never ends/)).toBeInTheDocument()
    expect(screen.getByText(/offers no closing/)).toBeInTheDocument()
  })

  it('passes the choice on', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<CreateBoardDialog open onOpenChange={() => {}} canUseRemote onSubmit={onSubmit} />)

    await userEvent.type(screen.getByTestId('board-name-input'), 'Backlog')
    await userEvent.click(screen.getByTestId('board-iteration-input'))
    await userEvent.click(screen.getByTestId('create-board-submit'))

    expect(onSubmit).toHaveBeenCalledWith('Backlog', 'local', '', 'BAC', false)
  })
})
