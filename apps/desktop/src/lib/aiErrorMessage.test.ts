import { describe, it, expect, vi } from 'vitest'
import { aiErrorMessage } from './aiErrorMessage'

/** Stands in for the caller's `t` bound to the `errors` namespace. */
const translate = (key: string) => `translated:${key}`

describe('aiErrorMessage', () => {
  it('maps a provider sentinel to its errors-namespace key', () => {
    const raw = JSON.stringify({
      code: 'AI_PROVIDER_ERROR',
      message: 'AI provider error: AI_MODEL_NOT_FOUND',
      detail: null,
    })
    expect(aiErrorMessage(raw, translate)).toBe('translated:errors.AI_MODEL_NOT_FOUND')
  })

  it.each(['AI_PROVIDER_NOT_RUNNING', 'AI_EMPTY_RESPONSE'])(
    'recognizes the %s sentinel even as a bare string',
    (code) => {
      expect(aiErrorMessage(code, translate)).toBe(`translated:errors.${code}`)
    }
  )

  it("falls back to the payload's own message for an unmapped code", () => {
    const raw = JSON.stringify({ code: 'HTTP_ERROR', message: 'HTTP 401 Unauthorized', detail: null })
    expect(aiErrorMessage(raw, translate)).toBe('HTTP 401 Unauthorized')
  })

  it('appends the payload detail when there is one', () => {
    const raw = JSON.stringify({ code: 'HTTP_ERROR', message: 'HTTP 500', detail: 'upstream down' })
    expect(aiErrorMessage(raw, translate)).toBe('HTTP 500 — upstream down')
  })

  it('passes a plain, non-JSON rejection straight through', () => {
    expect(aiErrorMessage('  socket hang up  ', translate)).toBe('socket hang up')
  })

  it('never swallows the clue into generic copy', () => {
    const spy = vi.fn(translate)
    expect(aiErrorMessage('{"code":"UNKNOWN"}', spy)).toBe('{"code":"UNKNOWN"}')
    // No sentinel matched, and the payload carried no message — the raw string is all there is,
    // and it beats a generic "an error occurred" the user can do nothing with.
    expect(spy).not.toHaveBeenCalled()
  })
})
