# `@git-manager/notch`

The notification card that lives in the MacBook's notch — the black rounded panel that slides down
from behind the menu bar, glows in the colour of whatever just happened, and gets out of the way.

Everything here is presentational and host-agnostic. Nothing imports Tauri, a Zustand store, an
i18n function or an app domain type. That is the whole reason the package exists.

```bash
pnpm --filter @git-manager/notch storybook   # port 6010
pnpm --filter @git-manager/notch test
```

## Why it is a package

It used to be two files inside `apps/desktop`, and both were untestable by construction: the card
called `getCurrentWindow().setPosition(...)`, `apiRaiseAboveMenuBar()` and `getCurrentWindow()
.close()` directly, so it could only exist inside a live Tauri webview. Looking at it meant
building the app, launching it, and provoking a real GitHub event. There were no tests, the card's
height was a hand-maintained constant with a comment asking you to keep it in sync, and the model
was hardwired to pull requests — `prNumber`, `prTitle`, `prId` were all required fields, so a card
about a git hook or a running process could not be represented at all.

## The seam

One interface. The app implements it against a `WebviewWindow`, Storybook against a positioned
`<div>` inside a fake MacBook, a test against an array of recorded calls.

```ts
interface NotchHost {
  show(): Promise<void> | void
  setY(y: number): Promise<void> | void
  close(): Promise<void> | void
  prepare?(): Promise<void> | void // native setup — raising above the menu bar, clearing the backdrop
  playSound?(): void
}
```

`useNotchPresenter` drives the whole life cycle through it: park above the resting spot → reveal →
slide down → sit (or count down) → slide up → close. Every native step is individually guarded,
because a notification that silently never appears is the worst outcome available and it has
happened before.

## The model

`NotchModel` is **serializable by contract** — no functions, no React nodes. The desktop app renders
the card in a separate webview whose content is baked into its URL, so anything that can't survive
`JSON.stringify` can't reach it. Actions are `{ id, label }` descriptors resolved through an
`onAction(id)` callback; the per-kind icon is a component prop.

Copy arrives **already translated**. The package has no i18n dependency, the same rule
`packages/components` follows.

Three kinds:

| Kind       | For                                                        |
| ---------- | ---------------------------------------------------------- |
| `event`    | something happened — fire and forget, fades on its own      |
| `progress` | something is running — a live card, updated in place        |
| `status`   | something finished — the outcome, plus the tail of its output |

and seven **tones** (`neutral` `info` `accent` `success` `error` `running` `highlight`) instead of
the old palette keyed by concrete PR event types. The consumer maps its own domain onto a tone; the
seven values are the previous eight de-duplicated, so nothing changed colour in the move.

## The queue

There is one notch, and cards can arrive together. `notchQueue.ts` is a pure reducer over
`{ current, pending }`, generic in its entry type — anything carrying a `model`. That is what lets
the desktop app queue whole *deliveries* (route, icon key, importance, banner fallback) without
restating the model's `id`/`tone`/`kind` beside them and keeping two copies in step.

Two rules do the work:

- **Coalescing by `model.id`.** Re-enqueueing the same id updates the card in place instead of
  queueing a second one — which is what makes a live `progress` card possible at all.
- **Only an error preempts.** Priority orders the *waiting list* (a live progress card outranks a
  merged-PR notice), but taking the screen from someone mid-read is a different question with a
  different answer. A failed hook earns it; a fetch that just started does not. The card an error
  displaces goes back to the head of its priority group rather than being dropped.

## Geometry

`notchGeometry.ts` owns every number, and computes the ones that used to be written down.
`measureCardHeight(model)` sums the rows the components actually render at — a row added or resized
flows straight through to the OS window's height, instead of a magic constant drifting one point
away from the truth (which is exactly what had happened).

`NOTCH_BAND_HEIGHT` is 32, `NSScreen.safeAreaInsets.top` as every notched Mac reports it. The
housing half-width is the app's working figure rather than a per-model measurement — reading
`NSScreen.auxiliaryTopLeftArea` from Rust and calibrating both is a known follow-up.

## The Storybook

The card is the one surface in the app that cannot be judged in isolation: it hides its own top 32
points behind a camera housing, sits half over a menu bar, and glows into whatever wallpaper is
behind it. So the stories render it inside `MacBookScreen`, a fake display with a real notch, a
menu bar and a tray icon, at each machine's actual point resolution — **children are positioned in
screen points**, using the same `computeNotchPlacement` the app calls.

`MacBookScreen` takes a `viewport` and crops to the top of the display. That is not cosmetic: the
card occupies the first ~180 of a display's 982 points, so a scale that fits the whole screen on a
canvas renders the notification at about a third of its real size — too small to judge the one
thing you came to look at. Cropping lets the zoom go to 1:1 while the menu bar, the housing and
enough wallpaper for the halo all stay in frame.

- **`Notch/Playground`** — the story to open. One screen, one button per kind of card. Each press
  enqueues a real model, the real queue decides whether it shows now or waits, and the real
  presenter animates it. Selectors for display, wallpaper, zoom and auto-dismiss; a live view of
  the queue and an event log. Sending two cards close together is the behaviour that has no other
  way of being observed.
- `Notch/Comparisons` — the two questions that need cards side by side: every display (including a
  notchless one, the degradation case) and every tone against the busy wallpaper.
