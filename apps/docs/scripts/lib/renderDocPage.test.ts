import { describe, expect, it } from 'vitest'
import { formatActionText, formatStepText, renderDocPage } from './renderDocPage.ts'
import type { DocFeature } from './parseDocFeatures.ts'

function feature(overrides: Partial<DocFeature> = {}): DocFeature {
  return {
    sourcePath: 'apps/e2e/features/merge-editor.feature',
    slug: 'merge-editor',
    name: 'Three-way merge editor',
    paragraphs: ['Yours on the left, theirs on the right.'],
    scenarios: [
      {
        name: 'Resolve a conflicted file',
        paragraphs: ['The wand takes the easy blocks.'],
        actions: [{ keyword: 'When', text: 'I click the conflicted file "manifest.txt"' }],
        outcomes: [{ keyword: 'Then', text: 'the merge editor is shown' }],
        screenshot: 'doc-merge-editor',
        line: 17,
      },
    ],
    ...overrides,
  }
}

describe('formatStepText', () => {
  it('turns quoted arguments into code spans and opens with a capital', () => {
    expect(formatStepText('I stage the file "config.yml"')).toBe('I stage the file `config.yml`')
    expect(formatStepText('the merge editor is shown')).toBe('The merge editor is shown')
  })
})

describe('formatActionText', () => {
  it('rewrites the Gherkin first person into an instruction', () => {
    expect(formatActionText('I stage the file "config.yml"')).toBe('Stage the file `config.yml`')
  })

  it('leaves a step that does not start with the pronoun alone', () => {
    expect(formatActionText('Import the repository')).toBe('Import the repository')
  })
})

describe('renderDocPage', () => {
  it('renders the feature prose under an H1 and each scenario under an H2', () => {
    const page = renderDocPage(feature())
    expect(page).toContain('# Three-way merge editor')
    expect(page).toContain('Yours on the left, theirs on the right.')
    expect(page).toContain('## Resolve a conflicted file')
    expect(page).toContain('The wand takes the easy blocks.')
  })

  it('points the image at the copied screenshot, relative to the page', () => {
    expect(renderDocPage(feature())).toContain(
      '![Resolve a conflicted file](./screenshots/doc-merge-editor.png)'
    )
  })

  it('omits the image entirely when no screenshot was captured', () => {
    const withoutShot = feature()
    withoutShot.scenarios[0].screenshot = null
    expect(renderDocPage(withoutShot)).not.toContain('![')
  })

  it('numbers the actions and bullets the outcomes', () => {
    const page = renderDocPage(feature())
    expect(page).toContain('1. Click the conflicted file `manifest.txt`')
    expect(page).toContain('- The merge editor is shown')
  })

  it('skips a section a scenario has nothing for', () => {
    const noActions = feature()
    noActions.scenarios[0].actions = []
    const page = renderDocPage(noActions)
    expect(page).not.toContain('**Do this**')
    expect(page).toContain('**You should see**')
  })

  it('front-matter carries the title and a summary short enough for a meta description', () => {
    const long = feature({ paragraphs: ['word '.repeat(80).trim()] })
    const [, frontMatter] = renderDocPage(long).split('---\n', 2)
    expect(frontMatter).toContain('title: "Three-way merge editor"')
    expect(frontMatter).toMatch(/description: "[^"]{1,170}"/)
  })

  it('links back to the .feature file it came from', () => {
    expect(renderDocPage(feature())).toContain(
      'https://github.com/Tlahey/git-manager/blob/main/apps/e2e/features/merge-editor.feature'
    )
  })

  it('warns editors off the generated file and never leaves a blank-line run', () => {
    const page = renderDocPage(feature())
    expect(page).toContain('GENERATED FILE — do not edit.')
    expect(page).not.toMatch(/\n{3}/)
  })
})
