import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@git-manager/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const { updatePr } = vi.hoisted(() => ({ updatePr: vi.fn() }))
vi.mock('../../../hooks/usePrActions', () => ({
  usePrActions: () => ({ updatePr, pending: false }),
}))

import { PrDescription } from './PrDescription'

beforeEach(() => {
  vi.clearAllMocks()
  updatePr.mockResolvedValue(undefined)
})

function renderDescription(body: string) {
  return render(<PrDescription repoPath="/repo" prNumber={1} body={body} />)
}

describe('PrDescription', () => {
  it('renders the markdown body', () => {
    renderDescription('## Summary\n\nDoes a thing')
    expect(screen.getByText('Summary')).toBeInTheDocument()
    expect(screen.getByText('Does a thing')).toBeInTheDocument()
  })

  it('shows an empty-state message when the body is blank', () => {
    renderDescription('   ')
    expect(screen.getByText('pr.view.noDescription')).toBeInTheDocument()
  })

  it('edits and saves the description via the API', async () => {
    const user = userEvent.setup()
    renderDescription('old body')
    await user.click(screen.getByTestId('pr-description-edit'))
    const input = screen.getByTestId('pr-description-input')
    await user.clear(input)
    await user.type(input, 'new body')
    await user.click(screen.getByTestId('pr-description-save'))
    expect(updatePr).toHaveBeenCalledWith({ body: 'new body' })
  })
})
