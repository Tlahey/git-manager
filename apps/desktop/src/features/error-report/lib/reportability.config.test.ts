import { describe, it, expect } from 'vitest'
import { classifyError } from './reportability.config'

describe('classifyError', () => {
  it('treats a UI crash as a bug whatever code is passed', () => {
    expect(classifyError(undefined, 'crash').verdict).toBe('bug')
    expect(classifyError('PROTECTED_BRANCH', 'crash').verdict).toBe('bug')
  })

  it('does not treat a refusal by design as a defect', () => {
    expect(classifyError('PROTECTED_BRANCH', 'operation').verdict).toBe('expected')
    expect(classifyError('HOOK_FAILED', 'operation').verdict).toBe('expected')
    expect(classifyError('BOARD_CONFLICT', 'operation').verdict).toBe('expected')
  })

  it('does not treat the environment failing as a defect', () => {
    expect(classifyError('AI_PROVIDER_ERROR', 'operation').verdict).toBe('expected')
    expect(classifyError('AI_TIMEOUT', 'operation').verdict).toBe('expected')
    expect(classifyError('HTTP_ERROR', 'operation').verdict).toBe('expected')
    expect(classifyError('REPO_NOT_FOUND', 'operation').verdict).toBe('expected')
  })

  it('leaves GIT_ERROR unclear — it wraps both defects and git refusing something', () => {
    expect(classifyError('GIT_ERROR', 'operation').verdict).toBe('unclear')
  })

  it('reports an unrecognised code, so a new AppError variant is never silently unreportable', () => {
    const { verdict, reasonKey } = classifyError('SOME_NEW_VARIANT', 'operation')
    expect(verdict).toBe('bug')
    expect(reasonKey).toBe('report.reason.unclassified')
  })

  it('reports an operation that failed with no code at all', () => {
    expect(classifyError(undefined, 'operation').verdict).toBe('bug')
  })

  it('gives every verdict a reason key the dialog can translate', () => {
    for (const code of ['PROTECTED_BRANCH', 'GIT_ERROR', 'UNKNOWN', 'WHATEVER']) {
      expect(classifyError(code, 'operation').reasonKey).toMatch(/^report\.reason\./)
    }
  })
})
