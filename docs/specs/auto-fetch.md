# Spec — Background auto-fetch

**Status:** live specification, kept in sync with the code.

**Code:** [`hooks/useAutoFetch.ts`](../../apps/desktop/src/hooks/useAutoFetch.ts),
[`hooks/useWindowFocus.ts`](../../apps/desktop/src/hooks/useWindowFocus.ts), mounted once in
[`App.tsx`](../../apps/desktop/src/App.tsx).

---

## Behaviour

The **active repository** is fetched in the background every
`settings.git.autoFetchIntervalMinutes` minutes — default **1**, `0` disables it, capped at 60 by
the Settings input (**Settings → General → Fetch**) — **and only while the app window has focus**.

The two conditions are equally load-bearing:

- _Interval_: the graph, the ahead/behind badges and the remote branch labels go stale silently
  otherwise. There is no push notification from the remote; polling is the only signal.
- _Focus_: an app left open for a week in the background must not keep hitting the remote, and a
  refresh nobody is looking at buys nothing. Focus is read from the webview's own `focus`/`blur`
  and `visibilitychange` events (`useWindowFocus`), not from Tauri's `onFocusChanged` — they mirror
  the native window's state, need no async setup, and work unchanged under test.

## Design decisions worth not undoing

**Timestamp-based schedule, not `setInterval`.** The hook remembers _when_ it last fetched and
schedules the next run at `lastFetchAt + interval`. A plain interval, re-armed by the effect on every
focus change, would starve completely for a user who alt-tabs more often than once a minute — and it
would fetch a full interval late every time they came back. As a side effect, returning to the app
after a long absence fetches immediately, which is the moment a refresh is most wanted.

That timestamp is global rather than per-repository: switching tabs fetches the newly active repo on
the next tick (within one interval) instead of instantly, which is what keeps tab-hopping from firing
a burst of fetches.

**Completely silent.** No toast on success, and every error is swallowed — offline, missing
credentials, a deleted remote. This runs unattended every minute; surfacing failures would turn a
flaky network into a stream of notifications. The manual **Fetch** button
(`useActionToolbar.handleFetch`) is the one that reports success and failure.

**No undo/redo side effects.** The manual fetch clears the redo stack; the automatic one must not —
a background task silently eating redoable work every minute is a data-loss bug, not a refresh.

**Invalidates `branches` and `git-log`, not `git-status`.** A fetch only moves remote refs. The
working tree is untouched, and `useGitStatus` already polls it on its own.

**One in-flight fetch at a time.** A remote slower than the interval must not stack requests on the
same repository (`inFlightRef`).

## Tests

[`useAutoFetch.test.ts`](../../apps/desktop/src/hooks/useAutoFetch.test.ts) and
[`useWindowFocus.test.ts`](../../apps/desktop/src/hooks/useWindowFocus.test.ts) cover the interval,
the `0`-disables case, the focus gate, the catch-up fetch on regaining focus, the silent-failure
path and unmount cleanup.
