import { describe, it, expect } from 'vitest'
import { i18next } from '@git-manager/i18n'
import {
  authorInitials,
  NOTIFICATION_TONES,
  notchModelFromNotification,
  notchRequestFromNotification,
} from './notchModel'
import type { AppNotification } from '../../stores/notification.store'

// The setup file initialises i18n in English, so this is the real copy the user reads.
const t = i18next.getFixedT('en', 'common')

function notification(overrides: Partial<AppNotification> = {}): AppNotification {
  return {
    id: 1,
    type: 'pr_merged',
    repo: 'git-manager',
    fullName: 'Tlahey/git-manager',
    prNumber: 231,
    prTitle: 'feat(notch): extract the notification card',
    prId: 'pr-231',
    author: 'Tlahey',
    authorAvatar: 'https://avatars.githubusercontent.com/u/1?v=4',
    url: 'https://github.com/Tlahey/git-manager/pull/231',
    createdAt: Date.now(),
    read: false,
    targetTab: 'prs',
    ...overrides,
  }
}

describe('NOTIFICATION_TONES', () => {
  it('maps every notification type onto a tone', () => {
    const types: AppNotification['type'][] = [
      'pr_merged',
      'pr_closed',
      'pr_queued',
      'review_requested',
      'review_status_changed',
      'new_pr',
      'ci_success',
      'ci_failed',
    ]
    for (const type of types) expect(NOTIFICATION_TONES[type]).toBeDefined()
  })

  it('keeps the colours each type had before tones existed', () => {
    // The halo palette used to be keyed by these very types; the mapping is what preserves it.
    expect(NOTIFICATION_TONES.pr_merged).toBe('highlight') // purple
    expect(NOTIFICATION_TONES.ci_failed).toBe('error') // red
    expect(NOTIFICATION_TONES.pr_closed).toBe('error')
    expect(NOTIFICATION_TONES.review_requested).toBe('accent') // lavender
    expect(NOTIFICATION_TONES.new_pr).toBe('info') // indigo
    expect(NOTIFICATION_TONES.pr_queued).toBe('info')
    expect(NOTIFICATION_TONES.ci_success).toBe('success') // green
  })
})

describe('authorInitials', () => {
  it('takes the first two letters, uppercased', () => {
    expect(authorInitials('Tlahey')).toBe('TL')
  })

  it('strips punctuation, so a bot name still reads as initials', () => {
    expect(authorInitials('github-actions')).toBe('GI')
  })

  it('falls back to a question mark rather than an empty circle', () => {
    expect(authorInitials('---')).toBe('?')
  })
})

describe('notchModelFromNotification', () => {
  it('produces an event card carrying the real translated copy', () => {
    const model = notchModelFromNotification(notification(), t)
    expect(model.kind).toBe('event')
    // The eyebrow is the notification's own title, translated — not a raw key.
    expect(model.eyebrow).not.toContain('notifications.types')
    expect(model.eyebrow.length).toBeGreaterThan(0)
    expect(model.title).toBe('feat(notch): extract the notification card')
    expect(model.subtitle).toBe('@Tlahey')
    expect(model.badge).toBe('#231')
  })

  it('prefers the owner/repo form for the context line', () => {
    expect(notchModelFromNotification(notification(), t).context).toBe('Tlahey/git-manager')
  })

  it('falls back to the bare repo name for a notification stored before fullName existed', () => {
    const model = notchModelFromNotification(notification({ fullName: undefined }), t)
    expect(model.context).toBe('git-manager')
  })

  it('is a serialisable value — it has to survive a trip through a URL', () => {
    // The card is rendered in a separate webview whose content is baked into its URL, so a model
    // holding a function or a React node simply would not arrive.
    const model = notchModelFromNotification(notification(), t)
    expect(JSON.parse(JSON.stringify(model))).toEqual(model)
  })

  it('gives the avatar initials to fall back on when the URL is missing or broken', () => {
    const model = notchModelFromNotification(notification({ authorAvatar: undefined }), t)
    expect(model.avatar?.src).toBeUndefined()
    expect(model.avatar?.fallback).toBe('TL')
  })

  it('offers the GitHub action only when there is somewhere to go', () => {
    const withUrl = notchModelFromNotification(notification(), t)
    expect(withUrl.actions?.map((a) => a.id)).toEqual(['activate', 'open-external'])

    const withoutUrl = notchModelFromNotification(notification({ url: undefined }), t)
    expect(withoutUrl.actions?.map((a) => a.id)).toEqual(['activate'])
  })

  it('gives two notifications about the same PR and event the same id, so they coalesce', () => {
    const first = notchModelFromNotification(notification(), t)
    const second = notchModelFromNotification(notification({ id: 2 }), t)
    expect(second.id).toBe(first.id)
  })

  it('gives different events on one PR different ids, so neither is swallowed', () => {
    const merged = notchModelFromNotification(notification({ type: 'pr_merged' }), t)
    const ci = notchModelFromNotification(notification({ type: 'ci_failed' }), t)
    expect(ci.id).not.toBe(merged.id)
  })
})

describe('notchRequestFromNotification', () => {
  it('marks every bell notification as key, so choosing the banner loses none of them', () => {
    // The `ambient` half of the scale is for the cards this app doesn't produce yet — progress,
    // background tasks. Nothing the user explicitly asked to hear about is filtered by the surface.
    expect(notchRequestFromNotification(notification(), t).importance).toBe('key')
  })

  it('carries a banner to fall back to, so the notch failing never loses the notification', () => {
    const fallback = notchRequestFromNotification(notification(), t).nativeFallback
    expect(fallback?.title).toContain('🎉')
    expect(fallback?.route).toMatchObject({ kind: 'pull-request', prNumber: 231 })
  })

  it('carries the route the activate action follows', () => {
    const payload = notchRequestFromNotification(notification(), t)
    expect(payload.route).toMatchObject({
      kind: 'pull-request',
      prNumber: 231,
      fullName: 'Tlahey/git-manager',
      targetTab: 'prs',
    })
  })

  it('carries the icon key and the external URL', () => {
    const payload = notchRequestFromNotification(notification(), t)
    expect(payload.iconId).toBe('pr_merged')
    expect(payload.externalUrl).toBe('https://github.com/Tlahey/git-manager/pull/231')
  })

  it('omits the external URL when the notification has none', () => {
    const payload = notchRequestFromNotification(notification({ url: undefined }), t)
    expect(payload.externalUrl).toBeUndefined()
  })
})
