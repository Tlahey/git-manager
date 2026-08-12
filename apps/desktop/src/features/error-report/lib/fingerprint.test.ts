import { describe, it, expect } from 'vitest'
import { fingerprintError, fingerprintMarker, normalizeMessage } from './fingerprint'

describe('normalizeMessage', () => {
  it('strips the values two reports of one bug never share', () => {
    expect(normalizeMessage("cannot find branch 'feature/a'")).toBe(
      normalizeMessage("cannot find branch 'release/b'")
    )
  })

  it('strips shas, counts and uuids', () => {
    expect(normalizeMessage('commit a1b2c3d not found after 12 tries')).toBe(
      normalizeMessage('commit ff00aa11 not found after 3 tries')
    )
  })

  it('collapses a multi-line message so a newline cannot fork the id', () => {
    expect(normalizeMessage('failed\n  badly')).toBe('failed badly')
  })

  it('keeps two genuinely different messages apart', () => {
    expect(normalizeMessage('cannot lock ref')).not.toBe(normalizeMessage('cannot push ref'))
  })
})

describe('fingerprintError', () => {
  it('is stable across the volatile parts of one failure', () => {
    const a = fingerprintError({
      code: 'GIT_ERROR',
      message: "cannot lock ref 'refs/heads/feature-1'",
      origin: 'git_push',
    })
    const b = fingerprintError({
      code: 'GIT_ERROR',
      message: "cannot lock ref 'refs/heads/other-9'",
      origin: 'git_push',
    })
    expect(a).toBe(b)
  })

  it('separates the same message raised by different commands', () => {
    const push = fingerprintError({ code: 'GIT_ERROR', message: 'boom', origin: 'git_push' })
    const pull = fingerprintError({ code: 'GIT_ERROR', message: 'boom', origin: 'git_pull' })
    expect(push).not.toBe(pull)
  })

  it('separates the same message under different codes', () => {
    expect(fingerprintError({ code: 'IO_ERROR', message: 'boom' })).not.toBe(
      fingerprintError({ code: 'UNKNOWN', message: 'boom' })
    )
  })

  it('is eight hex characters', () => {
    expect(fingerprintError({ message: 'anything' })).toMatch(/^[0-9a-f]{8}$/)
  })
})

describe('fingerprintMarker', () => {
  it('is the searchable string written into an issue body', () => {
    expect(fingerprintMarker('a1b2c3d4')).toBe('gm-fp:a1b2c3d4')
  })
})
