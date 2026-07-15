import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@git-manager/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

const { updatePr } = vi.hoisted(() => ({ updatePr: vi.fn() }))
vi.mock('../../../hooks/usePrActions', () => ({
  usePrActions: () => ({ updatePr, pending: false }),
}))

import { PrTitle } from './PrTitle'

beforeEach(() => {
  vi.clearAllMocks()
  updatePr.mockResolvedValue(undefined)
})

describe('PrTitle', () => {
  it('shows the PR number and title', () => {
    render(<PrTitle repoPath="/repo" prNumber={7} title="Add feature" />)
    expect(screen.getByTestId('pr-title-number')).toHaveTextContent('#7')
    expect(screen.getByTestId('pr-title')).toHaveTextContent('Add feature')
  })

  it('edits and saves a changed title', async () => {
    const user = userEvent.setup()
    render(<PrTitle repoPath="/repo" prNumber={7} title="Old" />)
    await user.click(screen.getByTestId('pr-title'))
    const input = screen.getByTestId('pr-title-input')
    await user.clear(input)
    await user.type(input, 'New title')
    await user.click(screen.getByTestId('pr-title-save'))
    expect(updatePr).toHaveBeenCalledWith({ title: 'New title' })
  })

  it('does not call the API when the title is unchanged', async () => {
    const user = userEvent.setup()
    render(<PrTitle repoPath="/repo" prNumber={7} title="Same" />)
    await user.click(screen.getByTestId('pr-title'))
    await user.click(screen.getByTestId('pr-title-save'))
    expect(updatePr).not.toHaveBeenCalled()
    // Falls back to the read-only heading.
    expect(screen.getByTestId('pr-title')).toBeInTheDocument()
  })

  it('cancels editing on Escape without saving', async () => {
    const user = userEvent.setup()
    render(<PrTitle repoPath="/repo" prNumber={7} title="Keep" />)
    await user.click(screen.getByTestId('pr-title'))
    await user.type(screen.getByTestId('pr-title-input'), 'discarded')
    await user.keyboard('{Escape}')
    expect(updatePr).not.toHaveBeenCalled()
    expect(screen.getByTestId('pr-title')).toHaveTextContent('Keep')
  })
})
