import { describe, expect, it } from 'vitest'
import type { CommitConvention } from '../config'
import {
  buildConventionSection,
  buildRecentCommitsSection,
  buildUserInstructionsSection,
  compilePattern,
  DEFAULT_HEADER_MAX_LENGTH,
  inferHeaderMaxLength,
  isConventionalHistory,
  parseCommitlintRules,
  validateCommitSubject,
} from './commitConvention'

const conventionalHistory = [
  'feat(ui): add button',
  'fix: correct off-by-one',
  'chore: bump deps',
  'refactor(api): split module',
]

const freeformHistory = [
  'Add login page',
  'Fix the crash on startup',
  'Update dependencies',
  'Improve error handling',
]

const jsonConfig: CommitConvention = {
  source: '.commitlintrc.json',
  content: JSON.stringify({
    rules: {
      'type-enum': [2, 'always', ['feat', 'fix', 'chore']],
      'header-max-length': [2, 'always', 50],
    },
  }),
}

describe('parseCommitlintRules', () => {
  it('extracts type-enum and header-max-length from a JSON config', () => {
    expect(parseCommitlintRules(jsonConfig.content)).toEqual({
      types: ['feat', 'fix', 'chore'],
      headerMaxLength: 50,
    })
  })

  it('returns {} for a non-JSON (e.g. JS) config without throwing', () => {
    expect(parseCommitlintRules('module.exports = { rules: {} }')).toEqual({})
  })
})

describe('buildConventionSection', () => {
  it('is empty when there is no convention', () => {
    expect(buildConventionSection(undefined)).toBe('')
    expect(buildConventionSection(null)).toBe('')
  })

  it('embeds the source and raw content when present', () => {
    const section = buildConventionSection(jsonConfig)
    expect(section).toContain('.commitlintrc.json')
    expect(section).toContain('header-max-length')
    expect(section).toContain('OVERRIDES')
  })
})

describe('buildRecentCommitsSection', () => {
  it('is empty when there is no history', () => {
    expect(buildRecentCommitsSection(undefined)).toBe('')
    expect(buildRecentCommitsSection([])).toBe('')
  })

  it('lists the recent subjects as the style to imitate', () => {
    const section = buildRecentCommitsSection(freeformHistory)
    expect(section).toContain('- Add login page')
    expect(section).toContain('take precedence')
  })
})

describe('isConventionalHistory', () => {
  it('is true for a clear conventional majority', () => {
    expect(isConventionalHistory(conventionalHistory)).toBe(true)
  })

  it('is false for free-form history', () => {
    expect(isConventionalHistory(freeformHistory)).toBe(false)
  })

  it('is false for too small a sample', () => {
    expect(isConventionalHistory(['feat: a', 'fix: b'])).toBe(false)
    expect(isConventionalHistory(undefined)).toBe(false)
  })
})

describe('buildUserInstructionsSection', () => {
  it('is empty when neither instructions nor pattern are set', () => {
    expect(buildUserInstructionsSection('', '')).toBe('')
    expect(buildUserInstructionsSection(undefined, null)).toBe('')
  })

  it('embeds the user instructions and pattern as highest-priority requirements', () => {
    const section = buildUserInstructionsSection('Prefix with ticket id', '^[A-Z]+-\\d+: .+')
    expect(section).toContain('HIGHEST priority')
    expect(section).toContain('Prefix with ticket id')
    expect(section).toContain('^[A-Z]+-\\d+: .+')
  })
})

describe('compilePattern', () => {
  it('compiles a valid regex', () => {
    expect(compilePattern('^feat: ')).toBeInstanceOf(RegExp)
  })

  it('returns null for empty or invalid patterns', () => {
    expect(compilePattern('')).toBeNull()
    expect(compilePattern('   ')).toBeNull()
    expect(compilePattern('(')).toBeNull()
  })
})

describe('validateCommitSubject — user pattern', () => {
  it('accepts a subject matching the user pattern', () => {
    expect(
      validateCommitSubject('JIRA-12: do a thing', { pattern: '^[A-Z]+-\\d+: .+' }).valid
    ).toBe(true)
  })

  it('flags a subject that does not match the user pattern', () => {
    const result = validateCommitSubject('do a thing', { pattern: '^[A-Z]+-\\d+: .+' })
    expect(result.valid).toBe(false)
    expect(result.problems[0].code).toBe('pattern')
  })

  it('the user pattern overrides conventional inference from history', () => {
    // History is conventional, but the user pattern is free-form: a matching non-conventional
    // subject is valid, and conventional format is NOT additionally required.
    const ctx = { pattern: '^Ticket #\\d+ - .+', recentCommits: conventionalHistory }
    expect(validateCommitSubject('Ticket #42 - fix login', ctx).valid).toBe(true)
  })

  it('ignores an invalid user pattern (falls back to adaptive rules)', () => {
    // Invalid regex → no pattern check; free-form context → nothing enforced → valid.
    expect(validateCommitSubject('anything at all', { pattern: '(' }).valid).toBe(true)
  })
})

