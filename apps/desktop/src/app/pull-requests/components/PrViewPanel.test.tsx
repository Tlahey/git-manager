import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import type { MockPR, CiDetail } from '../types'

const { pluginOpen } = vi.hoisted(() => ({ pluginOpen: vi.fn() }))
vi.mock('@tauri-apps/plugin-shell', () => ({ open: pluginOpen }))

import { PrViewPanel } from './PrViewPanel'

function pr(overrides: Partial<MockPR> = {}): MockPR {
  return {
    id: '1',
    number: 42,
    title: 'Add feature X',
    repo: 'git-manager',
    repoUrl: 'https://github.com/owner/git-manager',
    fullName: 'owner/git-manager',
    url: 'https://github.com/owner/git-manager/pull/42',
    status: 'open',
    ciStatus: null,
    author: 'octocat',
    authorAvatar: 'https://x/a.png',
    collaborators: [],
    filesChanged: 0,
    additions: 0,
    deletions: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    reviewStatus: 'pending',
    isDraft: false,
    labels: [],
    comments: 0,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  pluginOpen.mockResolvedValue(undefined)
})

describe('PrViewPanel', () => {
  it('renders the PR title, number and an in-app (non-GitHub) view container', () => {
    render(<PrViewPanel pr={pr()} onClose={vi.fn()} />)
    expect(screen.getByTestId('launchpad-pr-view')).toBeInTheDocument()
    expect(screen.getByText('Add feature X')).toBeInTheDocument()
    expect(screen.getByText('#42')).toBeInTheDocument()
  })

  it('returns to the list via the top-left Back button', () => {
    const onClose = vi.fn()
    render(<PrViewPanel pr={pr()} onClose={onClose} />)
    fireEvent.click(screen.getByTestId('launchpad-pr-back'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('opens the PR on GitHub from the header escape hatch', async () => {
    render(<PrViewPanel pr={pr()} onClose={vi.fn()} />)
    await act(async () => {
      fireEvent.click(screen.getByText('Open on GitHub'))
      await Promise.resolve()
    })
    expect(pluginOpen).toHaveBeenCalledWith('https://github.com/owner/git-manager/pull/42')
  })

  it('lists every CI check and opens its run on click', async () => {
    const ciDetails: CiDetail[] = [
      { name: 'build', status: 'success', url: 'https://ci/build' },
      { name: 'lint', status: 'failure', url: 'https://ci/lint' },
    ]
    render(<PrViewPanel pr={pr({ ciStatus: 'failure', ciDetails })} onClose={vi.fn()} />)
    expect(screen.getByText('build')).toBeInTheDocument()
    expect(screen.getByText('lint')).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(screen.getByText('lint'))
      await Promise.resolve()
    })
    expect(pluginOpen).toHaveBeenCalledWith('https://ci/lint')
  })

  it('shows a "no checks" message when there is no CI', () => {
    render(<PrViewPanel pr={pr({ ciStatus: null, ciDetails: [] })} onClose={vi.fn()} />)
    expect(screen.getByText('No CI checks reported')).toBeInTheDocument()
  })

  it('lists reviewers when present', () => {
    render(
      <PrViewPanel
        pr={pr({ collaborators: [{ login: 'reviewer1', avatar: 'r.png' }] })}
        onClose={vi.fn()}
      />
    )
    expect(screen.getByText('reviewer1')).toBeInTheDocument()
  })

  it('falls back to a no-description note when signed out (no body fetched)', () => {
    render(<PrViewPanel pr={pr()} onClose={vi.fn()} />)
    expect(screen.getByText('No description provided.')).toBeInTheDocument()
  })
})
