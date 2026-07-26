import { describe, expect, it } from 'vitest'
import type { AiContext } from '../config'
import {
  branchExplanationFeature,
  buildBranchExplanationPrompt,
  type BranchExplanationInput,
} from './branchExplanation'

const context: AiContext = {
  diff: 'diff body here',
  repoName: 'demo',
  branch: 'feat/login',
  files: [
    { path: 'src/auth/login.ts', status: 'modified' },
    { path: 'src/auth/session.ts', status: 'added' },
  ],
  baseRef: 'origin/main',
  rangeCommits: ['feat: add login page', 'fix: handle empty password'],
}

function input(overrides: Partial<BranchExplanationInput> = {}): BranchExplanationInput {
  return { context, ...overrides }
}

describe('buildBranchExplanationPrompt', () => {
  it('names the branch and the base it is compared against', () => {
    const prompt = buildBranchExplanationPrompt(input())
    expect(prompt).toContain('Repository: demo')
    expect(prompt).toContain('Branch: feat/login (compared against origin/main)')
  })

  it('lists the branch commits and the changed files', () => {
    const prompt = buildBranchExplanationPrompt(input())
    expect(prompt).toContain('- feat: add login page')
    expect(prompt).toContain('- fix: handle empty password')
    expect(prompt).toContain('- src/auth/session.ts (added)')
  })

  it('embeds the range diff', () => {
    expect(buildBranchExplanationPrompt(input())).toContain('diff body here')
  })

  it('says so plainly when the branch has no commits of its own', () => {
    const prompt = buildBranchExplanationPrompt(
      input({ context: { ...context, rangeCommits: [] } })
    )
    expect(prompt).toContain('No commits of its own')
    expect(prompt).not.toContain('Commits on this branch')
  })

  it('omits the base clause when the context carries no base ref', () => {
    const prompt = buildBranchExplanationPrompt(
      input({ context: { ...context, baseRef: undefined } })
    )
    expect(prompt).toContain('Branch: feat/login\n')
    expect(prompt).not.toContain('compared against')
  })

  it('asks for English by default and for French when the UI language is fr', () => {
    expect(buildBranchExplanationPrompt(input())).toContain(
      'Write the entire explanation in English.'
    )
    expect(buildBranchExplanationPrompt(input({ language: 'fr' }))).toContain(
      'Write the entire explanation in French.'
    )
  })

  it('truncates an oversized range diff', () => {
    const prompt = buildBranchExplanationPrompt(
      input({ context: { ...context, diff: 'x'.repeat(20_000) } })
    )
    expect(prompt).toContain('[diff truncated, showing first 8000 chars]')
  })
})

describe('branchExplanationFeature', () => {
  it('is a streaming feature with a low, grounded temperature', () => {
    expect(branchExplanationFeature.kind).toBe('streaming')
    expect(branchExplanationFeature.temperature).toBeGreaterThan(0)
    expect(branchExplanationFeature.temperature).toBeLessThanOrEqual(0.3)
  })

  it('asks for a describe-only answer, not a review', () => {
    expect(branchExplanationFeature.instruction).toContain('Describe, do not review')
  })
})
