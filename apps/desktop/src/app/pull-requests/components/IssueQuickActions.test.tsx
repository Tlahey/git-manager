import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { MockIssue } from '../types'

const { pluginOpen } = vi.hoisted(() => ({ pluginOpen: vi.fn() }))
vi.mock('@tauri-apps/plugin-shell', () => ({ open: pluginOpen }))

import { IssueQuickActions } from './IssueQuickActions'

function issue(overrides: Partial<MockIssue> = {}): MockIssue {
  return {
    id: '1',
    number: 42,
    title: 'Fix the thing',
    repo: 'git-manager',
    fullName: 'owner/git-manager',
    url: 'https://github.com/owner/git-manager/issues/42',
    status: 'open',
    author: 'octocat',
    authorAvatar: '',
    assignees: [],
    labels: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    comments: 0,
    thumbsUp: 0,
    ...overrides,
  }
}

function renderActions(props: Partial<Parameters<typeof IssueQuickActions>[0]> = {}) {
  return render(
    <IssueQuickActions
      issue={issue()}
      viewRepo={vi.fn()}
      close={vi.fn().mockResolvedValue(undefined)}
      closing={false}
      canClose={false}
      {...props}
    />
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  pluginOpen.mockResolvedValue(undefined)
})

describe('IssueQuickActions', () => {
  it('opens the issue on GitHub from the primary View button when no panel is available', async () => {
    const user = userEvent.setup()
    renderActions()
    await act(async () => {
      await user.click(screen.getByRole('button', { name: /view/i }))
      await Promise.resolve()
    })
    expect(pluginOpen).toHaveBeenCalledWith('https://github.com/owner/git-manager/issues/42')
  })

  it('lists View repo / Open on GitHub / Copy link, and calls viewRepo', async () => {
    const user = userEvent.setup()
    const viewRepo = vi.fn()
    renderActions({ viewRepo })
    await user.click(screen.getByRole('button', { name: 'More options' }))
    expect(screen.getByRole('menuitem', { name: 'Open on GitHub' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Copy link' })).toBeInTheDocument()
    await user.click(screen.getByRole('menuitem', { name: 'View repo' }))
    expect(viewRepo).toHaveBeenCalledOnce()
  })

  it('offers Mark as closed only when closing is possible', async () => {
    const user = userEvent.setup()
    const { rerender } = renderActions({ canClose: false })
    await user.click(screen.getByRole('button', { name: 'More options' }))
    expect(screen.queryByRole('menuitem', { name: 'Mark as closed' })).not.toBeInTheDocument()
    await user.keyboard('{Escape}')

    rerender(
      <IssueQuickActions
        issue={issue()}
        viewRepo={vi.fn()}
        close={vi.fn().mockResolvedValue(undefined)}
        closing={false}
        canClose
      />
    )
    await user.click(screen.getByRole('button', { name: 'More options' }))
    expect(screen.getByRole('menuitem', { name: 'Mark as closed' })).toBeInTheDocument()
  })

  it('confirms then closes', async () => {
    const user = userEvent.setup()
    const close = vi.fn().mockResolvedValue(undefined)
    renderActions({ canClose: true, close })
    await user.click(screen.getByRole('button', { name: 'More options' }))
    await user.click(screen.getByRole('menuitem', { name: 'Mark as closed' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Close this issue?')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Mark as closed' }))
    expect(close).toHaveBeenCalledOnce()
  })
})
