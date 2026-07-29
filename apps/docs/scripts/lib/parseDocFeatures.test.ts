import { describe, expect, it } from 'vitest'
import { parseDocFeature, toParagraphs } from './parseDocFeatures.ts'

/** A feature exercising every convention the generator relies on. */
const FEATURE = `@merge @conflict
Feature: Three-way merge editor
  As a user resolving a conflict
  I want the editor to open
  So that I can resolve it

  When two versions of a file disagree, the editor opens.
  Yours on the left, theirs on the right.

  A second paragraph.

  Background:
    Given the "rebase-conflict" fixture is built

  @doc @screenshots
  Scenario: Resolve a conflicted file
    The wand takes the easy blocks in one click.
    You settle the rest by hand.
    Given the app language is English
    And the "rebase-conflict" fixture repository is opened
    When I click the conflicted file "manifest.txt" to resolve it
    And the interface has settled
    Then the merge editor is shown
    And a full-window screenshot is saved as "doc-merge-editor"

  Scenario: Untagged regression case
    When I open the merge editor for "manifest.txt"
    Then the merge editor is shown
`

describe('toParagraphs', () => {
  it('folds hard-wrapped lines into one paragraph per blank-line-separated block', () => {
    expect(toParagraphs('    one line\n    continued here\n\n    second block')).toEqual([
      'one line continued here',
      'second block',
    ])
  })

  it('returns nothing for an absent description', () => {
    expect(toParagraphs(undefined)).toEqual([])
  })

  it('drops the Connextra user story only when asked', () => {
    const story = '  As a user\n  I want a thing\n  So that I win\n\n  Real prose.'
    expect(toParagraphs(story, true)).toEqual(['Real prose.'])
    expect(toParagraphs(story, false)).toEqual(['As a user I want a thing So that I win', 'Real prose.'])
  })
})

describe('parseDocFeature', () => {
  const feature = parseDocFeature(FEATURE, 'apps/e2e/features/merge-editor.feature')!

  it('keeps only the @doc scenarios', () => {
    expect(feature.scenarios.map((s) => s.name)).toEqual(['Resolve a conflicted file'])
  })

  it('derives the slug from the source path', () => {
    expect(feature.slug).toBe('merge-editor')
  })

  it('uses the feature prose as the intro, without the user story', () => {
    expect(feature.paragraphs).toEqual([
      'When two versions of a file disagree, the editor opens. Yours on the left, theirs on the right.',
      'A second paragraph.',
    ])
  })

  it('reads the scenario prose from its description block', () => {
    expect(feature.scenarios[0].paragraphs).toEqual([
      'The wand takes the easy blocks in one click. You settle the rest by hand.',
    ])
  })

  it('joins the screenshot through the "saved as" step', () => {
    expect(feature.scenarios[0].screenshot).toBe('doc-merge-editor')
  })

  it('keeps only the steps the reader performs as actions', () => {
    // "the interface has settled" is a test-timing step, not something to do.
    expect(feature.scenarios[0].actions.map((s) => s.text)).toEqual([
      'I click the conflicted file "manifest.txt" to resolve it',
    ])
  })

  it('drops fixture setup and the screenshot step from the outcomes', () => {
    expect(feature.scenarios[0].outcomes.map((s) => s.text)).toEqual(['the merge editor is shown'])
  })

  it('resolves And/But to the keyword they continue', () => {
    expect(feature.scenarios[0].outcomes.every((s) => s.keyword === 'Then')).toBe(true)
  })

  it('returns null for a feature with no @doc scenario', () => {
    const source = FEATURE.replace('@doc @screenshots', '@screenshots')
    expect(parseDocFeature(source, 'apps/e2e/features/merge-editor.feature')).toBeNull()
  })

  it('refuses a @doc scenario that has no description to render', () => {
    const source = FEATURE.replace(
      '    The wand takes the easy blocks in one click.\n    You settle the rest by hand.\n',
      ''
    )
    expect(() => parseDocFeature(source, 'apps/e2e/features/merge-editor.feature')).toThrow()
  })
})
