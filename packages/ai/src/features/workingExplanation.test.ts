import { describe, expect, it } from 'vitest'
import type { AiContext } from '../config'
import {
  buildWorkingExplanationPrompt,
  workingExplanationFeature,
  type WorkingExplanationInput,
} from './workingExplanation'

const context: AiContext = {
  diff: 'working diff body',
  repoName: 'demo',
  branch: 'feat/login',
  files: [
    { path: 'src/auth/login.ts', status: 'modified' },
    { path: 'src/auth/scratch.ts', status: 'untracked' },
  ],
}

function input(overrides: Partial<WorkingExplanationInput> = {}): WorkingExplanationInput {
  return { context, ...overrides }
}

describe('buildWorkingExplanationPrompt', () => {
  it('names the repo and the branch the work sits on', () => {
    expect(buildWorkingExplanationPrompt(input())).toContain('Repository: demo (branch: feat/login)')
  })

  it('lists the uncommitted files with their statuses', () => {
    const prompt = buildWorkingExplanationPrompt(input())
    expect(prompt).toContain('- src/auth/login.ts (modified)')
    // The untracked status is what tells the model this file is brand new.
    expect(prompt).toContain('- src/auth/scratch.ts (untracked)')
  })

  it('embeds the working diff', () => {
    const prompt = buildWorkingExplanationPrompt(input())
    expect(prompt).toContain('--- DIFF (working tree vs HEAD) ---')
    expect(prompt).toContain('working diff body')
  })

  it('omits the file list when there is none', () => {
    const prompt = buildWorkingExplanationPrompt(input({ context: { ...context, files: [] } }))
    expect(prompt).not.toContain('Uncommitted files:')
  })

  it('asks for English by default and French when the UI language is fr', () => {
    expect(buildWorkingExplanationPrompt(input())).toContain('Write the entire summary in English.')
    expect(buildWorkingExplanationPrompt(input({ language: 'fr' }))).toContain(
      'Write the entire summary in French.'
    )
  })

  it('truncates an oversized diff', () => {
    const prompt = buildWorkingExplanationPrompt(
      input({ context: { ...context, diff: 'x'.repeat(20_000) } })
    )
    expect(prompt).toContain('[diff truncated, showing first 8000 chars]')
  })
})

describe('workingExplanationFeature', () => {
  it('is a streaming feature with a low, grounded temperature', () => {
    expect(workingExplanationFeature.kind).toBe('streaming')
    expect(workingExplanationFeature.temperature).toBeLessThanOrEqual(0.3)
  })

  it('asks for the work to be separated rather than merged into one story', () => {
    expect(workingExplanationFeature.instruction).toContain('Separating them')
  })
})
