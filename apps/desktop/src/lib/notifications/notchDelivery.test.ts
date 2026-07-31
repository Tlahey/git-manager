import { describe, it, expect } from 'vitest'
import type { NotificationSettings } from '@git-manager/git-types'
import type { NotchModel } from '@git-manager/notch'
import {
  isEligibleForNativeBanner,
  nativeSpecFor,
  nativeSpecFromModel,
  resolveNotchFallbackSurface,
  resolveNotificationSurface,
  type NotchImportance,
  type NotchRequest,
} from './notchDelivery'

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

const models: Record<NotchModel['kind'], NotchModel> = {
  event: { kind: 'event', id: 'e', tone: 'info', eyebrow: 'MERGED', title: 'a PR' },
  progress: { kind: 'progress', id: 'p', tone: 'running', eyebrow: 'CLONING', title: 'objects' },
  status: { kind: 'status', id: 's', tone: 'error', eyebrow: 'PRE-COMMIT', title: 'failed' },
}

function request(kind: NotchModel['kind'], importance: NotchImportance = 'key'): NotchRequest {
  return { model: models[kind], importance }
}

describe('isEligibleForNativeBanner', () => {
  it('rejects a progress card, which a banner cannot express', () => {
    // A banner is written once. A live card delivered as one would either freeze at its first
    // value or emit a banner per tick — forty of them for a single clone.
    expect(isEligibleForNativeBanner(request('progress'))).toBe(false)
  })

  it('rejects an ambient card, which is not worth an entry in Notification Centre', () => {
    expect(isEligibleForNativeBanner(request('event', 'ambient'))).toBe(false)
    expect(isEligibleForNativeBanner(request('status', 'ambient'))).toBe(false)
  })

  it('accepts a key event', () => {
    expect(isEligibleForNativeBanner(request('event'))).toBe(true)
  })

  it('accepts a key status — a failed hook is a finished, discrete fact', () => {
    expect(isEligibleForNativeBanner(request('status'))).toBe(true)
  })

  it('rejects an ambient progress card on both counts', () => {
    expect(isEligibleForNativeBanner(request('progress', 'ambient'))).toBe(false)
  })
})

describe('resolveNotificationSurface', () => {
  it('raises nothing at all when notifications are switched off', () => {
    expect(resolveNotificationSurface(request('event'), settings({ enabled: false }))).toBe('none')
  })

  it('sends everything to the notch when the notch is the chosen surface', () => {
    for (const kind of ['event', 'progress', 'status'] as const) {
      for (const importance of ['key', 'ambient'] as const) {
        expect(resolveNotificationSurface(request(kind, importance), settings())).toBe('notch')
      }
    }
  })

  it('defaults to the notch when the user has never chosen', () => {
    expect(resolveNotificationSurface(request('progress'), undefined)).toBe('notch')
  })

  it('still uses the notch for a user whose stored value is the old "popover" spelling', () => {
    const stored = { ...settings(), displayStyle: 'popover' } as unknown as NotificationSettings
    expect(resolveNotificationSurface(request('event'), stored)).toBe('notch')
  })

  it('shows fewer notifications on the banner: key events only', () => {
    // This is the point of the setting. Choosing the macOS banner is not just choosing where the
    // same notifications appear — it turns the live and ambient ones off.
    const native = settings({ displayStyle: 'native' })
    expect(resolveNotificationSurface(request('event'), native)).toBe('native')
    expect(resolveNotificationSurface(request('status'), native)).toBe('native')
    expect(resolveNotificationSurface(request('progress'), native)).toBe('none')
    expect(resolveNotificationSurface(request('event', 'ambient'), native)).toBe('none')
  })
})

describe('nativeSpecFromModel', () => {
  it('derives a banner from the card itself', () => {
    const spec = nativeSpecFromModel(models.status)
    expect(spec.title).toBe('PRE-COMMIT')
    expect(spec.body).toContain('failed')
  })

  it('routes to "just bring the app forward" — there is no page for these', () => {
    // A finished search, a rejected push: the user was already somewhere, and coming back to it is
    // the whole of what clicking meant.
    expect(nativeSpecFromModel(models.event).route).toEqual({ kind: 'app' })
  })

  it('folds the context into the body when there is one', () => {
    const spec = nativeSpecFromModel({ ...models.event, context: 'git-manager' })
    expect(spec.body).toBe('a PR — git-manager')
  })
})

describe('nativeSpecFor', () => {
  it('prefers the banner the producer wrote', () => {
    // The PR notifications have a real translated sentence and a real route; a derived spec would
    // be a downgrade.
    const own = { title: '🎉 Merged', body: 'nice', route: { kind: 'rewards' as const } }
    expect(nativeSpecFor({ ...request('event'), nativeFallback: own })).toBe(own)
  })

  it('falls back to a derived one rather than to nothing', () => {
    // What this exists to prevent: a `key` card whose producer never supplied a banner is silently
    // dropped for a user who chose the macOS banner.
    expect(nativeSpecFor(request('status')).route).toEqual({ kind: 'app' })
  })
})

describe('resolveNotchFallbackSurface', () => {
  it('rescues a key notification when the card could not be shown', () => {
    expect(resolveNotchFallbackSurface(request('event'))).toBe('native')
  })

  it('drops what a banner could not have carried anyway', () => {
    // The fallback exists so a key notification is never lost — not so that everything the notch
    // would have shown gets dumped into Notification Centre the one time a window failed.
    expect(resolveNotchFallbackSurface(request('progress'))).toBe('none')
    expect(resolveNotchFallbackSurface(request('status', 'ambient'))).toBe('none')
  })

  it('agrees with the explicit native choice, so the two paths cannot drift', () => {
    const native = settings({ displayStyle: 'native' })
    for (const kind of ['event', 'progress', 'status'] as const) {
      for (const importance of ['key', 'ambient'] as const) {
        const req = request(kind, importance)
        expect(resolveNotchFallbackSurface(req)).toBe(
          resolveNotificationSurface(req, native) === 'native' ? 'native' : 'none'
        )
      }
    }
  })
})
