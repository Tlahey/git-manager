import { describe, it, expect } from 'vitest'
import { i18next } from '@git-manager/i18n'
import {
  hookFailureFrom,
  hookFailureNotchModel,
  hookNameFrom,
  runningHookNotchModel,
} from './hookNotch'
import type { AppErrorLike } from '../tauri'

const t = i18next.getFixedT('en', 'git')

/** An error shaped the way `toReadableError` produces one from an `AppError` payload. */
function appError(code: string, message: string, detail?: string): AppErrorLike {
  const error = new Error(message) as AppErrorLike
  error.code = code
  if (detail !== undefined) error.detail = detail
  return error
}

describe('hookNameFrom', () => {
  it('reads the hook out of the message Rust produced', () => {
    expect(hookNameFrom('The pre-commit hook stopped the operation')).toBe('pre-commit')
    expect(hookNameFrom('The commit-msg hook stopped the operation')).toBe('commit-msg')
  })

  it('falls back rather than throwing on a message it does not recognise', () => {
    // The message is a contract between two files in this repo, not something git produces — but a
    // card with a slightly wrong eyebrow beats no card at all.
    expect(hookNameFrom('something else entirely')).toBe('git')
    expect(hookNameFrom('')).toBe('git')
  })
})

describe('hookFailureFrom', () => {
  it('keys off the error code, not the copy', () => {
    // The code is the stable half of the payload; matching on the message would break the moment
    // the wording changed.
    const failure = hookFailureFrom(
      appError('HOOK_FAILED', 'The pre-commit hook stopped the operation', 'boom')
    )
    expect(failure).toEqual({ name: 'pre-commit', lines: ['boom'] })
  })

  it('ignores every other kind of failure', () => {
    expect(hookFailureFrom(appError('GIT_ERROR', 'could not open the repository'))).toBeNull()
    expect(hookFailureFrom(new Error('plain'))).toBeNull()
    expect(hookFailureFrom('not an error at all')).toBeNull()
    expect(hookFailureFrom(null)).toBeNull()
  })

  it('keeps the last lines, where the reason is', () => {
    const failure = hookFailureFrom(
      appError('HOOK_FAILED', 'The pre-commit hook stopped the operation', 'a\nb\nc\nd\ne')
    )
    expect(failure?.lines).toEqual(['c', 'd', 'e'])
  })

  it('drops the padding hooks print generously', () => {
    const failure = hookFailureFrom(
      appError('HOOK_FAILED', 'The pre-commit hook stopped the operation', '\n  \nboom\n\n')
    )
    expect(failure?.lines).toEqual(['boom'])
  })

  it('survives a hook that said nothing', () => {
    const failure = hookFailureFrom(
      appError('HOOK_FAILED', 'The pre-push hook stopped the operation')
    )
    expect(failure).toEqual({ name: 'pre-push', lines: [] })
  })
})

describe('hookFailureNotchModel', () => {
  it('is an error card naming the hook and the repository', () => {
    const model = hookFailureNotchModel(
      { name: 'pre-commit', lines: ['✖ lint-staged failed'] },
      'git-manager',
      t
    )
    expect(model.kind).toBe('status')
    expect(model.tone).toBe('error')
    expect(model.eyebrow).toBe('pre-commit hook')
    expect(model.context).toBe('git-manager')
    expect(model.title).toMatch(/nothing was committed/i)
  })

  it('carries the output, which is the part worth reading', () => {
    const model = hookFailureNotchModel({ name: 'pre-commit', lines: ['✖ boom'] }, 'repo', t)
    expect(model.outputLines).toEqual(['✖ boom'])
  })

  it('omits the output block entirely for a silent hook', () => {
    const model = hookFailureNotchModel({ name: 'pre-commit', lines: [] }, 'repo', t)
    expect(model.outputLines).toBeUndefined()
  })

  it('gives two repositories their own card', () => {
    const a = hookFailureNotchModel({ name: 'pre-commit', lines: [] }, 'repo-a', t)
    const b = hookFailureNotchModel({ name: 'pre-commit', lines: [] }, 'repo-b', t)
    expect(a.id).not.toBe(b.id)
  })

  it('offers a way back into the app', () => {
    const model = hookFailureNotchModel({ name: 'pre-commit', lines: [] }, 'repo', t)
    expect(model.actions?.map((a) => a.id)).toEqual(['activate'])
  })
})

describe('runningHookNotchModel', () => {
  it('names the hook and the repository, in real copy', () => {
    const model = runningHookNotchModel('pre-commit', 'git-manager', t)
    expect(model.eyebrow).toBe('pre-commit hook')
    expect(model.context).toBe('git-manager')
    expect(model.title).toBe('Running — this can take a moment')
  })

  // `progress` is doing real work here, not describing a bar. It is what stops the presenter
  // arming a dismissal timer — a card that vanished while the hook was still going would be worse
  // than none — and what stops the delivery policy flattening it into an OS banner.
  it('is a live card with no ratio, since a hook reports no progress of its own', () => {
    const model = runningHookNotchModel('pre-commit', 'repo', t)
    expect(model.kind).toBe('progress')
    expect(model.tone).toBe('running')
    expect(model).not.toHaveProperty('ratio')
  })

  it('gives two repositories, and two hooks, their own card', () => {
    const a = runningHookNotchModel('pre-commit', 'repo-a', t)
    const b = runningHookNotchModel('pre-commit', 'repo-b', t)
    const c = runningHookNotchModel('commit-msg', 'repo-a', t)
    expect(new Set([a.id, b.id, c.id]).size).toBe(3)
  })
})
