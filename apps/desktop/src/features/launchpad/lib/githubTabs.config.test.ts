import { describe, it, expect } from 'vitest'
import { TAB_REQUIRES_GITHUB, LOCAL_ONLY_TABS, resolveActiveTab } from './githubTabs.config'

describe('githubTabs.config', () => {
  it('marks the WIP tab as the only one that stands without an account', () => {
    expect(LOCAL_ONLY_TABS).toEqual(['wip'])
    expect(TAB_REQUIRES_GITHUB.wip).toBe(false)
    expect(TAB_REQUIRES_GITHUB.prs).toBe(true)
    expect(TAB_REQUIRES_GITHUB.stats).toBe(true)
    expect(TAB_REQUIRES_GITHUB.views).toBe(true)
  })

  it('leaves the active tab alone while an account is connected', () => {
    expect(resolveActiveTab('stats', true)).toBe('stats')
    expect(resolveActiveTab('wip', true)).toBe('wip')
  })

  // The active tab is persisted, so a signed-out user can land on one that is no longer in the bar.
  it('falls back to the first local tab when the active one needs an account', () => {
    expect(resolveActiveTab('prs', false)).toBe('wip')
    expect(resolveActiveTab('views', false)).toBe('wip')
  })

  it('keeps a local tab selected while signed out', () => {
    expect(resolveActiveTab('wip', false)).toBe('wip')
  })
})
