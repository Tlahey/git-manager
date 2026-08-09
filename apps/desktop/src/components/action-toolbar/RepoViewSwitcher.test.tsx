import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RepoViewSwitcher } from './RepoViewSwitcher'
import { useRepoViewStore } from '../../stores/repoView.store'

beforeEach(() => {
  useRepoViewStore.setState({ view: 'graph' })
})

describe('RepoViewSwitcher', () => {
  it('names all three views, so each is reachable by its own name', () => {
    render(<RepoViewSwitcher />)

    expect(screen.getByRole('radio', { name: 'Graph' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Files' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Board' })).toBeInTheDocument()
  })

  it('marks the view on screen as the selected one', () => {
    useRepoViewStore.setState({ view: 'board' })
    render(<RepoViewSwitcher />)

    expect(screen.getByRole('radio', { name: 'Board' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Graph' })).not.toBeChecked()
  })

  it('switches the view on a click', async () => {
    const user = userEvent.setup()
    render(<RepoViewSwitcher />)

    await user.click(screen.getByRole('radio', { name: 'Files' }))
    expect(useRepoViewStore.getState().view).toBe('files')
  })

  /**
   * The reason this is a segmented control and not three toolbar buttons: one view is selected, the
   * others are not, and native radios sharing a name are what say so — to assistive tech and to the
   * keyboard, not only in the fill.
   */
  it('keeps exactly one view selected', async () => {
    const user = userEvent.setup()
    render(<RepoViewSwitcher />)

    await user.click(screen.getByRole('radio', { name: 'Board' }))

    const checked = screen.getAllByRole('radio').filter((r) => (r as HTMLInputElement).checked)
    expect(checked).toHaveLength(1)
    expect(useRepoViewStore.getState().view).toBe('board')
  })
})
