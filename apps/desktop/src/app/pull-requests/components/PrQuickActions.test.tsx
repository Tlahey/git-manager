import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { MockPR } from '../types'

vi.mock('../../../api/github.api', () => ({
  mergePullRequest: vi.fn().mockResolvedValue({ merged: true }),
  updatePullRequest: vi.fn().mockResolvedValue({}),
}))

import { mergePullRequest, updatePullRequest } from '../../../api/github.api'
import { useSettingsStore } from '../../../stores/settings.store'
import { useLaunchpadStore } from '../../../stores/launchpad.store'
import { PrQuickActions } from './PrQuickActions'

const mergedMerge = mergePullRequest as unknown as ReturnType<typeof vi.fn>
const mockedUpdate = updatePullRequest as unknown as ReturnType<typeof vi.fn>

function pr(overrides: Partial<MockPR> = {}): MockPR {
  return {
    id: 'pr-1',
    number: 42,
    title: 'Add feature X',
    repo: 'git-manager',
    repoUrl: 'https://github.com/me/git-manager',
    fullName: 'me/git-manager',
    url: 'https://github.com/me/git-manager/pull/42',
    status: 'open',
    ciStatus: 'success',
    author: 'me',
    authorAvatar: '',
    collaborators: [],
    filesChanged: 1,
    additions: 1,
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

function signIn() {
  useSettingsStore.setState((s) => ({
    settings: {
      ...s.settings,
      github: {
        accounts: [
          { id: 'a', token: 'tok', user: { login: 'me', name: null, email: null, avatarUrl: '' } },
        ],
        activeAccountId: 'a',
      },
    },
  }))
}

beforeEach(() => {
  vi.clearAllMocks()
  useSettingsStore.setState((s) => ({
    settings: { ...s.settings, github: { accounts: [], activeAccountId: null } },
  }))
  useLaunchpadStore.setState({ snoozed: {} })
})

describe('PrQuickActions', () => {
  it('leads with Merge for your own green PR and merges after confirmation', async () => {
    signIn()
    const user = userEvent.setup()
    render(<PrQuickActions pr={pr()} />)

    const primary = screen.getByTestId('pr-actions-pr-1-btn')
    expect(primary).toHaveTextContent('Merge')

    await user.click(primary)
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Merge pull request')).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Merge' }))
    await waitFor(() =>
      expect(mergedMerge).toHaveBeenCalledWith(
        'me',
        'git-manager',
        42,
        { mergeMethod: 'squash' },
        'tok'
      )
    )
  })

  it('leads with View for a PR you cannot merge and offers no merge action', async () => {
    signIn()
    const user = userEvent.setup()
    render(<PrQuickActions pr={pr({ ciStatus: 'failure' })} />)

    expect(screen.getByTestId('pr-actions-pr-1-btn')).toHaveTextContent('View')
    await user.click(screen.getByRole('button', { name: 'More options' }))
    expect(screen.queryByRole('menuitem', { name: 'Merge' })).not.toBeInTheDocument()
  })

  it('uses a short "Open" primary label for a merged PR', () => {
    render(<PrQuickActions pr={pr({ status: 'merged' })} />)
    expect(screen.getByTestId('pr-actions-pr-1-btn')).toHaveTextContent('Open')
  })

  it('does not expose pin or snooze in the dropdown (those live on the row edge)', async () => {
    signIn()
    const user = userEvent.setup()
    render(<PrQuickActions pr={pr({ ciStatus: 'running' })} />)

    await user.click(screen.getByRole('button', { name: 'More options' }))
    expect(screen.queryByRole('menuitem', { name: /Snooze/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /Pin/ })).not.toBeInTheDocument()
  })

  it('closes a PR after confirmation', async () => {
    signIn()
    const user = userEvent.setup()
    // A running-CI PR is not mergeable, so the primary is View and Close lives in the dropdown.
    render(<PrQuickActions pr={pr({ ciStatus: 'running' })} />)

    await user.click(screen.getByRole('button', { name: 'More options' }))
    await user.click(screen.getByRole('menuitem', { name: 'Close PR' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Close PR' }))

    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith(
        'me',
        'git-manager',
        42,
        { state: 'closed' },
        'tok'
      )
    )
  })
})
