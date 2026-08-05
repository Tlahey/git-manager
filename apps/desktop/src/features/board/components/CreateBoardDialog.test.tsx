import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CreateBoardDialog } from './CreateBoardDialog'

describe('CreateBoardDialog', () => {
  it('creates a local board by default', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<CreateBoardDialog open onOpenChange={() => {}} canUseRemote onSubmit={onSubmit} />)

    await userEvent.type(screen.getByTestId('board-name-input'), 'Sprint 12')
    await userEvent.click(screen.getByTestId('create-board-submit'))

    expect(onSubmit).toHaveBeenCalledWith('Sprint 12', 'local', '', '')
  })

  it('can switch to the remote backend when available', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<CreateBoardDialog open onOpenChange={() => {}} canUseRemote onSubmit={onSubmit} />)

    await userEvent.type(screen.getByTestId('board-name-input'), 'Team board')
    await userEvent.click(screen.getByText('GitHub'))
    await userEvent.click(screen.getByTestId('create-board-submit'))

    expect(onSubmit).toHaveBeenCalledWith('Team board', 'remote', '', '')
  })

  it('passes on a Definition-of-Done template for the board’s cards to start from', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<CreateBoardDialog open onOpenChange={() => {}} canUseRemote={false} onSubmit={onSubmit} />)

    await userEvent.type(screen.getByTestId('board-name-input'), 'Sprint 12')
    // `fireEvent.change` rather than `type`: userEvent reads `[` as the start of a key descriptor,
    // and a markdown checklist is nothing but square brackets.
    fireEvent.change(screen.getByTestId('board-dod-template-input'), {
      target: { value: '- [ ] Reviewed' },
    })
    await userEvent.click(screen.getByTestId('create-board-submit'))

    expect(onSubmit).toHaveBeenCalledWith('Sprint 12', 'local', '- [ ] Reviewed', '')
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

    expect(onSubmit).toHaveBeenCalledWith('Sprint 12', 'local', '', 'GM')
  })
})
