import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { GhRawPR, PrCheck, PrMergeability } from '../../../api/github.api'

vi.mock('@git-manager/i18n', () => ({
  useTranslation: () => ({ t: (key: string, opts?: { count?: number; base?: string }) => (opts?.count != null ? `${key}:${opts.count}` : key) }),
}))

const { updateBranch } = vi.hoisted(() => ({ updateBranch: vi.fn() }))
vi.mock('../../../hooks/usePrActions', () => ({
  usePrActions: () => ({ updateBranch, pending: false }),
}))

import { PrChecksBox } from './PrChecksBox'

function pr(overrides: Partial<GhRawPR> = {}): GhRawPR {
  return {
    number: 7,
    title: 'T',
    html_url: '',
    state: 'open',
    draft: false,
    merged_at: null,
    created_at: '',
    updated_at: '',
    requested_reviewers: [{ login: 'rev1', avatar_url: '' }],
    base: { ref: 'main' },
    head: { sha: 'abc' },
    ...overrides,
  }
}

function check(overrides: Partial<PrCheck>): PrCheck {
  return { name: 'c', category: 'success', isRequired: false, ...overrides }
}

function mergeability(overrides: Partial<PrMergeability> = {}): PrMergeability {
  return {
    mergeable: 'MERGEABLE',
    mergeStateStatus: 'CLEAN',
    reviewDecision: null,
    checks: [],
    viewerCanMergeAsAdmin: false,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

function renderBox(m: PrMergeability, prOverrides: Partial<GhRawPR> = {}) {
  return render(
    <PrChecksBox repoPath="/repo" prNumber={7} pr={pr(prOverrides)} mergeability={m} isLoading={false} />
  )
}

describe('PrChecksBox', () => {
  it('shows a "review required" row from the review decision with the pending count', () => {
    renderBox(mergeability({ reviewDecision: 'REVIEW_REQUIRED' }))
    const row = screen.getByTestId('pr-checks-review')
    expect(row).toHaveTextContent('pr.checks.review.required')
    expect(row).toHaveTextContent('pr.checks.review.pending:1')
  })

  it('summarizes checks and lists them grouped with a Required badge', () => {
    renderBox(
      mergeability({
        mergeStateStatus: 'UNSTABLE',
        checks: [
          check({ name: 'build', category: 'in_progress', isRequired: true }),
          check({ name: 'lint', category: 'success' }),
        ],
      })
    )
    expect(screen.getByTestId('pr-checks-summary')).toHaveTextContent(
      'pr.checks.summary.inProgress'
    )
    // In-progress → expanded by default, so the rows and the required badge are visible.
    expect(screen.getByTestId('pr-check-build')).toBeInTheDocument()
    expect(screen.getByTestId('pr-check-required-build')).toBeInTheDocument()
  })

  it('collapses and expands the checks list', async () => {
    const user = userEvent.setup()
    renderBox(mergeability({ checks: [check({ name: 'lint', category: 'success' })] }))
    // All-success → collapsed by default.
    expect(screen.queryByTestId('pr-check-lint')).not.toBeInTheDocument()
    await user.click(screen.getByTestId('pr-checks-toggle'))
    expect(screen.getByTestId('pr-check-lint')).toBeInTheDocument()
  })

  it('shows the out-of-date row and triggers Update branch', async () => {
    const user = userEvent.setup()
    renderBox(mergeability({ mergeStateStatus: 'BEHIND' }))
    expect(screen.getByTestId('pr-checks-behind')).toBeInTheDocument()
    await user.click(screen.getByTestId('pr-update-branch'))
    expect(updateBranch).toHaveBeenCalledOnce()
  })

  it('shows the blocked row when merging is blocked', () => {
    renderBox(mergeability({ mergeStateStatus: 'BLOCKED' }))
    expect(screen.getByTestId('pr-checks-blocked')).toHaveTextContent('pr.checks.blocked.title')
  })

  it('shows the conflicts row when the branch is dirty', () => {
    renderBox(mergeability({ mergeStateStatus: 'DIRTY' }))
    expect(screen.getByTestId('pr-checks-conflicts')).toHaveTextContent('pr.checks.conflicts.title')
  })
})
