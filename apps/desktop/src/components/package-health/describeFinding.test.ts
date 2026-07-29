import { describe, it, expect } from 'vitest'
import { i18next } from '@git-manager/i18n'
import type { HealthFinding } from '@git-manager/git-types'
import { describeFinding } from './describeFinding'

/** The real English copy, so a wrong or blank key fails here rather than in the UI. */
const t = (key: string, options?: Record<string, unknown>) =>
  i18next.t(key, { ns: 'git', ...options }) as string

function finding(overrides: Partial<HealthFinding> = {}): HealthFinding {
  return {
    severity: 'warning',
    dependency: 'react',
    refs: [],
    actual: null,
    expected: null,
    ...overrides,
  }
}

describe('describeFinding', () => {
  it('lists the disagreeing ranges for a misalignment', () => {
    const line = describeFinding('versionAlignment', finding({ actual: '^18.2.0, ^18.3.1' }), t)
    expect(line).toBe('Ranges: ^18.2.0, ^18.3.1')
  })

  it('names the declared range for a dependency that is not installed', () => {
    const line = describeFinding('missingInstall', finding({ expected: '^2.0.0' }), t)
    expect(line).toBe('Not installed (declared ^2.0.0)')
  })

  it('contrasts installed against declared for a range mismatch', () => {
    const line = describeFinding(
      'rangeMismatch',
      finding({ actual: '2.9.0', expected: '^3.0.0' }),
      t
    )
    expect(line).toBe('Installed 2.9.0, declared ^3.0.0')
  })

  it('tells a missing packageManager field from a mismatched one', () => {
    const missing = describeFinding(
      'packageManagerField',
      finding({ dependency: null, expected: 'pnpm' }),
      t
    )
    expect(missing).toBe('No packageManager field — the lockfile says pnpm')

    const mismatched = describeFinding(
      'packageManagerField',
      finding({ dependency: null, actual: 'npm@10.0.0', expected: 'pnpm' }),
      t
    )
    expect(mismatched).toBe('Declares npm@10.0.0 but the lockfile says pnpm')
  })

  /**
   * The fix is `catalog:` whatever the versions are, so the line says that rather
   * than contrasting two ranges — which read as a no-op when they were identical.
   */
  it('tells catalog drift what to write, not just what differs', () => {
    const line = describeFinding(
      'catalogDrift',
      finding({ actual: '^3.0.7', expected: '^3.0.7' }),
      t
    )
    expect(line).toBe('Declares ^3.0.7 — replace it with "catalog:" (the catalog pins ^3.0.7)')
  })

  it('still contrasts actual against expected for the workspace protocol', () => {
    expect(
      describeFinding(
        'workspaceProtocol',
        finding({ actual: '^1.0.0', expected: 'workspace:*' }),
        t
      )
    ).toBe('^1.0.0 → expected workspace:*')
  })

  it('says nothing for a duplicate, whose two refs already tell the story', () => {
    expect(describeFinding('duplicateDependency', finding(), t)).toBe('')
  })
})
