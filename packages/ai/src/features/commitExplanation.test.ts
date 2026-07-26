import { describe, expect, it } from 'vitest'
import {
  buildCommitExplanationPrompt,
  commitExplanationFeature,
  type CommitExplanationInput,
} from './commitExplanation'

function input(overrides: Partial<CommitExplanationInput> = {}): CommitExplanationInput {
  return {
    repoName: 'demo',
    commit: {
      shortOid: 'abc1234',
      subject: 'feat: add login page',
      body: '',
      author: 'Ada',
      filesChanged: 3,
      insertions: 40,
      deletions: 2,
      isMerge: false,
    },
    patch: '@@ -1 +1 @@\n-old\n+new',
    ...overrides,
  }
}

describe('buildCommitExplanationPrompt', () => {
  it('names the commit, its author and its change volume', () => {
    const prompt = buildCommitExplanationPrompt(input())
    expect(prompt).toContain('Repository: demo')
    expect(prompt).toContain('Commit: abc1234 by Ada (3 files, +40/-2)')
  })

  it('includes the commit message so the model can go beyond it', () => {
    const prompt = buildCommitExplanationPrompt(input())
    expect(prompt).toContain('--- COMMIT MESSAGE ---')
    expect(prompt).toContain('feat: add login page')
  })

  it('appends the body when there is one', () => {
    const prompt = buildCommitExplanationPrompt(
      input({ commit: { ...input().commit, body: 'Closes #12.\nAlso tidies the form.' } })
    )
    expect(prompt).toContain('Closes #12.')
    expect(prompt).toContain('Also tidies the form.')
  })

  it('omits an empty or whitespace-only body cleanly', () => {
    const prompt = buildCommitExplanationPrompt(
      input({ commit: { ...input().commit, body: '   \n ' } })
    )
    expect(prompt).toContain('feat: add login page\n--- END COMMIT MESSAGE ---')
  })

  it('embeds the patch', () => {
    const prompt = buildCommitExplanationPrompt(input())
    expect(prompt).toContain('--- DIFF ---')
    expect(prompt).toContain('+new')
  })

  it('warns the model that a merge diff is first-parent only', () => {
    const prompt = buildCommitExplanationPrompt(
      input({ commit: { ...input().commit, isMerge: true } })
    )
    expect(prompt).toContain('MERGE commit')
    expect(prompt).toContain('first parent only')
  })

  it('says nothing about merges for an ordinary commit', () => {
    expect(buildCommitExplanationPrompt(input())).not.toContain('MERGE commit')
  })

  it('asks for English by default and French when the UI language is fr', () => {
    expect(buildCommitExplanationPrompt(input())).toContain(
      'Write the entire explanation in English.'
    )
    expect(buildCommitExplanationPrompt(input({ language: 'fr' }))).toContain(
      'Write the entire explanation in French.'
    )
  })

  it('truncates an oversized patch', () => {
    const prompt = buildCommitExplanationPrompt(input({ patch: 'x'.repeat(20_000) }))
    expect(prompt).toContain('[diff truncated, showing first 8000 chars]')
  })
})

describe('commitExplanationFeature', () => {
  it('is a streaming feature with a low, grounded temperature', () => {
    expect(commitExplanationFeature.kind).toBe('streaming')
    expect(commitExplanationFeature.temperature).toBeLessThanOrEqual(0.3)
  })

  it('forbids paraphrasing the commit message back', () => {
    expect(commitExplanationFeature.instruction).toContain('Do NOT paraphrase it back')
  })
})
