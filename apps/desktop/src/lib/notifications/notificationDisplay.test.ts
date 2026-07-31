import { describe, it, expect } from 'vitest'
import type { NotificationSettings } from '@git-manager/git-types'
import {
  DEFAULT_DISPLAY_DURATION_MS,
  DISPLAY_DURATION_OPTIONS_MS,
  DISPLAY_STYLE_OPTIONS,
  migrateDisplayStyle,
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

describe('migrateDisplayStyle', () => {
  it('maps the old "popover" spelling onto the notch', () => {
    // settings.store deep-merges what it rehydrates, so this string keeps arriving from old
    // localStorage snapshots long after the union stopped containing it.
    expect(migrateDisplayStyle('popover')).toBe('notch')
  })

  it('passes current values through', () => {
    expect(migrateDisplayStyle('notch')).toBe('notch')
    expect(migrateDisplayStyle('native')).toBe('native')
  })

  it('rejects anything it does not recognise instead of guessing', () => {
    expect(migrateDisplayStyle('banner')).toBeUndefined()
    expect(migrateDisplayStyle(undefined)).toBeUndefined()
  })
})

describe('resolveDisplayStyle', () => {
  it('defaults to the notch — for absent settings and for a snapshot that predates the field', () => {
    expect(resolveDisplayStyle(undefined)).toBe('notch')
    expect(resolveDisplayStyle(settings())).toBe('notch')
  })

  it('honours an explicit choice', () => {
    expect(resolveDisplayStyle(settings({ displayStyle: 'native' }))).toBe('native')
  })

  it('keeps a user who chose the popover on the notch, not on the banner', () => {
    // The failure this guards: an unmapped legacy value falls through to the default *or* to
    // `native`, silently turning the app's own surface off for every existing user.
    const stored = { ...settings(), displayStyle: 'popover' } as unknown as NotificationSettings
    expect(resolveDisplayStyle(stored)).toBe('notch')
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
    expect(DISPLAY_STYLE_OPTIONS.map((o) => o.value)).toEqual(['notch', 'native'])
  })

  it('gives each style a description, since the choice changes what gets raised at all', () => {
    for (const option of DISPLAY_STYLE_OPTIONS) {
      expect(option.descKey).toBeTruthy()
    }
  })
})
