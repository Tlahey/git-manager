import { describe, it, expect } from 'vitest'
import { resolvePrReviewers } from './prReviewers'
import type { PrReviewSummary } from '../api/github.api'

function summary(reviewers: PrReviewSummary['reviewers']): PrReviewSummary {
  return { reviewDecision: null, reviewers, checksState: null }
}

describe('resolvePrReviewers', () => {
  // The bug this exists for: GitHub drops a reviewer from `requested_reviewers` the moment they
  // submit a review, so a fully reviewed PR has an empty one and the panel showed nothing.
  it('lists reviewers who already reviewed, though REST no longer requests them', () => {
    const reviewers = resolvePrReviewers(
      summary([
        { login: 'alice', avatarUrl: 'a.png', state: 'APPROVED' },
        { login: 'bob', avatarUrl: 'b.png', state: 'CHANGES_REQUESTED' },
      ]),
      []
    )

    expect(reviewers).toEqual([
      { login: 'alice', avatarUrl: 'a.png', state: 'APPROVED' },
      { login: 'bob', avatarUrl: 'b.png', state: 'CHANGES_REQUESTED' },
    ])
  })

  it('falls back to the requested reviewers as pending when the summary is missing', () => {
    const reviewers = resolvePrReviewers(undefined, [{ login: 'carol', avatar_url: 'c.png' }])

    expect(reviewers).toEqual([{ login: 'carol', avatarUrl: 'c.png', state: 'PENDING' }])
  })

  it('appends a requested reviewer the summary does not know about yet', () => {
    const reviewers = resolvePrReviewers(
      summary([{ login: 'alice', avatarUrl: 'a.png', state: 'APPROVED' }]),
      [{ login: 'dave', avatar_url: 'd.png' }]
    )

    expect(reviewers.map((r) => [r.login, r.state])).toEqual([
      ['alice', 'APPROVED'],
      ['dave', 'PENDING'],
    ])
  })

  // A re-requested review appears in both payloads; the summary's verdict wins and it stays one row.
  it('does not duplicate a reviewer present in both sources', () => {
    const reviewers = resolvePrReviewers(
      summary([{ login: 'alice', avatarUrl: 'a.png', state: 'COMMENTED' }]),
      [{ login: 'alice', avatar_url: 'a.png' }]
    )

    expect(reviewers).toEqual([{ login: 'alice', avatarUrl: 'a.png', state: 'COMMENTED' }])
  })

  it('is empty when the PR has no reviewer at all', () => {
    expect(resolvePrReviewers(summary([]), undefined)).toEqual([])
  })
})
