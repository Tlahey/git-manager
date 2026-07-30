import { describe, it, expect } from 'vitest'
import type { NotificationSettings } from '@git-manager/git-types'
import {
  DEFAULT_DISPLAY_DURATION_MS,
  DISPLAY_DURATION_OPTIONS_MS,
  DISPLAY_STYLE_OPTIONS,
  resolveDisplayDurationMs,
  resolveDisplayStyle,
} from './notificationDisplay'

function settings(overrides: Partial<NotificationSettings> = {}): NotificationSettings {
  return {
    enabled: true,
    notifyOnFetch: true,
    notifyOnPull: true,
    notifyOnPush: true,
    enableSound: false,
    ...overrides,
  }
}

describe('resolveDisplayStyle', () => {
  it('defaults to the app popover — for absent settings and for a pre-existing snapshot that predates the field', () => {
    expect(resolveDisplayStyle(undefined)).toBe('popover')
    expect(resolveDisplayStyle(settings())).toBe('popover')
  })

  it('honours an explicit choice', () => {
    expect(resolveDisplayStyle(settings({ displayStyle: 'native' }))).toBe('native')
  })
})

describe('resolveDisplayDurationMs', () => {
  it('defaults when the field is absent', () => {
    expect(resolveDisplayDurationMs(undefined)).toBe(DEFAULT_DISPLAY_DURATION_MS)
    expect(resolveDisplayDurationMs(settings())).toBe(DEFAULT_DISPLAY_DURATION_MS)
  })

  it('honours an explicit duration', () => {
    expect(resolveDisplayDurationMs(settings({ displayDurationMs: 12000 }))).toBe(12000)
  })

  // `null`, not `0`: the caller arms a `setTimeout` with this, and `setTimeout(fn, 0)` would
  // dismiss the notification on the next tick — the exact opposite of "until I close it".
  it('maps "until I close it" (0) to no timer at all', () => {
    expect(resolveDisplayDurationMs(settings({ displayDurationMs: 0 }))).toBeNull()
  })

  it('treats a negative stored value as no timer rather than an instant dismiss', () => {
    expect(resolveDisplayDurationMs(settings({ displayDurationMs: -1 }))).toBeNull()
  })
})

describe('option lists', () => {
  it('offers the default duration as a pickable option, so the select is never blank', () => {
    expect(DISPLAY_DURATION_OPTIONS_MS).toContain(DEFAULT_DISPLAY_DURATION_MS)
  })

  it('covers every display style exactly once', () => {
    expect(DISPLAY_STYLE_OPTIONS.map((o) => o.value)).toEqual(['popover', 'native'])
  })
})
