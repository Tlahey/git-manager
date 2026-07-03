# Spec 16 — Panels & Interaction System: SOLID Audit & Target Architecture

> **Status**: All 10 actions implemented (2026-07-03), one deliberate scope refinement on action
> 3.1 — see "Implementation status" at the bottom for what was built and where it deviated from
> the original sketch.

## Objective

[13-architecture-refactor-plan.md](13-architecture-refactor-plan.md) and its tracking doc
([14](14-architecture-refactor-tracking.md)) closed the backend service-layer extraction, the
frontend hook-extraction pass, the generalized event bus, and the R2 (`api/*.api.ts`) migration.
[15-rewards-system-refactor-plan.md](15-rewards-system-refactor-plan.md) then audited one vertical
slice (the rewards engine) end-to-end and introduced Strategy + Registry there.

This document does the same exercise for a slice those two plans only touched in passing: **how
panels and page-level content talk to each other and get composed** — navigation/tab switching,
overlay/dialog orchestration, and the central components that wire a page's panels together. The
question asked: *is it currently easy to add a new tab, a new panel, or a new dialog without
touching 2-3 unrelated files and without an LLM/engineer having to read the whole page to find
where to plug in?*

Same rules as docs 13/15: **R1** (one file, one role), **R2** (all operations through a
service/API layer — already enforced, not revisited here), **R3** (introduce a pattern only where
it closes a real duplication/coupling found in the audit, not speculatively). Same format: audit →
SOLID violations → target architecture → phased migration, mergeable into the doc 14 tracking
process once approved.

**Scope**: frontend only (`apps/desktop/src/{app,components,lib}`). No Rust/backend change.

**Explicit non-goal**: this is not a re-audit of what docs 13/14/15 already fixed (services layer,
`api/*.api.ts`, hook extraction for `GitGraph`/`ActionToolbar`/`WipStagingPanel`/
`CommitHeaderInfo`, the rewards Strategy/Registry). Those are working well and are the model this
plan reuses. Findings below are net-new, evidenced by reading the current code, not assumed.

---

## Current state (audit, by scope)

### Scope A — Navigation / tab switching: the same anti-pattern hand-rolled 3 times

Three independent places implement "a set of labeled tabs, each showing different content," each
with its own hand-rolled version of the same three ingredients: a string-literal union type for
the tab id, an array/JSX list of nav buttons, and a chain of `activeX === 'y' && <Content/>`.

