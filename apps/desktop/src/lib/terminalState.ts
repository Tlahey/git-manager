/**
 * What a terminal session looks like right now, as one of three answers.
 *
 * There are four situations and only three of them differ on screen, which is the point worth
 * stating: a session that has never run anything and one whose result the user has already seen are
 * the *same* state — nothing to report — and both are grey. `done` is the transient in between:
 * a command has finished and nobody has looked yet, so the chip goes blue until they do.
 *
 * `busy` wins over `done` when both could apply — a session that has started running again is
 * running, whatever it did a minute ago.
 */
export type TerminalSessionState = 'idle' | 'busy' | 'done'

export function terminalSessionState(busy: boolean, finished: boolean): TerminalSessionState {
  if (busy) return 'busy'
  return finished ? 'done' : 'idle'
}
