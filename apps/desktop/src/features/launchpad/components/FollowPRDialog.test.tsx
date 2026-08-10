import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FollowPRDialog } from './FollowPRDialog'

describe('FollowPRDialog — validation', () => {
  it('disables "Follow PR" until a valid GitHub PR URL is entered', async () => {
    const user = userEvent.setup()
    render(<FollowPRDialog onAdd={vi.fn()} onClose={vi.fn()} />)
    const followButton = screen.getByText('Follow PR')
    expect(followButton).toBeDisabled()

    await user.type(
      screen.getByPlaceholderText('https://github.com/owner/repo/pull/123'),
      'https://github.com/owner/repo/issues/1'
    )
    expect(followButton).toBeDisabled()

    await user.clear(screen.getByPlaceholderText('https://github.com/owner/repo/pull/123'))
    await user.type(
      screen.getByPlaceholderText('https://github.com/owner/repo/pull/123'),
      'https://github.com/owner/repo/pull/123'
    )
    expect(followButton).toBeEnabled()
  })
})

describe('FollowPRDialog — submitting', () => {
  it('adds the trimmed URL and closes on click', async () => {
    const onAdd = vi.fn()
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<FollowPRDialog onAdd={onAdd} onClose={onClose} />)
    await user.type(
      screen.getByPlaceholderText('https://github.com/owner/repo/pull/123'),
      '  https://github.com/owner/repo/pull/123  '
    )
    await user.click(screen.getByText('Follow PR'))
    expect(onAdd).toHaveBeenCalledWith('https://github.com/owner/repo/pull/123')
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('submits on Enter too', async () => {
    const onAdd = vi.fn()
    const user = userEvent.setup()
    render(<FollowPRDialog onAdd={onAdd} onClose={vi.fn()} />)
    await user.type(
      screen.getByPlaceholderText('https://github.com/owner/repo/pull/123'),
      'https://github.com/owner/repo/pull/1{Enter}'
    )
    expect(onAdd).toHaveBeenCalledWith('https://github.com/owner/repo/pull/1')
  })

  it('does not submit on Enter while invalid', async () => {
    const onAdd = vi.fn()
    const user = userEvent.setup()
    render(<FollowPRDialog onAdd={onAdd} onClose={vi.fn()} />)
    await user.type(
      screen.getByPlaceholderText('https://github.com/owner/repo/pull/123'),
      'not a url{Enter}'
    )
    expect(onAdd).not.toHaveBeenCalled()
  })

  it('closes without adding via Cancel', async () => {
    const onAdd = vi.fn()
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<FollowPRDialog onAdd={onAdd} onClose={onClose} />)
    await user.click(screen.getByText('Cancel'))
    expect(onClose).toHaveBeenCalledOnce()
    expect(onAdd).not.toHaveBeenCalled()
  })
})
