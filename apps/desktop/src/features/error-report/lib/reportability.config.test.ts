import { describe, it, expect } from 'vitest'
import { classifyError } from './reportability.config'

/**
 * Every `code` string `AppError` can emit, per `From<AppError> for String` in
 * `apps/desktop/src-tauri/src/error.rs`. Keep this list in sync with that match arm — adding an
 * `AppError` variant there without adding it here (and to `CLASSIFICATION`) is exactly the gap
 * this test exists to catch (see the exhaustiveness test below).
 */
const APP_ERROR_CODES = [
  'GIT_ERROR',
  'IO_ERROR',
  'REPO_NOT_FOUND',
  'BRANCH_NOT_FOUND',
  'BRANCH_CHECKED_OUT_ELSEWHERE',
  'COMMIT_NOT_FOUND',
  'PROTECTED_BRANCH',
  'TAG_ALREADY_EXISTS',
  'WORKTREE_PATH_EXISTS',
  'CONFLICT_NOT_FOUND',
  'UNPARSEABLE_CONFLICT',
  'BOARD_NOT_FOUND',
  'BOARD_ALREADY_EXISTS',
  'CARD_NOT_FOUND',
  'COMMENT_NOT_FOUND',
  'BOARD_CONFLICT',
  'AI_PROVIDER_ERROR',
  'AI_TIMEOUT',
  'INVALID_INPUT',
  'HTTP_ERROR',
  'NOTIFICATION_FAILED',
  'HOOK_FAILED',
  'UNKNOWN',
] as const

describe('classifyError', () => {
  it('has an explicit classification for every AppError code error.rs can emit', () => {
    const unclassified = APP_ERROR_CODES.filter(
      (code) => classifyError(code, 'operation').reasonKey === 'report.reason.unclassified'
    )
    expect(unclassified).toEqual([])
  })

  it('does not treat checking out a branch held by another worktree as a defect', () => {
    expect(classifyError('BRANCH_CHECKED_OUT_ELSEWHERE', 'operation').verdict).toBe('expected')
  })

  it('leaves a missing comment unclear, like the other not-found refs', () => {
    expect(classifyError('COMMENT_NOT_FOUND', 'operation').verdict).toBe('unclear')
  })

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
