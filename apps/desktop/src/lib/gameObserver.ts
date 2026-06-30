export type GameEvent =
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

export type GameListener = (event: GameEvent, payload?: any) => void

class GameObserver {
  private listeners: Set<GameListener> = new Set()

  subscribe(listener: GameListener) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  notify(event: GameEvent, payload?: any) {
    this.listeners.forEach((listener) => {
      try {
        listener(event, payload)
      } catch (err) {
        console.error('Error in game observer listener:', err)
      }
    })
  }
}

export const gameObserver = new GameObserver()
