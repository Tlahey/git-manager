import { describe, it, expect } from 'vitest'
import {
  buildCommitSearchAnswerPrompt,
  commitSearchAnswerFeature,
  COMMIT_SEARCH_ANSWER_INSTRUCTION,
  renderFindings,
  type CommitSearchAnswerInput,
  type CommitSearchFinding,
} from './commitSearchAnswer'

const finding: CommitSearchFinding = {
  shortOid: 'abc1234',
  subject: 'feat(ui): add a loading state to Button',
  date: '2026-07-14',
  author: 'Ada',
  finding: 'Adds a loading state and removes the spinner prop.',
  files: ['packages/ui/src/Button.tsx'],
}

const input: CommitSearchAnswerInput = {
  question: 'Has the Button component changed recently?',
  repoName: 'git-manager',
  branch: 'main',
  window: 'the last 30 days',
  findings: [finding],
  scanned: 42,
  truncated: false,
}

describe('renderFindings', () => {
  it('renders each commit with its date, author and finding', () => {
    const rendered = renderFindings([finding], 10_000)
    expect(rendered).toContain('`abc1234` (2026-07-14, Ada)')
    expect(rendered).toContain('Adds a loading state and removes the spinner prop.')
    expect(rendered).toContain('files: packages/ui/src/Button.tsx')
  })

  it('drops the file lists before it drops a commit', () => {
    // A commit missing here is a commit the answer never mentions — the exact outcome reading
    // history commit-by-commit exists to prevent. Paths are the expendable part.
    const many = Array.from({ length: 30 }, (_, i) => ({
      ...finding,
      shortOid: `sha${i}`,
      files: ['a/very/long/path/that/costs/characters.tsx'],
    }))
    const rendered = renderFindings(many, 2_000)
    expect(rendered).not.toContain('files:')
    for (const f of many) expect(rendered).toContain(f.shortOid)
  })
})

describe('buildCommitSearchAnswerPrompt', () => {
  it('states the question, the window and how much was read', () => {
    const prompt = buildCommitSearchAnswerPrompt(input)
    expect(prompt).toContain('Has the Button component changed recently?')
    expect(prompt).toContain('42 commit(s), the last 30 days')
    expect(prompt).toContain('git-manager')
  })

  it('says plainly when nothing was found, rather than sending an empty list', () => {
    const prompt = buildCommitSearchAnswerPrompt({ ...input, findings: [] })
    expect(prompt).toContain('No commit in what was read bears on the question')
  })

  it('warns the model when only part of the window was read', () => {
    const prompt = buildCommitSearchAnswerPrompt({ ...input, truncated: true })
    expect(prompt).toMatch(/only the most recent ones were/i)
  })

  it('names the language the answer must be written in', () => {
    expect(buildCommitSearchAnswerPrompt({ ...input, language: 'fr' })).toContain('French')
  })
})

describe('COMMIT_SEARCH_ANSWER_INSTRUCTION', () => {
  it('requires a negative answer to state what was actually searched', () => {
    // "No, that never changed" from a partial read is a wrong answer, not a partial one.
    expect(COMMIT_SEARCH_ANSWER_INSTRUCTION).toMatch(/not in what was read/i)
  })

  it('requires every found commit to appear, with its sha', () => {
    expect(COMMIT_SEARCH_ANSWER_INSTRUCTION).toMatch(/every commit that was found must appear/i)
    expect(COMMIT_SEARCH_ANSWER_INSTRUCTION).toContain('<short sha>')
  })
})

describe('commitSearchAnswerFeature', () => {
  it('streams, because the user has already waited through the whole scan', () => {
    expect(commitSearchAnswerFeature.kind).toBe('streaming')
  })
})