| Where | Tab id type | Nav rendering | Content switch |
|---|---|---|---|
| [App.tsx:24](../../apps/desktop/src/App.tsx#L24) (top-level: Dashboard / Repo / Pull Requests / Rewards) | inline union, **duplicated verbatim** from `SettingsPage`'s `Section` type for the settings-section part | `TabBar` component (separate concern, out of scope here) | [App.tsx:55-63](../../apps/desktop/src/App.tsx#L55-L63) ternary chain against `useRepoUIStore` constants |
| [SettingsPage.tsx:14](../../apps/desktop/src/app/settings/SettingsPage.tsx#L14) (`Section` type, 8 sections) | `type Section = 'general' \| 'ssh' \| ...` | [SettingsPage.tsx:27-36](../../apps/desktop/src/app/settings/SettingsPage.tsx#L27-L36) `navItems` array built inline in the component body | [SettingsPage.tsx:74-90](../../apps/desktop/src/app/settings/SettingsPage.tsx#L74-L90) `activeSection === 'x' && <XSection/>` chain |
| [PullRequestsPage.tsx](../../apps/desktop/src/app/pull-requests/PullRequestsPage.tsx) (6 inner tabs) | `InnerTabType` (`types.ts`) | [PullRequestsPage.tsx:186-228](../../apps/desktop/src/app/pull-requests/PullRequestsPage.tsx#L186-L228) — 6 hand-written `<InnerTab>` JSX blocks | [PullRequestsPage.tsx:232-270](../../apps/desktop/src/app/pull-requests/PullRequestsPage.tsx#L232-L270) — 6 `activeTab === 'x' && <XTab .../>` blocks |

Concrete cost: `App.tsx`'s settings-section union type (`'general' | 'ssh' | 'integrations' |
'local_ai' | 'external_tools' | 'notifications' | 'ui_customization' | 'rewards'`) is copy-pasted
character-for-character from `SettingsPage.tsx:14` — nothing enforces they stay in sync; a
renamed/removed section silently type-checks wrong in only one of the two files if someone forgets
the other. Adding a tab anywhere in this table means touching 3 distinct spots (type, nav list,
content switch) with no single source of truth — exactly the kind of duplication `lib/rewards`
already solved once for reward-rule kinds (`ruleRegistry.ts`).

`CommitDetailsPanel`/`DiffViewCenter` do **not** have this problem — their "diff/file" and
"blame/history" toggles are 2-way switches (a boolean/2-value enum), not an open-ended tab set, so
a registry there would be over-engineering (same restraint doc 14 already applied to
`DiffRenderStrategy`, action 5.1/5.2). Confirmed by reading both files — not extending this
finding to them.

### Scope B — Overlay/dialog orchestration: mostly consistent, one real anti-pattern, two bypasses

Surveyed every dialog-opening call site in the app (9 dialog components, all trigger sites). Two
distinct findings:

**B1 — `GitGraphOverlayManager` state doesn't scale with dialog count.**
[components/git-graph/components/GitGraphOverlayManager.tsx:25-27](../../apps/desktop/src/components/git-graph/components/GitGraphOverlayManager.tsx#L25-L27)
holds one `useState<string | null>` *per dialog kind* (`resetOid`, `revertOid`, `branchOid`), each
paired with its own lookup + JSX block (lines 40-76). This is the one place in the app that
actually has the "N parallel state variables for N mutually-exclusive dialogs" shape — everywhere
else (`ResetDialog`/`RevertDialog`/`CreateBranchHereDialog`'s siblings in `fixup/`, `tab-bar/
CloneRepoDialog.tsx`, `pull-requests/components/FollowPRDialog.tsx`) is a single parent holding one
`boolean`/`open` state per dialog it owns — a normal, idiomatic React controlled-component pattern
that does **not** need a shared abstraction to stay readable at today's scale (adding a generic
`DialogManager`/modal-stack service for 1-2 dialogs per parent would be the same over-engineering
mistake doc 14 already reverted twice — see `ruleRegistry.ts`'s own comment on that). Only
`GitGraphOverlayManager` is the mutually-exclusive, native-menu-driven case that actually benefits
from collapsing to one state slot.

**B2 — Two dialogs reimplement the modal shell instead of reusing the existing primitive.**
`packages/ui/src/components/dialog.tsx` already exports a Radix-based `Dialog` used correctly by
`ResetDialog`, `RevertDialog`, `CreateBranchHereDialog`, `AutosquashPreviewDialog`,
`FixupTargetSelector`, `CloneRepoDialog`. But
[app/pull-requests/components/FollowPRDialog.tsx](../../apps/desktop/src/app/pull-requests/components/FollowPRDialog.tsx)
(60 lines) and
[app/pull-requests/components/FilterEditorDialog.tsx](../../apps/desktop/src/app/pull-requests/components/FilterEditorDialog.tsx)
(268 lines) hand-roll their own fixed-position backdrop/panel instead. This isn't a missing
pattern — it's a DRY/consistency gap: these two get no shared Escape-to-close, focus trap, or
backdrop-click behavior that the six other dialogs get for free from the primitive, and any future
a11y fix to `dialog.tsx` won't reach them.

### Scope C — Central panel orchestrators: R1 debt in exactly the shape doc 14 already fixed elsewhere

Doc 14 (actions 6.1-6.4, 6.6) repeatedly found the same shape of bug — a component accumulates
imperative actions/derived state alongside rendering, then gets a hook extracted
(`useGitGraphNodes`, `useGitGraphActions`, `useWipCommitPanel`, `useCommitMessageEdit`,
`useActionToolbar`). Two more instances of that exact shape, not yet fixed:

- **`GitGraph.tsx`, lines [239-275](../../apps/desktop/src/components/git-graph/GitGraph.tsx#L239-L275)**: WIP-connection and origin/main dashed-line patching is graph-layout business logic
  (mutating `node.connections` based on `totalChanges`/`originMainIndex`), inlined **inside the
  virtualized-row `.map()` callback** — i.e. it re-runs this derivation reasoning on every row, on
  every render, rather than once in `useGitGraphNodes` (which was created for exactly this kind of
  derivation in action 6.1, but doesn't yet own this piece of it).
- **`PullRequestsPage.tsx`** (275 lines): owns `pinnedIds`/`followedPRs` local state, the
  `tabCounts` derivation (lines 79-86), and toggle/add/remove callbacks, mixed with the header, KPI
  bar, and tab-bar rendering — the same "component doing hook work" shape `ActionToolbar.tsx` had
  before action 6.6. No `usePullRequestsPage`-style hook exists yet for this page.

Both are plain continuations of a pattern the codebase already applies consistently elsewhere —
not a new design problem, just not yet applied here.

### Scope D — `DiffViewCenter.tsx`: known, already-flagged debt (cross-referencing, not re-discovering)

Doc 14's action 5.2 note already states: *"The file's real size (427 lines) comes from the
header/toolbar (tabs, blame/history, navigation, stage/discard), not from diff rendering — a
future breakdown into a sub-component would be a different R1 action, out of scope for this
plan."* Confirmed still true by reading [DiffViewCenter.tsx:162-385](../../apps/desktop/src/components/git-graph/DiffViewCenter.tsx#L162-L385)
today: the header block alone is ~220 lines of toolbar JSX (view-mode tabs, blame/history toggle,
diff-nav, stage/discard actions) in front of a ~40-line content area. This plan is where that
already-identified action gets scheduled (Phase 4 below) rather than staying an unscheduled note.

### Scope E — Event bus payload typing: already tracked, not duplicated here

Doc 15 already flagged `AppEvent`/`any` payload typing as SOLID violation #6, deliberately deferred
as its own "Phase 4." Not re-auditing it here — cross-referenced only so it isn't accidentally
tracked twice under two different plans.

---

## SOLID violations identified

| # | Principle | Violation | Location | Concrete impact |
|---|---|---|---|---|
| 1 | **OCP / DRY** | Adding a tab/section means editing a type, a nav list, and a content switch in the same file, with no single declarative source of truth — and in one case the same type is duplicated across two files. | `App.tsx:24` + `SettingsPage.tsx:14` (duplicated `Section` union); `PullRequestsPage.tsx:186-270` | Every new tab is 3 edits instead of 1; the duplicated type can silently drift (renamed section compiles in one file, not the other, until someone remembers both). |
| 2 | **OCP** | `GitGraphOverlayManager` needs a new `useState` + a new JSX branch for every new native-menu-triggered dialog kind. | [GitGraphOverlayManager.tsx:25-27,40-76](../../apps/desktop/src/components/git-graph/components/GitGraphOverlayManager.tsx#L25-L76) | Currently 3 dialogs × 2 lines each; scales linearly and independently per kind with no shared lifecycle. |
| 3 | **DRY / LSP-ish (inconsistent contract)** | Two dialogs (`FollowPRDialog`, `FilterEditorDialog`) don't implement the same modal contract (focus trap, Escape, backdrop click) as the other six, which all reuse `packages/ui`'s `Dialog`. | `FollowPRDialog.tsx`, `FilterEditorDialog.tsx` | Inconsistent UX (Escape/backdrop-click may not close these two the same way as every other dialog in the app); any future fix to the shared primitive won't reach them. |
| 4 | **SRP** | Graph-layout derivation (connection patching) executed per-row inside the render loop instead of once in the dedicated derivation hook. | [GitGraph.tsx:239-275](../../apps/desktop/src/components/git-graph/GitGraph.tsx#L239-L275) | Same reasoning re-evaluated on every visible row, on every render; harder to unit-test in isolation from rendering. |
| 5 | **SRP** | `PullRequestsPage.tsx` mixes page-level state/derivation (pinned ids, followed PRs, tab counts) with header/KPI/tab-bar rendering. | `PullRequestsPage.tsx` (whole file, 275 lines) | Same category doc 14 already fixed for `ActionToolbar`/`GitGraph`/`WipStagingPanel`/`CommitHeaderInfo` — just not yet applied here. |

**Verdict on the question asked** ("can a new tab/panel/dialog be added without touching 2-3
unrelated files, and can an LLM find where to plug in without reading the whole page?"): **no for
tabs/sections** (3 files today, no single source of truth) and **no for the one overlay-manager
dialog case** (linear state growth); **yes, already, for every other dialog** (the controlled
`open`-prop pattern is fine and shouldn't be touched) and **yes for panel composition in general**
(the sidebar/central-area/side-panel/overlay layering in `RepoView.tsx`/`GitGraph.tsx` is a normal,
readable flex layout — no Mediator/event-driven abstraction is warranted there; see "Explicitly
rejected" below).

---

## Target architecture

### Pattern 1 — `TabRegistry`: one declarative source of truth for tab/section sets

**Problem solved**: scope A — 3 independent hand-rolled tab implementations, one with a literally
duplicated type.

**Target**: a small, generic, reusable primitive — not a framework. Modeled directly on
`lib/rewards/ruleRegistry.ts`'s already-proven shape (a typed `Record`/array, one function to read
it, no runtime registration, no plugin system):

```ts
// lib/navigation/tabRegistry.ts
export interface TabDef<Id extends string> {
  id: Id
  label: string          // already-translated string, or an i18n key resolved by the caller
  icon?: ComponentType
  content: ComponentType
  badge?: number          // optional count, e.g. PR/issue counts
}

export function defineTabs<Id extends string>(tabs: TabDef<Id>[]): TabDef<Id>[] {
  return tabs // identity today; typed entry point so all 3 call sites share one shape/one place to extend later (e.g. lazy-loading) without touching each call site individually
}
```

Paired with a presentational `<TabNav>` (renders the nav buttons from the array) and `<TabPanel>`
(renders `tabs.find(t => t.id === active)?.content`), both dumb components with no business logic
— they take an array and an active id, nothing else. These can live in
`apps/desktop/src/components/tab-nav/` (frontend-app-specific; not generic enough to promote to
`packages/ui` yet — only 3 consumers, all inside `apps/desktop`).

**Rollout order** (least to most coupled, so each step is independently revertable):
1. `SettingsPage.tsx` — most isolated (no external store, `activeSection` is local `useState`).
2. `PullRequestsPage.tsx` — `activeTab` already lives in `useLaunchpadStore`, registry just
   supplies the `TabDef[]`; badge counts map onto the existing `tabCounts` derivation (see Pattern
   3 below — do this after extracting `usePullRequestsPage`, not before, so the hook and the
   registry migration aren't tangled in one diff).
3. `App.tsx` top-level tabs — touches `useRepoUIStore` constants (`DASHBOARD_TAB` etc.); do last,
   once the pattern has proven itself on the two lower-risk pages.

**Deliberately not built**: no dynamic/runtime tab registration, no per-tab permission/feature-flag
system, no code-splitting/lazy-loading layer. Nothing in the audit asked for those — adding them
now would repeat the `GitGraphBuilder`/`DiffRenderStrategy` over-engineering mistake doc 14 already
reverted twice.

### Pattern 2 — Single discriminated-union state for `GitGraphOverlayManager`

**Problem solved**: scope B1.

**Target**: collapse `resetOid`/`revertOid`/`branchOid` into one state slot:

```ts
type PendingDialog =
  | { kind: 'reset'; oid: string }
  | { kind: 'revert'; oid: string }
  | { kind: 'branch'; oid: string }
  | null

const [activeDialog, setActiveDialog] = useState<PendingDialog>(null)
```

One `useEffect` sets it from `pendingAction`/`primaryOid` (same as today, one branch instead of
three), one `switch (activeDialog?.kind)` renders the matching dialog. This is a plain
discriminated union, not a registry — for 3 mutually-exclusive kinds a `switch` is enough and
stays exactly as readable; do **not** add a `Record<Kind, Component>` lookup table for 3 cases
(same R3 restraint as Pattern 1's "deliberately not built" list — a registry pays off at
duplication counts closer to the rewards system's 5 rule kinds, not at 3 dialogs already
maintained in one file). If a 4th native-menu dialog kind is added later *and* the switch starts
feeling repetitive, revisit then — not preemptively.

### Pattern 3 — Hook extraction for `PullRequestsPage` (continuation, not a new pattern)

**Problem solved**: scope C, `PullRequestsPage.tsx`.

**Target**: `hooks/usePullRequestsPage.ts` (or `useLaunchpad.ts`, matching the store's existing
`launchpad.store.ts` naming) owning `pinnedIds`, `followedPRs`, `togglePin`/`addFollowed`/
`removeFollowed`, and the `tabCounts` derivation — the exact same shape as
`useActionToolbar`/`useWipCommitPanel`. `PullRequestsPage.tsx` keeps the header/KPI bar/tab
rendering only. No new abstraction introduced — this is applying the codebase's own established
R1 fix to a file that hasn't had it yet.

### Pattern 4 — Move WIP-connection patching into `useGitGraphNodes`

**Problem solved**: scope C, `GitGraph.tsx:239-275`.

**Target**: `useGitGraphNodes` (already the home for `wipNode`/`filteredNodes`/`waterlines`/
`originMainIndex`) gains the connection-patching step, memoized once per `filteredNodes`/
`totalChanges`/`originMainIndex` change, returning already-patched nodes. `GitGraph.tsx`'s
`.map()` callback goes back to pure rendering, no conditional mutation. Same category of fix as
the `originMainIndex` O(n²) perf bug doc 14's action 6.1 already found and fixed in this exact
hook — this is the one piece of that derivation that stayed behind.

### Pattern 5 — Reuse the shared `Dialog` primitive in `FollowPRDialog`/`FilterEditorDialog`

**Problem solved**: scope B2.

**Target**: rebuild both on top of `packages/ui`'s `Dialog` (as `ResetDialog`/`CloneRepoDialog`/
etc. already do), dropping the hand-rolled fixed-position backdrop. Pure consistency fix, not a
new pattern — the primitive already exists and is already the majority convention.

### Explicitly rejected (R3 discipline)

- **No global `DialogManager`/modal stack service.** 7 of 9 dialogs already use a fine,
  idiomatic, boolean-`open`-in-parent pattern; only 1 has the scaling problem (Pattern 2 fixes that
  one directly, in place, with no new service). A generic manager for the whole app would be
  solving a problem 7/9 call sites don't have.
- **No Mediator/event-driven layer over `GitGraph.tsx`'s panel composition.** The sidebar / central
  content / side details panel / overlay layering in `RepoView.tsx` and `GitGraph.tsx` is a
  straightforward flex layout with local state and prop callbacks (`onSelectFileDiff`,
  `onClose`, `setActiveDiffFile`) — readable, one level deep, no fan-out. Wrapping it in an
  event bus or mediator would hide control flow that's currently easy to trace with "go to
  definition," for no duplication it would remove.
- **No rework of `AppEvent` payload typing in this plan** — already owned by doc 15's deferred
  Phase 4; tracking it here too would create two sources of truth for the same TODO.
- **No registry/strategy for `CommitDetailsPanel`'s diff/file or blame/history toggles** — these
  are 2-value switches, not open-ended sets; confirmed by reading both components, not carried
  over from the tab-registry finding by assumption.
- **No `TabRegistry` for `App.tsx`'s top-level switch.** Discovered during implementation (action
  3.1): `activeTab` there is `string` (`'dashboard' | 'pull-requests' | <any repo path>`), an
  open-ended id space with a fallback (anything not matching a special constant renders
  `RepoView`) — not a closed tab set. `defineTabs`/`renderActiveTab` resolve by exact id match with
  no fallback concept; adding one for this single caller would be the same over-engineering this
  plan argues against elsewhere. Fixed the concrete, real part of the finding instead (the
  duplicated `Section` type) and left the ternary chain as-is.

---

## Phased migration plan

| # | Action | File(s) | Depends on | Status |
|---|---|---|---|---|
| 1.1 | Create `lib/navigation/tabRegistry.ts` (`TabDef`, `defineTabs`) + dumb `components/tab-nav/TabNav.tsx` and `TabPanel.tsx` | new files | — | ✅ (see note) |
| 1.2 | Migrate `SettingsPage.tsx` to the registry (single `SETTINGS_TABS: TabDef<Section>[]` array replaces `navItems` + the `activeSection === 'x' &&` chain) | `app/settings/SettingsPage.tsx` | 1.1 | ✅ |
| 2.1 | Extract `hooks/usePullRequestsPage.ts` (pinnedIds, followedPRs, toggle/add/remove callbacks, `tabCounts`) out of `PullRequestsPage.tsx` | `hooks/usePullRequestsPage.ts`, `app/pull-requests/PullRequestsPage.tsx` | — | ✅ |
| 2.2 | Migrate `PullRequestsPage.tsx`'s inner tabs to the registry, wiring `badge` from `tabCounts` (now produced by 2.1) | `app/pull-requests/PullRequestsPage.tsx` | 1.1, 2.1 | ✅ |
| 3.1 | Migrate `App.tsx` top-level tabs to the registry; delete the duplicated `Section` type, import it from `SettingsPage.tsx` or hoist it to a shared location if `App.tsx` needs it for the settings-open shortcut | `App.tsx` | 1.1, 1.2 | ✅ (rescoped, see note) |
| 4.1 | Collapse `GitGraphOverlayManager`'s 3 `useState<string \| null>` into one `PendingDialog` discriminated union | `components/git-graph/components/GitGraphOverlayManager.tsx` | — | ✅ |
| 5.1 | Move WIP-connection/origin-main dashed-line patching from `GitGraph.tsx`'s render loop into `useGitGraphNodes` | `hooks/useGitGraphNodes.ts`, `components/git-graph/GitGraph.tsx` | — | ✅ |
| 6.1 | Extract `DiffToolbar` sub-component (view-mode tabs, blame/history toggle, diff-nav, stage/discard actions) from `DiffViewCenter.tsx`'s header block | `components/git-graph/components/DiffToolbar.tsx`, `components/git-graph/DiffViewCenter.tsx` | — | ✅ |
| 7.1 | Rebuild `FollowPRDialog.tsx` on `packages/ui`'s `Dialog` primitive | `app/pull-requests/components/FollowPRDialog.tsx` | — | ✅ |
| 7.2 | Rebuild `FilterEditorDialog.tsx` on `packages/ui`'s `Dialog` primitive | `app/pull-requests/components/FilterEditorDialog.tsx` | — | ✅ |

Phases are independent of each other (only the sub-steps within 1-3 depend on each other) — they
can be done in any order, as separate PRs, per the project's existing "one action = one reasonable
PR" convention from doc 14.

### Manual test notes (Tauri-only, cannot be verified in a browser per `CLAUDE.md`)

- 1.2/2.2/3.1: after each migration, `pnpm dev` and click through every nav item/tab to confirm
  the right content renders and the active-state styling still highlights correctly.
- 4.1: trigger the native context menu's Reset/Revert/"Branch here" actions on a commit and confirm
  each still opens the correct dialog with the correct commit pre-filled.
- 5.1: check WIP connection lines and the dashed origin/main styling on a repo with uncommitted
  changes and at least one commit above `origin/main` — this is the same rendering path doc 14's
  action 6.1 recommended a manual pass for.
- 7.1/7.2: confirm Escape and backdrop-click now close both dialogs (behavior they didn't
  necessarily have before), and that existing keyboard/focus behavior isn't regressed.

---

## Implementation status

All 10 actions implemented on branch `refactor/panels-tab-registry` (off `main` @ `6c74d32`, the
already-merged rewards-system-solid PR). `pnpm --filter @git-manager/desktop typecheck` passes
after every single action (verified incrementally, not just at the end).

**Deviation from the original sketch — action 1.1**: built `lib/navigation/tabRegistry.ts` with
`TabDef<Id>` + `defineTabs` + a `renderActiveTab(tabs, activeId)` helper, but **did not** build the
sketched dumb `<TabNav>`/`<TabPanel>` components. Reason found while implementing: `SettingsPage`'s
sections take no props, but `PullRequestsPage`'s inner tabs each need a different, non-uniform prop
shape (`allPRs`/`pinnedIds`/`onTogglePin`/... vs `commitDays`/`yearDays`/...) — a single generic
content component can't render both without either a render-prop/thunk per tab (which is what
`TabDef.render: () => ReactNode` already is) or forcing a uniform prop contract nothing needs. Also,
nav *rendering* stays bespoke per page (`SettingsPage`'s sidebar buttons vs `PullRequestsPage`'s
`<InnerTab>` pills are visually distinct, and `App.tsx`'s top-level switch is driven by the separate
`TabBar` component, not by a nav this registry should render) — each page still maps over its own
`TabDef[]` array for nav, closing the actual duplication (one array is now the single source of
truth for id+label+icon+content) without inventing a generic nav component two real, differently-styled
consumers would have to bend to fit. This is a smaller, more honest primitive than sketched, and
was judged in scope for the same R3 discipline the plan itself argues for.

**Deviation — action 3.1**: `App.tsx`'s top-level switch (`DASHBOARD_TAB`/`PULL_REQUESTS_TAB`/
`REWARDS_TAB` else falls through to `RepoView`) turned out, on inspection, not to be a closed tab
set at all — `useRepoUIStore`'s `activeTab` is `string` (`'dashboard' | 'pull-requests' | <any repo
path>`), an open-ended id space with a fallback. Forcing that through `defineTabs`/`renderActiveTab`
(which resolve by exact id match, no fallback concept) would have meant adding a "default entry"
feature to the shared primitive for this one caller — the same over-engineering-for-a-single-caller
mistake this plan explicitly argues against elsewhere (see "Explicitly rejected"). Rescoped to the
concrete, still-real part of the finding: removed the duplicated `Section` union type (previously
copy-pasted verbatim in `App.tsx` and `SettingsPage.tsx`) by exporting `Section` from
`SettingsPage.tsx` and importing it in `App.tsx`. The top-level ternary chain itself is unchanged
and is not considered a violation — see the newly-added rejection bullet below.

**Manual/visual testing not done in this session** (Tauri-only app, cannot be verified from a
browser per `CLAUDE.md`). Per the "Manual test notes" section above, before merging: run `pnpm dev`
and check (a) every settings section and Launchpad tab renders correctly, (b) the native
Reset/Revert/"Create branch here" context-menu actions still open the right dialog, (c) WIP
connection lines and the dashed origin/main boundary on a repo with uncommitted changes and commits
above `origin/main`, (d) the diff view toolbar (view mode, blame/history, stage/discard, close), and
(e) both `FollowPRDialog` and `FilterEditorDialog` (Escape/backdrop-click should now close them,
which they may not have done identically before).

## Journal

| Date | Action(s) | Notes |
|---|---|---|
| 2026-07-03 | Creation of the plan | Audit performed by reading current source (no code changes applied). Scopes A-E surveyed directly (`App.tsx`, `SettingsPage.tsx`, `PullRequestsPage.tsx`, `GitGraphOverlayManager.tsx`, `GitGraph.tsx`, `DiffViewCenter.tsx`, `CommitDetailsPanel.tsx`, `appEventBus.ts`, `lib/rewards/*`, plus a full dialog-pattern survey across `fixup/`, `rollback/`, `tab-bar/`, `pull-requests/components/`). No phase started yet. |
| 2026-07-03 | 1.1, 1.2 | Created `lib/navigation/tabRegistry.ts` (`TabDef`, `defineTabs`, `renderActiveTab` — no generic `<TabNav>`/`<TabPanel>` components, see "Implementation status"). Migrated `SettingsPage.tsx`: `SETTINGS_TABS` array (with per-tab `render()` closures, a shared `scrolled()` helper for the common `ScrollArea` layout) replaces `navItems` + the 8-branch content chain; `Section` type now exported. Verified: `pnpm --filter @git-manager/desktop typecheck` passes. |
| 2026-07-03 | 2.1, 2.2 | Extracted `hooks/usePullRequestsPage.ts` (pinnedIds, followedPRs, togglePin/addFollowed/removeFollowed, all KPI/tabCounts derivation) out of `PullRequestsPage.tsx`. Migrated its 6 inner tabs to `PR_TABS: TabDef<InnerTabType>[]`; the `waiting` tab's extra `appEventBus.notify('view_waiting_reviews')` side effect moved into a small `selectTab()` wrapper rather than baked into the registry (kept the registry itself free of one-off side-effect fields). Verified: typecheck passes. |
| 2026-07-03 | 3.1 | Rescoped in place — see "Implementation status." Deduplicated the `Section` type between `App.tsx` and `SettingsPage.tsx`; left the top-level `DASHBOARD_TAB`/`PULL_REQUESTS_TAB`/`REWARDS_TAB`/fallback ternary as-is (open-ended id space with a fallback, not a fixed set the registry fits). Verified: typecheck passes. |
| 2026-07-03 | 4.1 | Collapsed `GitGraphOverlayManager`'s `resetOid`/`revertOid`/`branchOid` trio into one `activeDialog: PendingDialog` discriminated union + a `switch` (not a registry — 3 mutually-exclusive cases don't warrant one, per R3). Verified: typecheck passes. Native-menu-triggered dialogs (Reset/Revert/Create-branch-here) not re-tested visually this session — flagged in "Manual test notes." |
| 2026-07-03 | 5.1 | Moved WIP-connector/origin-main dashed-line patching from `GitGraph.tsx`'s per-row `.map()` callback into a new `renderNodes` memo in `useGitGraphNodes` (derived once from `filteredNodes`/`totalChanges`/`originMainIndex`, same dependency shape as the sibling `originMainIndex` O(n²) fix doc 14 already made in this hook). `GitGraph.tsx`'s render loop is back to pure rendering. `originMainIndex` no longer destructured in `GitGraph.tsx` (only the hook needs it now). Verified: typecheck passes. Graph rendering not re-tested visually this session — flagged in "Manual test notes," same caution doc 14 already recommended for this hook. |
| 2026-07-03 | 6.1 | Extracted `components/git-graph/components/DiffToolbar.tsx` (all header/toolbar JSX: file identity, diff/file tabs, blame/history toggle, diff nav, split/inline + whitespace toggles, WIP stage/discard, close) out of `DiffViewCenter.tsx`. Purely presentational move — all state/handlers stayed in `DiffViewCenter.tsx`, passed down as props/callbacks, no logic changed. `DiffViewCenter.tsx` 427→192 lines, `DiffToolbar.tsx` 315 lines. Verified: typecheck passes. |
| 2026-07-03 | 7.1, 7.2 | Rebuilt `FollowPRDialog.tsx` and `FilterEditorDialog.tsx` on `packages/ui`'s `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle`/`DialogFooter` (same convention as `CreateBranchHereDialog.tsx`), replacing the hand-rolled fixed-position backdrop + manual close button in both. External prop contracts (`onAdd`/`onSave`/`onClose`) unchanged, so both call sites (`FollowedPRsTab.tsx`, `CustomViewsTab.tsx`) needed no changes. Verified: typecheck passes. Not re-tested visually — both dialogs should now also close on Escape/backdrop-click, which is a behavior change worth confirming in `pnpm dev`. |
| 2026-07-03 | — | Full monorepo `pnpm typecheck` also run: `@git-manager/ui`'s typecheck script fails, but confirmed via `git stash` that this failure pre-dates this session's changes (broken on `main` already, unrelated `tsc`/turbo config issue) — not caused by, or in scope of, this plan. |
