import { describe, it, expect } from 'vitest'
import type { NotificationSettings } from '@git-manager/git-types'
import { CONFETTI_TOTAL_MS, type NotchModel } from '@git-manager/notch'
import {
  DEFAULT_DISPLAY_DURATION_MS,
  DISPLAY_DURATION_OPTIONS_MS,
  DISPLAY_STYLE_OPTIONS,
  migrateDisplayStyle,
  resolveDisplayDurationMs,
  resolveDisplayStyle,
  resolveNotchDurationMs,
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

  // Pinned to the number rather than the constant: this one is a product decision, not an
  // implementation detail. A card can carry the tail of a failed hook's output, and the five
  // seconds this used to be is not long enough to notice it, read it and take it in.
  it('gives a card ten seconds by default', () => {
    expect(DEFAULT_DISPLAY_DURATION_MS).toBe(10000)
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

describe('resolveNotchDurationMs', () => {
  const event: NotchModel = {
    kind: 'event',
    id: 'e',
    tone: 'info',
    eyebrow: 'MERGED',
    title: 'a PR',
  }
  const progress: NotchModel = {
    kind: 'progress',
    id: 'p',
    tone: 'running',
    eyebrow: 'CLONING',
    title: 'objects',
  }
  const reward: NotchModel = {
    kind: 'reward',
    id: 'r',
    tone: 'highlight',
    eyebrow: 'ACHIEVEMENT UNLOCKED',
    title: 'Merge Master',
    tier: 'gold',
  }

  it('gives an ordinary card exactly what the user picked', () => {
    expect(resolveNotchDurationMs(event, settings({ displayDurationMs: 5000 }))).toBe(5000)
  })

  it('never times a live card out, whatever the setting says', () => {
    // A clone at 40 % that vanishes after five seconds takes away the only thing tracking the
    // operation. It ends when its producer says so.
    expect(resolveNotchDurationMs(progress, settings({ displayDurationMs: 3000 }))).toBeNull()
  })

  it('keeps a reward card up until its confetti has landed', () => {
    // The floor does not bite at today's settings — it is written down so that adding a shorter
    // option cannot silently truncate an animation that lives in another package.
    expect(resolveNotchDurationMs(reward, settings({ displayDurationMs: 1000 }))).toBe(
      CONFETTI_TOTAL_MS
    )
  })

  it('does not stretch a reward card the user asked to keep longer', () => {
    expect(resolveNotchDurationMs(reward, settings({ displayDurationMs: 12000 }))).toBe(12000)
  })

  it('outlasts the burst at every duration actually on offer', () => {
    for (const ms of DISPLAY_DURATION_OPTIONS_MS.filter((value) => value > 0)) {
      expect(resolveNotchDurationMs(reward, settings({ displayDurationMs: ms }))).toBeGreaterThan(
        CONFETTI_TOTAL_MS - 1
      )
    }
  })

  it('still means "until I close it" for a reward', () => {
    expect(resolveNotchDurationMs(reward, settings({ displayDurationMs: 0 }))).toBeNull()
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
