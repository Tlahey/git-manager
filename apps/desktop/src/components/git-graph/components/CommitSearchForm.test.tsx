import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CommitSearchForm } from './CommitSearchForm'

function renderForm(overrides: Partial<Parameters<typeof CommitSearchForm>[0]> = {}) {
  const props = {
    question: '',
    onQuestionChange: vi.fn(),
    sinceHours: 24 * 30,
    onSinceHoursChange: vi.fn(),
    maxCommits: 60,
    onMaxCommitsChange: vi.fn(),
    isRunning: false,
    onSubmit: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  }
  return { ...render(<CommitSearchForm {...props} />), props }
}

describe('CommitSearchForm', () => {
  it('offers the three windows a repository is usually asked about', () => {
    renderForm()
    const select = screen.getByTestId('commit-search-window') as HTMLSelectElement
    expect([...select.options].map((o) => o.text)).toEqual([
      'Last 7 days',
      'Last 30 days',
      'Last 90 days',
    ])
    expect(select.value).toBe(String(24 * 30))
  })

  it('states what the commit budget costs, since it is the whole wait', () => {
    renderForm({ maxCommits: 120 })
    expect(screen.getByTestId('commit-search-form')).toHaveTextContent(
      'Reads up to 120 commits, one model call each'
    )
  })

  it('submits on Enter and leaves Shift+Enter for a newline', async () => {
    const user = userEvent.setup()
    const { props } = renderForm({ question: 'Did the Button change?' })

    await user.click(screen.getByTestId('commit-search-question'))
    await user.keyboard('{Enter}')
    expect(props.onSubmit).toHaveBeenCalledTimes(1)

    await user.keyboard('{Shift>}{Enter}{/Shift}')
    expect(props.onSubmit).toHaveBeenCalledTimes(1)
  })

  it('does not submit an empty question on Enter', async () => {
    const user = userEvent.setup()
    const { props } = renderForm({ question: '   ' })

    await user.click(screen.getByTestId('commit-search-question'))
    await user.keyboard('{Enter}')
    expect(props.onSubmit).not.toHaveBeenCalled()
  })

  it('swaps the search button for a stop button while it runs', async () => {
    const user = userEvent.setup()
    const { props } = renderForm({ isRunning: true, question: 'anything' })

    expect(screen.queryByTestId('commit-search-submit')).not.toBeInTheDocument()
    await user.click(screen.getByTestId('commit-search-stop'))
    expect(props.onCancel).toHaveBeenCalled()
  })

  it('reports a window change in hours', async () => {
    const user = userEvent.setup()
    const { props } = renderForm()
    await user.selectOptions(screen.getByTestId('commit-search-window'), String(24 * 7))
    expect(props.onSinceHoursChange).toHaveBeenCalledWith(24 * 7)
  })
})
