import { describe, expect, it } from 'vitest'
import {
  buildChangeExplanationPrompt,
  changeExplanationFeature,
  type ChangeExplanationInput,
} from './changeExplanation'

function input(overrides: Partial<ChangeExplanationInput> = {}): ChangeExplanationInput {
  return {
    repoName: 'demo',
    file: {
      path: 'src/auth/login.ts',
      status: 'modified',
      patch: '@@ -1,2 +1,3 @@\n ctx\n-old line\n+new line',
      additions: 1,
      deletions: 1,
    },
    fileContent: 'export function login() {}',
    ...overrides,
  }
}

describe('buildChangeExplanationPrompt', () => {
  it('includes the repo, the file identity and its change volume', () => {
    const prompt = buildChangeExplanationPrompt(input())
    expect(prompt).toContain('Repository: demo')
    expect(prompt).toContain('File: src/auth/login.ts (modified, +1/-1)')
  })

  it('embeds the patch to explain', () => {
    const prompt = buildChangeExplanationPrompt(input())
    expect(prompt).toContain('--- PATCH ---')
    expect(prompt).toContain('+new line')
  })

  it('embeds the file content as the context the change is read against', () => {
    const prompt = buildChangeExplanationPrompt(input())
    expect(prompt).toContain('--- CURRENT FILE CONTENT (context for the change) ---')
    expect(prompt).toContain('export function login() {}')
  })

  it('states the content is unavailable rather than staying silent about it', () => {
    const prompt = buildChangeExplanationPrompt(input({ fileContent: undefined }))
    expect(prompt).not.toContain('--- CURRENT FILE CONTENT')
    expect(prompt).toContain("The file's content is not available")
  })

  it('treats whitespace-only content as no content', () => {
    const prompt = buildChangeExplanationPrompt(input({ fileContent: '  \n  ' }))
    expect(prompt).toContain("The file's content is not available")
  })

  it('asks for English by default and for French when the UI language is fr', () => {
    expect(buildChangeExplanationPrompt(input())).toContain(
      'Write the entire explanation in English.'
    )
    expect(buildChangeExplanationPrompt(input({ language: 'fr' }))).toContain(
      'Write the entire explanation in French.'
    )
  })

  it('truncates an oversized patch and an oversized file content independently', () => {
    const prompt = buildChangeExplanationPrompt(
      input({
        file: { ...input().file, patch: 'x'.repeat(20_000) },
        fileContent: 'y'.repeat(20_000),
      })
    )
    expect(prompt).toContain('[patch truncated, showing first 8000 chars]')
    expect(prompt).toContain('[file truncated, showing first 8000 chars]')
  })
})

describe('changeExplanationFeature', () => {
  it('is a streaming feature with a low, grounded temperature', () => {
    expect(changeExplanationFeature.kind).toBe('streaming')
    expect(changeExplanationFeature.temperature).toBeGreaterThan(0)
    expect(changeExplanationFeature.temperature).toBeLessThanOrEqual(0.3)
  })

  it('builds its prompt from the input', () => {
    expect(changeExplanationFeature.buildPrompt(input())).toContain('src/auth/login.ts')
  })
})
