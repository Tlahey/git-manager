import { describe, expect, it } from 'vitest'
import { COMPLETION_CANCELLED, isCompletionCancelled } from './completionCancelled'

describe('isCompletionCancelled', () => {
  it('recognises the marker inside the host’s unwrapped error', () => {
    // What actually arrives: `AppError::AiProvider` renders as "AI provider error: <payload>", and
    // the app's invoke wrapper turns the JSON blob into an Error carrying that message.
    expect(isCompletionCancelled(new Error(`AI provider error: ${COMPLETION_CANCELLED}`))).toBe(
      true
    )
  })

  it('recognises it on a raw string rejection too', () => {
    expect(
      isCompletionCancelled(`{"code":"AI_PROVIDER_ERROR","message":"${COMPLETION_CANCELLED}"}`)
    ).toBe(true)
  })

  it('does not mistake a provider failure for a stop', () => {
    // The distinction is load-bearing: a stop must not be recorded as a file or commit that could
    // not be read, and a real failure must not vanish as if the user had asked for it.
    expect(isCompletionCancelled(new Error('AI request timed out after 30s'))).toBe(false)
    expect(isCompletionCancelled(new Error('connection refused'))).toBe(false)
    expect(isCompletionCancelled(undefined)).toBe(false)
  })
})
