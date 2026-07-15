import { describe, expect, it } from 'vitest'
import type { AiContext } from '../config'
import {
  buildPrDescriptionUserPrompt,
  prDescriptionFeature,
  type PrDescriptionInput,
} from './prDescription'

const context: AiContext = {
  diff: 'diff body here',
  repoName: 'demo',
  branch: 'feat/login',
  files: [{ path: 'src/a.ts', status: 'modified' }],
  baseRef: 'main',
  rangeCommits: ['feat: add login page', 'fix: handle empty password'],
}

function input(overrides: Partial<PrDescriptionInput> = {}): PrDescriptionInput {
  return { context, templateContent: null, ...overrides }
}

describe('buildPrDescriptionUserPrompt', () => {
  it('includes the repo, branch, base ref and the range commits', () => {
    const prompt = buildPrDescriptionUserPrompt(input())
    expect(prompt).toContain('Repository: demo')
    expect(prompt).toContain('Branch: feat/login → base: main')
    expect(prompt).toContain('- feat: add login page')
    expect(prompt).toContain('- fix: handle empty password')
    expect(prompt).toContain('diff body here')
  })

  it('asks for the default structure when no template is provided', () => {
    const prompt = buildPrDescriptionUserPrompt(input({ templateContent: null }))
    expect(prompt).toContain('No template is provided')
    expect(prompt).not.toContain('--- TEMPLATE ---')
  })

  it('embeds the template to fill in when one is provided', () => {
    const prompt = buildPrDescriptionUserPrompt(
      input({ templateContent: '## Summary\n\n## Checklist\n- [ ] tests' })
    )
    expect(prompt).toContain('Fill in the following pull-request template')
    expect(prompt).toContain('## Checklist')
    expect(prompt).not.toContain('No template is provided')
  })

  it('treats a whitespace-only template as no template', () => {
    const prompt = buildPrDescriptionUserPrompt(input({ templateContent: '   \n  ' }))
    expect(prompt).toContain('No template is provided')
  })

  it('truncates an oversized diff', () => {
    const prompt = buildPrDescriptionUserPrompt(
      input({ context: { ...context, diff: 'x'.repeat(20_000) } })
    )
    expect(prompt).toContain('[diff truncated, showing first 8000 chars]')
  })

  it('omits the commit list when there are no range commits', () => {
    const prompt = buildPrDescriptionUserPrompt(
      input({ context: { ...context, rangeCommits: [] } })
    )
    expect(prompt).not.toContain('Commits in this pull request')
  })
})

describe('prDescriptionFeature', () => {
  it('is a streaming feature with a bounded temperature', () => {
    expect(prDescriptionFeature.kind).toBe('streaming')
    expect(prDescriptionFeature.temperature).toBeGreaterThan(0)
    expect(prDescriptionFeature.temperature).toBeLessThanOrEqual(0.5)
  })
})
