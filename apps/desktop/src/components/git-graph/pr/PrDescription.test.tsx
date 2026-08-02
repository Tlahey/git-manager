import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { updatePr } = vi.hoisted(() => ({ updatePr: vi.fn() }))
vi.mock('../../../hooks/usePrActions', () => ({
  usePrActions: () => ({ updatePr, pending: false }),
}))

const openUrl = vi.fn()
vi.mock('../../../lib/openUrl', () => ({ openUrl: (...a: unknown[]) => openUrl(...a) }))

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
    expect(screen.getByText('No description provided.')).toBeInTheDocument()
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

  it('ticks a task-list item straight from the rendered description', async () => {
    const user = userEvent.setup()
    renderDescription('### Checklist\n\n- [ ] tests\n- [ ] docs')

    await user.click(screen.getAllByRole('checkbox')[1])

    expect(updatePr).toHaveBeenCalledWith({ body: '### Checklist\n\n- [ ] tests\n- [x] docs' })
  })

  it('holds the tick while the PATCH is in flight, rather than springing back', async () => {
    const user = userEvent.setup()
    let settle = () => {}
    updatePr.mockImplementation(() => new Promise<void>((resolve) => (settle = resolve)))
    renderDescription('- [ ] docs')

    await user.click(screen.getByRole('checkbox'))

    expect(screen.getByRole('checkbox')).toBeChecked()
    expect(screen.getByRole('checkbox')).toBeDisabled()

    settle()
    // The body prop hasn't moved (no revalidation in this test), so the tick lets go with it.
    await waitFor(() => expect(screen.getByRole('checkbox')).toBeEnabled())
  })

  it('does not leave the description stuck when GitHub refuses the write', async () => {
    const user = userEvent.setup()
    updatePr.mockRejectedValue(new Error('403'))
    renderDescription('- [ ] docs')

    await user.click(screen.getByRole('checkbox'))

    await waitFor(() => expect(screen.getByRole('checkbox')).not.toBeChecked())
    expect(screen.getByRole('checkbox')).toBeEnabled()
  })

  it('opens the PR on GitHub when an image is dropped on the editor, since uploads have no API', async () => {
    const user = userEvent.setup()
    render(<PrDescription repoPath="/repo" prNumber={1} body="old body" prUrl="https://github.com/o/r/pull/1" />)
    await user.click(screen.getByTestId('pr-description-edit'))

    fireEvent.drop(screen.getByTestId('pr-description-input'), {
      dataTransfer: { types: ['Files'], files: [{ type: 'image/png' }] } as unknown as DataTransfer,
    })

    expect(openUrl).toHaveBeenCalledWith('https://github.com/o/r/pull/1')
  })
})
