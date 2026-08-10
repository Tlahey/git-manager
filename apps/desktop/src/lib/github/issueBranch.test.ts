import { describe, it, expect } from 'vitest'
import { issueBranchName, branchMatchesIssue } from './issueBranch'

describe('issueBranchName', () => {
  it('slugifies the title and prefixes the number', () => {
    expect(issueBranchName({ number: 312, title: 'Tab close button overlaps text!' })).toBe(
      '312-tab-close-button-overlaps-text'
    )
  })

  it('caps the slug length', () => {
    const name = issueBranchName({ number: 1, title: 'a'.repeat(80) })
    expect(name.length).toBeLessThanOrEqual('1-'.length + 40)
  })

  it('falls back to just the number when the title has no usable characters', () => {
    expect(issueBranchName({ number: 7, title: '!!!' })).toBe('7')
  })
})

describe('branchMatchesIssue', () => {
  it('matches the number as a standalone token', () => {
    expect(branchMatchesIssue('312-fix', 312)).toBe(true)
    expect(branchMatchesIssue('fix-312', 312)).toBe(true)
    expect(branchMatchesIssue('gh/312/fix', 312)).toBe(true)
  })

  it('does not match a different number that merely contains the digits', () => {
    expect(branchMatchesIssue('3120-fix', 312)).toBe(false)
    expect(branchMatchesIssue('1312-fix', 312)).toBe(false)
    expect(branchMatchesIssue('main', 312)).toBe(false)
  })
})
