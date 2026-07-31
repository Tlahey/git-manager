# Spec — Background auto-fetch

**Status:** live specification, kept in sync with the code.

**Code:** [`hooks/useAutoFetch.ts`](../../apps/desktop/src/hooks/useAutoFetch.ts), mounted once in
[`App.tsx`](../../apps/desktop/src/App.tsx). Its notch presence is a separate producer,
[`components/notch/NotchRemoteOperations.tsx`](../../apps/desktop/src/components/notch/NotchRemoteOperations.tsx),
fed by [`stores/remoteProgress.store.ts`](../../apps/desktop/src/stores/remoteProgress.store.ts).

---

## Behaviour

The **active repository** is fetched in the background every
`settings.git.autoFetchIntervalMinutes` minutes — default **1**, `0` disables it, capped at 60 by
the Settings input (**Settings → General → Fetch**) — **including while the app window doesn't have
focus**.

- _Interval_: the graph, the ahead/behind badges and the remote branch labels go stale silently
  otherwise. There is no push notification from the remote; polling is the only signal.
- _Unattended on purpose_: the notch is what makes a background fetch worth running at all — it can
  surface what changed without anyone looking. An earlier version of this hook paused the moment the
  window lost focus (`useWindowFocus`), which defeated exactly that: the one time a background fetch
  is most useful is when nobody is watching it happen. It no longer reads focus at all.

## Design decisions worth not undoing

**Timestamp-based schedule, not `setInterval`.** The hook remembers _when_ it last fetched and
schedules the next run at `lastFetchAt + interval`. This still matters without the focus gate: an
unrelated dependency changing (the active repository, the interval setting) tears the effect down
and rebuilds it, and the timestamp is what keeps that rebuild from restarting the countdown from
scratch.

That timestamp is global rather than per-repository: switching tabs fetches the newly active repo on
the next tick (within one interval) instead of instantly, which is what keeps tab-hopping from firing
a burst of fetches.

**Completely silent about failure, at two layers.** The hook itself swallows every error — offline,
missing credentials, a deleted remote — same as before; the manual **Fetch** button
(`useActionToolbar.handleFetch`) is the one that reports success and failure. On top of that,
`NotchRemoteOperations.tsx` deliberately does not raise a notch card or a native banner for a
`background`-marked fetch's _error_ outcome either (a success still gets through — see below) — now
that the schedule keeps running unattended for as long as the app is open, an offline evening must
not become a stream of error cards for a transfer nobody asked for.

**Marked `background` for the notch, but not muted entirely.** Every call passes
`{ background: true }` to `apiFetchRemote`. `NotchRemoteOperations.tsx` reads that flag to suppress
the _live_ progress card (a bar ticking on a timer, unattended, would light the notch up on every
tick) and, per the point above, the _error_ outcome — but a **successful** background fetch that
actually moved a ref still reaches the notch. Suppressing the wait and the failure is not
suppressing the news; branches having moved is the one thing an unattended fetch has to report.

**No undo/redo side effects.** The manual fetch clears the redo stack; the automatic one must not —
a background task silently eating redoable work every minute is a data-loss bug, not a refresh.

**Invalidates `branches` and `git-log`, not `git-status`.** A fetch only moves remote refs. The
working tree is untouched, and `useGitStatus` already polls it on its own.

**One in-flight fetch at a time.** A remote slower than the interval must not stack requests on the
same repository (`inFlightRef`).

## Tests

[`useAutoFetch.test.ts`](../../apps/desktop/src/hooks/useAutoFetch.test.ts) covers the interval, the
`0`-disables case, running unattended while unfocused, the silent-failure path and unmount cleanup.
[`NotchRemoteOperations.test.tsx`](../../apps/desktop/src/components/notch/NotchRemoteOperations.test.tsx)
covers the notch side: no live card for a `background` transfer, a background success still
producing an outcome card, and a background error producing none.