describe('validateCommitSubject — adaptive', () => {
  it('enforces nothing (any subject is valid) when there is no convention and no history', () => {
    expect(validateCommitSubject('added a button').valid).toBe(true)
    expect(validateCommitSubject('feat: whatever').valid).toBe(true)
  })

  it('enforces nothing for a free-form project (history not conventional)', () => {
    expect(validateCommitSubject('added a button', { recentCommits: freeformHistory }).valid).toBe(
      true
    )
  })

  it('enforces conventional format when the history is conventional', () => {
    const ctx = { recentCommits: conventionalHistory }
    expect(validateCommitSubject('feat(ui): add button', ctx).valid).toBe(true)
    const bad = validateCommitSubject('added a button', ctx)
    expect(bad.valid).toBe(false)
    expect(bad.problems[0].code).toBe('format')
  })

  it('enforces commitlint rules when present, regardless of history', () => {
    const withType = validateCommitSubject('style: reformat', { convention: jsonConfig })
    expect(withType.problems.some((p) => p.code === 'type')).toBe(true)
    const long = validateCommitSubject(`feat: ${'x'.repeat(60)}`, { convention: jsonConfig })
    expect(long.problems.some((p) => p.code === 'length')).toBe(true)
  })

  it('commitlint config takes precedence over conventional history for the length limit', () => {
    // jsonConfig caps at 50; a 60-char subject is flagged even though history is conventional.
    const result = validateCommitSubject(`feat: ${'x'.repeat(60)}`, {
      convention: jsonConfig,
      recentCommits: conventionalHistory,
    })
    expect(result.problems.some((p) => p.code === 'length')).toBe(true)
  })

  it('validates only the first line (subject), ignoring the body', () => {
    const ctx = { recentCommits: conventionalHistory }
    expect(
      validateCommitSubject('fix: patch\n\nA long body line that exceeds limits...', ctx).valid
    ).toBe(true)
  })
})

describe('inferHeaderMaxLength', () => {
  /** `count` conventional subjects, the first `long` of them over the 72-char default. */
  function history(count: number, long: number, longLength = 95): string[] {
    return Array.from({ length: count }, (_, i) =>
      i < long ? `feat(ai): ${'x'.repeat(longLength - 10)}` : `feat(ai): short one ${i}`
    )
  }

  it('falls back to the conventional default without enough history to judge', () => {
    expect(inferHeaderMaxLength()).toBe(DEFAULT_HEADER_MAX_LENGTH)
    expect(inferHeaderMaxLength([])).toBe(DEFAULT_HEADER_MAX_LENGTH)
    expect(inferHeaderMaxLength(history(4, 4))).toBe(DEFAULT_HEADER_MAX_LENGTH)
  })

  it('holds a project that keeps its subjects short to the default', () => {
    expect(inferHeaderMaxLength(history(10, 0))).toBe(DEFAULT_HEADER_MAX_LENGTH)
  })

  it('treats one long subject as an outlier, not as permission', () => {
    expect(inferHeaderMaxLength(history(10, 1))).toBe(DEFAULT_HEADER_MAX_LENGTH)
  })

  it("reads a habit of long subjects as the project's real bar", () => {
    // git-manager's own case: no commitlint config, unmistakably conventional subjects, and a third
    // of them past 72. Holding the model to 72 there flags every message of ordinary length.
    expect(inferHeaderMaxLength(history(10, 3))).toBe(95)
  })

  it('never tightens below the default, however short the history runs', () => {
    expect(inferHeaderMaxLength(Array(10).fill('fix: tiny'))).toBe(DEFAULT_HEADER_MAX_LENGTH)
  })
})

describe('validateCommitSubject — length follows the project', () => {
  const longHistory = [
    'feat(ai): verify the served context window, enforce the output reserve, rewrite commit messages',
    'feat(ai): rework provider settings around Ollama + a generic OpenAI-compatible entry',
    'fix(graph): stop a WIP connector from grafting a dotted start onto a merge link',
    'refactor(ai): size the commit explanation against the model, not a constant',
    'fix(ai): size every prompt to the window, and isolate concurrent runs',
    'feat(ai): review a diff with an LLM, before committing or opening a PR',
  ]

  it('accepts a 78-char subject in a project whose own subjects run that long', () => {
    // The reported bug: this exact warning fired on a message the project's own history would have
    // passed without comment.
    const subject = `refactor(ai): ${'x'.repeat(64)}`
    expect(subject).toHaveLength(78)
    expect(validateCommitSubject(subject, { recentCommits: longHistory }).valid).toBe(true)
  })

  it('still enforces the default on a project that keeps its subjects short', () => {
    const shortHistory = ['feat: one', 'fix: two', 'chore: three', 'refactor: four', 'docs: five']
    const subject = `refactor(ai): ${'x'.repeat(64)}`
    const problems = validateCommitSubject(subject, { recentCommits: shortHistory }).problems
    expect(problems.map((p) => p.code)).toContain('length')
  })

  it('lets an explicit commitlint limit override what the history does', () => {
    const convention: CommitConvention = {
      source: '.commitlintrc.json',
      content: JSON.stringify({ rules: { 'header-max-length': [2, 'always', 50] } }),
    }
    const subject = `refactor(ai): ${'x'.repeat(64)}`
    const problems = validateCommitSubject(subject, {
      convention,
      recentCommits: longHistory,
    }).problems
    expect(problems.map((p) => p.code)).toContain('length')
  })
})

describe('buildRecentCommitsSection — states the ceiling', () => {
  it('tells the model the same number the validator will judge it by', () => {
    const longHistory = Array.from({ length: 10 }, (_, i) =>
      i < 3 ? `feat(ai): ${'x'.repeat(85)}` : `feat(ai): short ${i}`
    )
    const section = buildRecentCommitsSection(longHistory)
    expect(section).toContain(`MUST NOT exceed ${inferHeaderMaxLength(longHistory)} characters`)
  })

  it('states the conventional default for a project with short subjects', () => {
    const section = buildRecentCommitsSection([
      'feat: a',
      'fix: b',
      'chore: c',
      'docs: d',
      'test: e',
    ])
    expect(section).toContain(`MUST NOT exceed ${DEFAULT_HEADER_MAX_LENGTH} characters`)
  })
})
