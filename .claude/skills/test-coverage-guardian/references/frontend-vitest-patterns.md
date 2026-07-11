# Frontend Vitest gotchas (apps/desktop, packages/*)

These are tooling quirks specific to this repo's Vitest setup (jsdom + React Testing Library +
a fake `@monaco-editor/react`), found while writing a full-repo unit-test pass. Read this before
debugging a test failure that looks like it should obviously pass — several of these produce
misleading symptoms (0 calls recorded, `NaN` instead of a thrown error) that look like app bugs
but are actually test-environment gaps.

**Components that import the singleton `lib/queryClient.ts` directly (not via a per-test
`QueryClientProvider`) leak query cache across tests in the same file.**
Why: that `QueryClient` has `staleTime: 5_000`, and it's a module-level singleton — the same
instance persists for the whole test file's run. A `useQuery(['key', ...])` fetched in test 1
stays "fresh" for test 2 if the queryKey matches, so the mocked `queryFn` is never called again
and assertions like `expect(mockedFn).toHaveBeenCalledWith(...)` silently see 0 calls.
How to apply: in `beforeEach`, `import { queryClient } from '../../../lib/queryClient'` and call
`queryClient.clear()`. Components that instead accept their own client via a test-created
`<QueryClientProvider client={new QueryClient(...)}>` per test don't need this.

**`@tanstack/react-virtual`'s `useVirtualizer` renders zero items in jsdom.**
Why: jsdom reports 0 for scroll-container height/width, so the real virtualizer computes an
empty visible range (its estimateSize-based windowing genuinely depends on container size, not
just `count`).
How to apply:
```ts
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: (opts) => ({
    getTotalSize: () => opts.count * opts.estimateSize(),
    getVirtualItems: () =>
      Array.from({ length: opts.count }, (_, index) => ({
        key: index,
        index,
        start: index * opts.estimateSize(),
      })),
    scrollToIndex: vi.fn(),
  }),
}))
```
This renders every row deterministically so the *component's* row-wiring logic is under test,
not react-virtual's windowing math.

**jsdom has no `PointerEvent` constructor**, so `fireEvent.pointerDown(el, {clientX})` silently
drops `clientX` (falls back to base `Event`, which ignores unknown init properties) — code
reading `e.clientX` in the handler sees `undefined`, producing `NaN` math instead of a thrown
error (easy to misdiagnose as an app bug).
How to apply: build the event by hand —
```ts
const e = new Event('pointerdown', { bubbles: true })
Object.defineProperty(e, 'clientX', { value: 100, configurable: true })
target.dispatchEvent(e)
```
Works for both React-attached listeners (needs `bubbles: true`) and raw
`window.addEventListener('pointermove', ...)` pairs a component wires up itself.

**jsdom normalizes inline hex colors to `rgb(...)` when serialized** —
`style={{borderColor: '#904538'}}` shows up in the DOM/`element.style` as `rgb(144, 69, 56)`, not
the literal hex substring. A `[style*="904538"]` selector silently matches nothing. Convert hex
to rgb (or just read `element.style.borderColor` and compare to the `rgb(...)` string) instead of
substring-matching the hex. Also: `.closest('span')` returns the element *itself* if it already
matches the selector — to reach an ancestor of the same tag, use `.parentElement` instead when
the immediate parent is what you want.

**Real Monaco can't run in jsdom.** Never try to render the real `@monaco-editor/react` package
in a test. Mock the whole module via a dynamic import inside the `vi.mock` factory (dodges
hoisting) pointing at a small hand-written fake:
- `components/git-graph/__tests__/fakeMonacoDiffEditor.tsx` — fakes the diff-editor API
  (`getLineChanges`, `getModifiedEditor().{getPosition,setPosition,revealLineInCenter,focus,
  getValue,setValue}`, `onDidUpdateDiff`) plus test-only mutators (`setLineChanges`,
  `setCurrentLine`, `triggerDiffUpdate`) so ref-imperative methods
  (`goToNextChange`/`goToPreviousChange`/etc.) can be driven deterministically.
- `components/merge-editor/__tests__/fakeMonacoPane.tsx` — fakes the single-pane `Editor` plus a
  line/offset-accurate fake *model* for multi-pane edit-range math. Different enough API shape
  from the diff fake that they aren't merged into one harness.
Check both before writing a new fake for a third Monaco-wrapping component — extend an existing
one if the shape is close enough, don't build a fourth from scratch.

**State mutations that happen "from outside React" inside a test** (calling a captured prop
callback directly, or `useXStore.setState(...)`) need `act()` around them, or the assertion right
after can read stale DOM — the update happens, but React hasn't flushed/committed yet when the
synchronous `expect` runs. Symptom: an intervening `await waitFor(...)` masks the same underlying
timing gap, so a passing neighbor test isn't proof the pattern is safe. Default to wrapping with
`act(() => ...)` (or `await act(async () => ...)` when the callback itself is async) any time a
test calls a mocked child's captured prop function or a Zustand action directly rather than
through a simulated user event.

**`@testing-library/user-event`'s `userEvent.setup()` installs its own `navigator.clipboard`
stub, silently overriding any pre-existing mock.** If a test does
`Object.defineProperty(navigator, 'clipboard', {value: {writeText}, ...})` *before* calling
`userEvent.setup()`, the setup call replaces `navigator.clipboard` again with its own
accessor-based stub — the component's `navigator.clipboard.writeText(...)` call then hits
userEvent's stub, not the test's spy, so `expect(writeText).toHaveBeenCalledWith(...)` fails with
0 calls even though the click definitely fired.
How to apply: define the clipboard mock *after* `const user = userEvent.setup()`, not before.
This only matters if the test uses `userEvent` for the interaction; `fireEvent.click` never
touches userEvent's internal clipboard setup, so ordering doesn't matter there.

**`.rejects.toThrow('some string')` (the string-argument form) throws a `TypeError: Cannot read
properties of undefined (reading 'indexOf')` from vitest/chai internals** in this repo's
installed vitest version (2.1.x in `apps/desktop`) — confirmed in an isolated repro with no
application code involved, so it's not something you did wrong.
How to apply: use `.rejects.toThrow()` (no message assertion) or `.rejects.toThrow(Error)`
instead. If asserting on the message content is actually necessary:
`await promise.catch(e => expect(e.message).toBe(...))`.
Only confirmed in `apps/desktop`'s vitest instance — `packages/code-view` is on vitest 3.x and
hasn't been checked for this.

## Test placement convention

Colocate `Foo.test.tsx` next to `Foo.tsx` in the same directory, unless that directory already
uses a `__tests__/` subfolder (e.g. `components/merge-editor/__tests__/`, in which case follow
the existing local convention rather than introducing a second style in the same folder).
