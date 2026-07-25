import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RecentRepoRow } from './RecentRepoRow'

describe('RecentRepoRow', () => {
  it('shows the repo name and its full path', () => {
    render(<RecentRepoRow path="/tmp/work/alpha" name="alpha" isOpen={false} onSelect={vi.fn()} />)
    expect(screen.getByText('alpha')).toBeInTheDocument()
    expect(screen.getByText('/tmp/work/alpha')).toBeInTheDocument()
  })

  it('marks a repo that already has a tab as open', () => {
    render(<RecentRepoRow path="/tmp/work/alpha" name="alpha" isOpen onSelect={vi.fn()} />)
    expect(screen.getByText('Open')).toBeInTheDocument()
  })

  it('does not mark a repo that has no tab', () => {
    render(<RecentRepoRow path="/tmp/work/alpha" name="alpha" isOpen={false} onSelect={vi.fn()} />)
    expect(screen.queryByText('Open')).not.toBeInTheDocument()
  })

  it('calls onSelect when clicked', async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()
    render(<RecentRepoRow path="/tmp/work/alpha" name="alpha" isOpen={false} onSelect={onSelect} />)
    await user.click(screen.getByTestId('new-tab-recent-repo-/tmp/work/alpha'))
    expect(onSelect).toHaveBeenCalledTimes(1)
  })
})
