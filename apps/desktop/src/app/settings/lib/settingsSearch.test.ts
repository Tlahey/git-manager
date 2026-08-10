import { describe, it, expect } from 'vitest'
import { createTabMatcher, normalizeQuery, LOCAL_KEYWORD_ID } from './settingsSearch'

/** Stands in for i18n: every page's synonym list, keyed the way the real keys are. */
const t = (key: string) =>
  ({
    'settings.search.keywords.ui_customization': 'couleurs thème terminal',
    'settings.search.keywords.gitflow': 'branches protégées',
  })[key] ?? ''

describe('createTabMatcher', () => {
  /** "Not searching" and "searching for nothing" have to be the same state, or clearing the box
   *  would leave the panel empty. */
  it('matches everything for an empty or blank query', () => {
    expect(createTabMatcher('', t)('Personnalisation', 'x')).toBe(true)
    expect(createTabMatcher('   ', t)('Personnalisation', 'x')).toBe(true)
  })

  it('matches on the page label', () => {
    const matches = createTabMatcher('person', t)
    expect(matches('Personnalisation', 'settings.search.keywords.ui_customization')).toBe(true)
  })

  /**
   * The reason the keywords exist: neither "terminal" nor "couleur" appears in the page's name, and
   * both are what a user actually types when looking for it.
   */
  it('matches on a synonym the label does not contain', () => {
    const matches = createTabMatcher('terminal', t)
    expect(matches('Personnalisation', 'settings.search.keywords.ui_customization')).toBe(true)
  })

  /**
   * Without accent folding, French search is a trap — a page called "Personnalisation" would be
   * missed by a user typing it without the accent, and a page whose keyword is "protégées" would be
   * missed by "protegees".
   */
  it('ignores accents on both sides of the comparison', () => {
    expect(createTabMatcher('protegees', t)('GitFlow', 'settings.search.keywords.gitflow')).toBe(
      true
    )
    expect(createTabMatcher('thème', t)('X', 'settings.search.keywords.ui_customization')).toBe(
      true
    )
  })

  it('rejects a query that matches neither the label nor the keywords', () => {
    expect(createTabMatcher('zzz', t)('GitFlow', 'settings.search.keywords.gitflow')).toBe(false)
  })
})

describe('normalizeQuery', () => {
  it('trims and folds, so the panel and each page agree on what was typed', () => {
    expect(normalizeQuery('  Thème  ')).toBe(normalizeQuery('theme'))
  })
})

describe('LOCAL_KEYWORD_ID', () => {
  /** The two Repository pages that mirror a global one borrow its keywords instead of repeating
   *  them — a second copy is a second thing to keep translated. */
  it('points the mirrored pages at their global counterpart', () => {
    expect(LOCAL_KEYWORD_ID.appearance).toBe('ui_customization')
    expect(LOCAL_KEYWORD_ID.ai_commit).toBe('ai_commit')
  })

  it('gives the repo-only pages their own', () => {
    expect(LOCAL_KEYWORD_ID.gitflow).toBe('gitflow')
    expect(LOCAL_KEYWORD_ID.worktree).toBe('worktree')
    expect(LOCAL_KEYWORD_ID.run).toBe('run')
  })
})
