import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { MockPR } from '../types'
import { SnoozedPRsTab } from './SnoozedPRsTab'
import { useLaunchpadStore } from '../../../stores/launchpad.store'

function pr(overrides: Partial<MockPR> = {}): MockPR {
  return {
    id: 'pr-1',
    number: 42,
    title: 'Snoozed PR',
    repo: 'git-manager',
    repoUrl: 'https://github.com/me/git-manager',
    url: 'https://github.com/me/git-manager/pull/42',
    status: 'open',
    ciStatus: null,
    author: 'me',
    authorAvatar: '',
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
  useLaunchpadStore.setState({ snoozed: {} })
})

describe('SnoozedPRsTab', () => {
  it('shows an empty state when nothing is snoozed', () => {
    render(
      <SnoozedPRsTab snoozedPRs={[]} pinnedIds={new Set()} onTogglePin={() => {}} loading={false} />
    )
    expect(screen.getByText('No snoozed PRs')).toBeInTheDocument()
  })

  it('shows the remaining time for a timed snooze', () => {
    // A few extra minutes past the 2h mark so elapsed test time can't floor it down to 1h.
    useLaunchpadStore.setState({ snoozed: { 'pr-1': Date.now() + 2 * 3_600_000 + 5 * 60_000 } })
    render(
      <SnoozedPRsTab
        snoozedPRs={[pr()]}
        pinnedIds={new Set()}
        onTogglePin={() => {}}
        loading={false}
      />
    )
    expect(screen.getByTestId('snoozed-until-pr-1')).toHaveTextContent('Snoozed · 2h')
  })

  it('shows an indefinite label for a null snooze', () => {
    useLaunchpadStore.setState({ snoozed: { 'pr-1': null } })
    render(
      <SnoozedPRsTab
        snoozedPRs={[pr()]}
        pinnedIds={new Set()}
        onTogglePin={() => {}}
        loading={false}
      />
    )
    expect(screen.getByTestId('snoozed-until-pr-1')).toHaveTextContent('Snoozed')
  })

  it('exposes the row snooze control (labelled Unsnooze) for bringing a PR back', () => {
    useLaunchpadStore.setState({ snoozed: { 'pr-1': null } })
    render(
      <SnoozedPRsTab
        snoozedPRs={[pr()]}
        pinnedIds={new Set()}
        onTogglePin={() => {}}
        loading={false}
      />
    )
    const trigger = screen.getByTestId('snooze-trigger-pr-1')
    expect(trigger).toHaveAttribute('aria-label', 'Unsnooze')
  })
})
