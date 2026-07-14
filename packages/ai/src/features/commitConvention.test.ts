import { describe, expect, it } from 'vitest'
import type { CommitConvention } from '../config'
import {
  buildConventionSection,
  buildRecentCommitsSection,
  buildUserInstructionsSection,
  compilePattern,
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
    expect(validateCommitSubject('JIRA-12: do a thing', { pattern: '^[A-Z]+-\\d+: .+' }).valid).toBe(
      true
    )
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
