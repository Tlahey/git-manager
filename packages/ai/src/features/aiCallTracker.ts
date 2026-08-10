import { COMPLETION_CANCELLED } from './completionCancelled'
import { newAiRequestId } from '../requestId'

/** Cancels one in-flight call by the id it was dispatched under. Supplied by the caller, because
 * reaching the backend is the host's business and this package holds no transport. */
export type CancelCall = (requestId: string) => void | Promise<void>

/**
 * Keeps track of the AI calls a run currently has in flight, so stopping the run can stop them.
 *
 * ## Why every call needs an id of its own
 *
 * The backend's generation registry (`state.rs`) keys one cancel flag per id, **replaces** the entry
 * when an id is registered twice, and **removes** it when a call finishes. So a run that dispatched
 * several calls under one shared id would be worse than one with no ids at all: only the last
 * registration would be cancellable, and the first call to finish would unregister the flag for
 * every sibling still running. Hence one id per call, minted here and released when the call
 * settles.
 *
 * Ids are derived from a run id rather than drawn independently, so a stray one in a log says which
 * run it belonged to. Uniqueness still comes from the run id itself (see {@link newAiRequestId}),
 * not from the counter.
 *
 * ## What cancelling does and does not guarantee
 *
 * {@link cancelAll} is fire-and-forget: it names every id currently outstanding and does not wait.
 * The backend polls its flag every 50 ms and drops the provider request, so the call rejects with
 * the {@link COMPLETION_CANCELLED} marker shortly after — the caller's job is to recognise that
 * rejection as a stop rather than a failure. A call that finished between the last dispatch and the
 * cancel is simply an unknown id on the backend, which is a documented no-op there.
 */
export class AiCallTracker {
  private readonly inFlight = new Set<string>()
  private counter = 0
  private stopped = false

  constructor(
    private readonly cancelCall: CancelCall | undefined,
    private readonly runId: string = newAiRequestId()
  ) {}

  /**
   * Runs `call` under a fresh request id, tracked until it settles.
   *
   * **A stopped tracker dispatches nothing.** Without that, a stop observed in the gap between two
   * calls would cancel an empty set and then let the next call go out — and the callers with an
   * inner sequential loop (`scanCommits` reads one commit file by file) would carry on through
   * every remaining file of that commit, which is precisely the wait the user asked to end. The
   * refusal is reported as a cancellation so it takes the same path as an aborted call.
   *
   * The id is released in a `finally`, including on the rejection a cancellation itself produces:
   * an id left behind would be cancelled again by a later {@link cancelAll}, which on the backend
   * would either hit nothing or — after a re-registration of the same id, which cannot happen here
   * precisely because ids are never reused — stop the wrong call.
   */
  async track<T>(call: (requestId: string) => Promise<T>): Promise<T> {
    if (this.stopped) throw new Error(COMPLETION_CANCELLED)
    const requestId = `${this.runId}-${this.counter++}`
    this.inFlight.add(requestId)
    try {
      return await call(requestId)
    } finally {
      this.inFlight.delete(requestId)
    }
  }

  /**
   * Asks the backend to stop every call this run currently has open.
   *
   * Synchronous on purpose: it is called from a poll that must not await anything, and the useful
   * work (raising a flag the backend reads) happens on the other side of the IPC anyway. A rejected
   * cancel is swallowed — failing to cancel a call that may already be over is not something the
   * user can act on, and surfacing it would replace a stopped run with an error dialog.
   */
  cancelAll(): void {
    // Set even with no canceller: refusing to dispatch anything further is the half of stopping
    // that needs no host support, and a run with no `cancelCall` should still stop growing.
    this.stopped = true
    if (!this.cancelCall) return
    for (const requestId of this.inFlight) {
      void Promise.resolve(this.cancelCall(requestId)).catch(() => {})
    }
  }

  /** How many calls are outstanding. Test-facing. */
  get openCount(): number {
    return this.inFlight.size
  }
}
