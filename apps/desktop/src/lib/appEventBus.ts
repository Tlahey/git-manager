/**
 * App-wide pub/sub event bus. Originally gamification-only (hence event names like `stage`/
 * `commit`); kept as a single, un-typed-payload bus rather than one channel per concern because
 * the only two subscribers today (achievements in `stores/game.store.ts`, and the notification
 * badge in `app/pull-requests/PullRequestsPage.tsx`) both want the same simple "this git action
 * happened" signal. Add new `AppEvent` members here if/when another subscriber needs one —
 * don't add speculative events nothing listens to yet.
 */
export type AppEvent =
  | 'commit'
  | 'stage'
  | 'unstage'
  | 'discard'
  | 'fixup'
  | 'autosquash'
  | 'open_app'
  | 'view_waiting_reviews'
  | 'terminal_command'
  | 'pr_closed_or_merged'

export type AppEventListener = (event: AppEvent, payload?: any) => void

class AppEventBus {
  private listeners: Set<AppEventListener> = new Set()

  subscribe(listener: AppEventListener) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  notify(event: AppEvent, payload?: any) {
    this.listeners.forEach((listener) => {
      try {
        listener(event, payload)
      } catch (err) {
        console.error('Error in app event bus listener:', err)
      }
    })
  }
}

export const appEventBus = new AppEventBus()
