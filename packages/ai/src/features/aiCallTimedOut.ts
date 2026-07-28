/**
 * Thrown by a host when the provider ran past the configured request budget.
 *
 * Lives in this package so `scanCommits` can classify it, but is never *raised* here: recognising a
 * timeout means reading the host's own error payload, which this package deliberately knows nothing
 * about. The host translates, the package carries the taxonomy — the same division `AiTransport`
 * already uses.
 *
 * It exists because a timeout is the one provider failure with an obvious fix (raise the budget, or
 * pick a faster model), and because it is otherwise invisible: an HTTP layer reports a read timeout
 * that fires mid-body as "error decoding response body", which reads like a malformed answer.
 */
export class AiCallTimedOut extends Error {
  constructor() {
    super('The provider did not answer within the configured timeout')
    this.name = 'AiCallTimedOut'
  }
}
