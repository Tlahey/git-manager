import { describe, it, expect } from 'vitest'
import { EVENT_TOGGLES } from './notificationEvents.config'
import { NOTIFICATION_TYPES } from '../../../lib/notifications/notificationRegistry'

describe('EVENT_TOGGLES', () => {
  it('lists each settings key once', () => {
    const keys = EVENT_TOGGLES.map((t) => t.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('scopes an event under its own key, so the filter narrows exactly what its checkbox gates', () => {
    for (const toggle of EVENT_TOGGLES) {
      if (toggle.scopeKey) expect(toggle.scopeKey).toBe(toggle.key)
    }
  })

  // The row is the only way to reach a scope, so a type the watcher filters on and no row offers
  // would be a setting the user cannot change — and the reverse would be a control that does
  // nothing. This is the check that keeps the two lists in step.
  it('offers a filter for exactly the notification types that have one', () => {
    const offered = new Set(EVENT_TOGGLES.flatMap((t) => (t.scopeKey ? [t.scopeKey] : [])))
    const filtered = new Set(NOTIFICATION_TYPES.flatMap((d) => (d.scopeKey ? [d.scopeKey] : [])))
    expect([...offered].sort()).toEqual([...filtered].sort())
  })

  it('offers no filter on the local git events, which have no PR to belong to', () => {
    const local = ['notifyOnFetch', 'notifyOnPull', 'notifyOnPush', 'notifyOnTerminalFinished']
    for (const key of local) {
      expect(EVENT_TOGGLES.find((t) => t.key === key)?.scopeKey).toBeUndefined()
    }
  })

  // A review is never requested on your own PR: "mine only" there would silence the event.
  it('offers no filter on review requests', () => {
    expect(EVENT_TOGGLES.find((t) => t.key === 'notifyOnReviewRequested')?.scopeKey).toBeUndefined()
  })
})
