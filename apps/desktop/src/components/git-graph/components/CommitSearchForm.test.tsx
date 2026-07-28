import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CommitSearchForm } from './CommitSearchForm'

function renderForm(overrides: Partial<Parameters<typeof CommitSearchForm>[0]> = {}) {
  const props = {
    question: '',
    onQuestionChange: vi.fn(),
    maxCommits: 60,
    onMaxCommitsChange: vi.fn(),
    quick: false,
    onQuickChange: vi.fn(),
    isRunning: false,
    onSubmit: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  }
  return { ...render(<CommitSearchForm {...props} />), props }
}

describe('CommitSearchForm', () => {
  /**
   * The toggle decides how many commits get opened, not what "opened" means: both modes read the
   * code of what they look at. Unticked by default, because what the quick one skips it skips for
   * good, and a user who has not chosen should get the complete answer rather than the fast one.
   */
  it('offers the quick mode, unchecked', () => {
    renderForm()
    expect(screen.getByTestId('commit-search-quick')).not.toBeChecked()
    expect(screen.getByText('Quick search (shortlist from the messages)')).toBeInTheDocument()
  })

  it('states a different cost for each mode, since they differ by orders of magnitude', () => {
    const { rerender, props } = renderForm()
    expect(screen.getByTestId('commit-search-form')).toHaveTextContent(/one model call per file/i)

    rerender(<CommitSearchForm {...props} quick />)
    const hint = screen.getByTestId('commit-search-form')
    // Two narrowings, and the hint has to say both: commits, then their files.
    expect(hint).toHaveTextContent(/Narrows twice before reading anything/i)
    expect(hint).toHaveTextContent(/one call per commit picks its files/i)
    // The limitation belongs next to the offer, not in a footnote after the answer.
    expect(hint).toHaveTextContent(/never pointed at is never opened/i)
  })

  it('toggles the mode', async () => {
    const user = userEvent.setup()
    const { props } = renderForm()
    await user.click(screen.getByTestId('commit-search-quick'))
    expect(props.onQuickChange).toHaveBeenCalledWith(true)
  })

  /**
   * One control. A time window used to sit beside the count and could only ever return *fewer*
   * commits than asked for — the count is the one that must bind, since it is what the run costs.
   */
  it('bounds the search by a commit count alone', () => {
    renderForm()
    expect(screen.getByTestId('commit-search-max-commits')).toHaveValue(60)
    expect(screen.queryByTestId('commit-search-window')).not.toBeInTheDocument()
  })

  it('labels the count for what it is', () => {
    renderForm()
    expect(screen.getByText('Commits to read')).toBeInTheDocument()
  })

  /** The commit count is the control; the calls it buys are per *file*, which is the real wait. */
  it('states what the commit budget costs, in the unit it is actually paid in', () => {
    renderForm({ maxCommits: 120 })
    expect(screen.getByTestId('commit-search-form')).toHaveTextContent(
      'Reads up to 120 commits, one model call per file in each'
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

  it('reports a change to the count', () => {
    // A single change event rather than typing: the field is controlled by a prop this test holds
    // fixed, so keystrokes would each be reported against the unchanged value.
    const { props } = renderForm()
    fireEvent.change(screen.getByTestId('commit-search-max-commits'), { target: { value: '25' } })
    expect(props.onMaxCommitsChange).toHaveBeenCalledWith(25)
  })
})
