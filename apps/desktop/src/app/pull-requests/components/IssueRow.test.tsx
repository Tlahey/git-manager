import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import type { MockIssue } from '../types'

const { pluginOpen } = vi.hoisted(() => ({ pluginOpen: vi.fn() }))
vi.mock('@tauri-apps/plugin-shell', () => ({ open: pluginOpen }))

import { IssueRow } from './IssueRow'

function issue(overrides: Partial<MockIssue> = {}): MockIssue {
  return {
    id: '1',
    number: 42,
    title: 'Fix the thing',
    repo: 'git-manager',
    url: 'https://github.com/owner/repo/issues/42',
    status: 'open',
    author: 'octocat',
    authorAvatar: 'https://x/a.png',
    assignees: [],
    labels: ['bug'],
    createdAt: new Date(),
    updatedAt: new Date(),
    comments: 3,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  pluginOpen.mockResolvedValue(undefined)
})

describe('IssueRow — content', () => {
  it('shows the title, number, labels, comment count, author, and repo', () => {
    render(<IssueRow issue={issue()} />)
    expect(screen.getByText('Fix the thing')).toBeInTheDocument()
    expect(screen.getByText('#42')).toBeInTheDocument()
    expect(screen.getByText('bug')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('octocat')).toBeInTheDocument()
    expect(screen.getByText('git-manager')).toBeInTheDocument()
  })

  it('shows an open badge with a green alert icon', () => {
    const { container } = render(<IssueRow issue={issue({ status: 'open' })} />)
    expect(screen.getByText('open')).toBeInTheDocument()
    expect(container.querySelector('.text-green-400')).toBeTruthy()
  })

  it('shows a closed badge with a purple check icon', () => {
    const { container } = render(<IssueRow issue={issue({ status: 'closed' })} />)
    expect(screen.getByText('closed')).toBeInTheDocument()
    expect(container.querySelector('.text-purple-400')).toBeTruthy()
  })

  it('shows an em-dash when there are no assignees, an avatar stack otherwise', () => {
    const { rerender } = render(<IssueRow issue={issue({ assignees: [] })} />)
    expect(screen.getByText('—')).toBeInTheDocument()

    rerender(<IssueRow issue={issue({ assignees: [{ login: 'bob', avatar: 'b.png' }] })} />)
    expect(screen.queryByText('—')).not.toBeInTheDocument()
    expect(screen.getByAltText('bob')).toBeInTheDocument()
  })
})

describe('IssueRow — interaction', () => {
  it('opens the issue URL when the row is clicked', async () => {
    render(<IssueRow issue={issue({ url: 'https://github.com/owner/repo/issues/42' })} />)
    await act(async () => {
      fireEvent.click(screen.getByText('Fix the thing'))
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(pluginOpen).toHaveBeenCalledWith('https://github.com/owner/repo/issues/42')
  })
})
