import { describe, it, expect } from 'vitest'
import { NOTCH_TONE_RGB, toneColor, tonePriority } from './notchTones'
import type { NotchTone } from './types'

const ALL_TONES: NotchTone[] = [
  'neutral',
  'info',
  'accent',
  'success',
  'error',
  'running',
  'highlight',
]

describe('NOTCH_TONE_RGB', () => {
  it('covers every tone with a bare rgb triple (no hex, so keyframes can vary the alpha)', () => {
    for (const tone of ALL_TONES) {
      expect(NOTCH_TONE_RGB[tone]).toMatch(/^\d{1,3}, \d{1,3}, \d{1,3}$/)
    }
  })

  it('preserves the colours the PR notifications shipped with', () => {
    // Guards the migration off the per-PR-type palette: these are the exact values the previous
    // HALO_COLORS map used, so no existing notification changed colour when it moved onto a tone.
    expect(NOTCH_TONE_RGB.accent).toBe('180, 166, 245') // review_requested / review_status_changed
    expect(NOTCH_TONE_RGB.info).toBe('99, 102, 241') // new_pr / pr_queued
    expect(NOTCH_TONE_RGB.success).toBe('34, 197, 94') // ci_success
    expect(NOTCH_TONE_RGB.error).toBe('239, 68, 68') // ci_failed / pr_closed
    expect(NOTCH_TONE_RGB.highlight).toBe('168, 85, 247') // pr_merged
    expect(NOTCH_TONE_RGB.neutral).toBe('100, 116, 139') // the previous default
  })
})

describe('toneColor', () => {
  it('wraps the triple into an opaque rgb() colour', () => {
    expect(toneColor('success')).toBe('rgb(34, 197, 94)')
  })
})

describe('tonePriority', () => {
  it('puts errors above everything, whatever their kind', () => {
    expect(tonePriority('error', 'event')).toBeGreaterThan(tonePriority('running', 'progress'))
    expect(tonePriority('error', 'status')).toBeGreaterThan(tonePriority('highlight', 'event'))
  })

  it('puts a live progress card above ordinary events', () => {
    expect(tonePriority('running', 'progress')).toBeGreaterThan(tonePriority('success', 'event'))
  })

  it('treats every non-error event and status as equal', () => {
    expect(tonePriority('info', 'event')).toBe(tonePriority('success', 'status'))
  })
})
