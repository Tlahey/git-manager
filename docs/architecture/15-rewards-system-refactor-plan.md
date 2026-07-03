# Spec 15 — Rewards system: SOLID audit & target architecture

> **Status**: Phases 1-3 implemented (this session). Phase 4 (tightening `AppEvent` payload
> typing) deliberately deferred — see "Implementation status" at the bottom of this document for
> what was built, where, and two behavior-preserving corrections discovered along the way.

## Objective

[13-architecture-refactor-plan.md](13-architecture-refactor-plan.md) closed with "no refactor
action planned" ([14-architecture-refactor-tracking.md:146](14-architecture-refactor-tracking.md#L146)).
It touched the reward system only tangentially (renamed `gameObserver` → `appEventBus`, created
`callCommand`, fixed a direct `invoke()` call in `game.store.ts`) — it never audited the
**rule-evaluation logic itself**: `stores/game.store.ts` + `stores/achievements.json` and their
consumers (`AppearanceSection.tsx`, `CommitDetailsAvatar.tsx`, `RewardsTab.tsx`).

This document is that audit, scoped to one question the user asked explicitly: **is the current
design easy to extend with new rewards / new trigger events, without modifying existing code?**
It follows the same rules as doc 13 (R1 one file one role, R2 mandatory
service/engine layer, R3 no pattern for the pattern's sake) and the same format (audit → target →
phased migration), so it can be merged into the same tracking process in doc 14 once approved.

**Scope**: frontend only (`apps/desktop/src/{stores,lib,app}`). No Rust/backend change needed —
the rewards system is 100% client-side and has no IPC surface of its own.

---

## Current state (audit)

### How it works today

```
api/git.api.ts (callCommand) ──notify──▶ lib/appEventBus.ts ──▶ stores/game.store.ts
                                          (Observer, pub/sub)      .handleObserverEvent()
                                                                          │
                                                        reads stores/achievements.json
                                                       (28 static achievement definitions)
                                                                          │
                                                              unlockAchievement() / points
                                                                          │
                        ┌─────────────────────────────────────────────────┴───────────────┐
                        ▼                                                                   ▼
              TrophyToast.tsx / RewardsTab.tsx                    AppearanceSection.tsx / CommitDetailsAvatar.tsx
              (reads recentUnlock/achievements)                   (hardcodes achievement IDs → theme/frame unlocks)
```

### Strengths to preserve
- **Observer already correct**: `lib/appEventBus.ts` decouples event producers
  (`api/git.api.ts` via `callCommand`) from the reward logic. This is the right pattern for this
  problem and doc 13 already validated it — **do not replace it**.
- **Declarative config**: achievement definitions (id, title, points, type, difficulty,
  trigger fields) live in `stores/achievements.json`, not scattered across components.
- **Persistence merge is correct**: `game.store.ts:278-291` recombines persisted `unlocked`
  state with the always-fresh static definitions from JSON on every boot — new achievements can
  be added to the JSON without a migration.
- No dead/duplicated `Diff`-style structs, no giant `if/else` per achievement ID — the 28
  achievements share 3 generic trigger mechanisms rather than 28 bespoke code paths.

### SOLID violations identified

| # | Principle | Violation | Location | Concrete impact |
|---|---|---|---|---|
| 1 | **SRP** | `game.store.ts` is simultaneously: Zustand state container, persistence config, rule-evaluation engine (3 trigger strategies), side-effect scheduler (`setTimeout`), and terminal-history dedup/poller. | [game.store.ts:159-222](../../apps/desktop/src/stores/game.store.ts#L159-L222) (`handleObserverEvent`), [:136-157](../../apps/desktop/src/stores/game.store.ts#L136-L157) (`checkMilestones`) | Rule logic cannot be unit-tested without mounting a Zustand store. Every new trigger *kind* grows the same function. |
| 2 | **OCP** | Adding a new **kind** of trigger (e.g. "N consecutive days with a commit", "opened M different repos", "first commit after 22:00") means editing `handleObserverEvent`/`checkMilestones` directly. The system is only closed for the 3 kinds it already knows (`actionType`, `milestoneType`, `commandKeyword`) — genuinely new logic always means modifying shared code, not extending it. | same as #1 | Risk of regressing existing rules every time a new one is added; `achievements.json` looks fully declarative but isn't, for anything outside the 3 known shapes. |
| 3 | **OCP / DIP** | Theme-unlock logic hardcodes achievement IDs **inside a UI component**, in a domain (theming) that has nothing to do with rewards. | [AppearanceSection.tsx:108-142](../../apps/desktop/src/app/settings/components/AppearanceSection.tsx#L108-L142) — `if (themeId === 'amethyst') return !achievements.find(a => a.id === 'commit_100')?.unlocked` (×4) | Theming code has to know achievement IDs by heart. Adding a 5th locked theme means editing this function, not the reward config. Same class of coupling exists for avatar frames, computed independently in `game.store.ts:58-82` (`getLevelInfo`). |
| 4 | **DRY** | Prerequisite-checking logic (`if (item.prerequisiteId) { ... }`) is duplicated verbatim 3 times. | [game.store.ts:107-109](../../apps/desktop/src/stores/game.store.ts#L107-L109), [:142-145](../../apps/desktop/src/stores/game.store.ts#L142-L145), [:169-172](../../apps/desktop/src/stores/game.store.ts#L169-L172) | 3 places to keep in sync. A 4th consumer (a future settings "debug unlock" tool, a test) needs a 4th copy or has to reach into the store's internals. |
| 5 | **SRP** | `unlockAchievement()` — whose job is "unlock *one* achievement" — also contains meta-knowledge of **all** achievements (the platinum "unlock when everything else is unlocked" check). | [game.store.ts:122-129](../../apps/desktop/src/stores/game.store.ts#L122-L129) | A second composite/meta achievement (e.g. "unlock when all bronze are done") requires copy-pasting this exact block with tweaks — not declaring a new rule. |
| 6 | **DIP** (minor) | Event payload is `any` on both `notify()` and every listener. | [appEventBus.ts:18](../../apps/desktop/src/lib/appEventBus.ts#L18) | Payload shape (`{ filePath }` vs `{ command }` vs nothing) is tribal knowledge, not enforced by the compiler — a typo in a payload key fails silently at runtime, not at typecheck. |

**Verdict on the user's question** ("is it easy to extend with new rewards / new trigger
events?"): **yes for new instances of an existing trigger kind** (add a JSON entry — this part is
genuinely SOLID-friendly today), **no for a new kind of trigger or a new kind of reward effect**
(theme/frame/badge) — both require editing shared logic in 2+ places. That second case is the gap
this plan closes.

---

## Target architecture

### R3 applied: patterns introduced, and why each one is justified here

#### Strategy — one class per trigger kind
**Problem solved**: #1, #2. `RewardRule` interface with a single method,
`matches(ctx: RuleContext): boolean`. Concrete rules: `ActionRule`, `MilestoneRule`,
`TerminalKeywordRule`, `PairEventRule` (stage→unstage same file), `CompositeRule` (meta:
"all of these ids unlocked"). Each class is independently testable with a plain object, no
Zustand.

#### Factory — build a rule instance from its JSON definition
**Problem solved**: #2. `achievements.json` gains an explicit `"kind"` discriminant
(`"action" | "milestone" | "terminal_keyword" | "pair" | "composite"`). A `createRule(def)`
factory switches on `kind` to instantiate the right `RewardRule`. TypeScript gets exhaustiveness
checking on `kind` for free (discriminated union) — adding a kind without a matching `case` is a
compile error, not a silent no-op.

#### Facade — a pure `RewardEngine`, extracted out of Zustand
**Problem solved**: #1, #4. New module `lib/rewards/rewardEngine.ts`, framework-free
(no `zustand`, no `react` import):
```ts
export function processEvent(
  state: RewardEngineState,
  event: AppEvent,
  payload: unknown,
): { newlyUnlocked: Achievement[]; nextState: Partial<RewardEngineState> }
```
`game.store.ts` shrinks to: hold state, call `processEvent`, merge the result, schedule the
`recentUnlock` toast, handle persistence. It stops *being* the rule engine and starts *using*
one — this is the same "one entry point, thin adapter" shape doc 13 already applies to Tauri
commands (R2), just on the frontend rules side. Prerequisite-checking becomes one function inside
the engine, called from every rule kind that needs it — fixes #4 directly.

#### Reward Effects — decouple "what unlocking grants" from "who renders it"
**Problem solved**: #3. Each achievement definition gains an optional `"effects"` array, e.g.:
```json
{ "id": "commit_100", "effects": [{ "type": "theme", "id": "amethyst" }] }
```
A tiny selector, `getUnlockedEffects(achievements, type: 'theme' | 'avatarFrame')`, replaces the
`if (themeId === 'amethyst') ...` chain. `AppearanceSection.tsx` and `CommitDetailsAvatar.tsx`
call the selector and never see an achievement ID. Adding a 5th locked theme = one JSON field,
zero component edits. (`points` stays a plain field, not an "effect" — it's not optional/plural
like theme/frame unlocks, no need to generalize what isn't varying.)

#### Composite rule replaces the hardcoded platinum special-case
**Problem solved**: #5. Platinum trophy becomes `{ "kind": "composite", "requiresAllExcept":
["platinum_trophy"] }`, evaluated by the engine as a normal rule re-checked after every unlock —
no more bespoke block inside `unlockAchievement`. A second meta-achievement is then just another
JSON entry, not a code change.

#### Observer — kept as-is, typing tightened only
**Problem solved**: #6, without solving a problem that doesn't exist. `appEventBus.ts` is not
being replaced — doc 13 already justified it and it works. The only change: type `AppEvent` +
payload as a discriminated union (`{ type: 'stage'; filePath: string } | { type: 'commit' } |
...`) instead of `AppEvent` (string) + `payload?: any`, so a mismatched payload is a compile
error at the `notify()` call site.

### Explicitly rejected: Builder

The user's prompt suggested considering Builder. It doesn't fit here, and forcing it in would be
the same mistake doc 14 already flagged twice for other areas (`GitGraphBuilder` and a
`DiffRenderStrategy` were both proposed in doc 13 and then explicitly *not* built after
re-reading the code — see [14-...md:141](14-architecture-refactor-tracking.md#L141) and
[:175](14-architecture-refactor-tracking.md#L175), "no Strategy to extract... over-engineering").
Achievement definitions are static JSON assembled once at import time
(`stores/achievements.json` → `INITIAL_ACHIEVEMENTS`) — there is no multi-step, conditional, or
runtime construction to justify a fluent builder API. A plain object-literal `ruleRegistry: Record<RuleKind, RuleFactory>`
is simpler and does the same job. Builder would earn its place only if achievements became
pluggable at runtime from multiple independent sources (e.g. a future extension/plugin system) —
not a current requirement, so not built now.

---

## New / changed files

| File | Role |
|---|---|
| `lib/rewards/types.ts` | `RewardRule`, `RuleContext`, `RewardEffect`, `AchievementDefinition` (kind-discriminated union) |
| `lib/rewards/rules/actionRule.ts`, `milestoneRule.ts`, `terminalKeywordRule.ts`, `pairEventRule.ts`, `compositeRule.ts` | one `RewardRule` implementation each |
| `lib/rewards/ruleRegistry.ts` | `kind → RuleFactory` map + `createRule(def)` |
| `lib/rewards/rewardEngine.ts` | pure `processEvent()`, no Zustand/React import |
| `lib/rewards/effects.ts` | `getUnlockedEffects(achievements, type)` selector |
| `stores/game.store.ts` | thinned: state, persistence, delegates rule evaluation to `rewardEngine` |
| `stores/achievements.json` | add `"kind"` (required, additive) and `"effects"` (optional, additive) fields |
| `app/settings/components/AppearanceSection.tsx` | replace the 4 hardcoded `if (themeId === ...)` checks with `getUnlockedEffects(achievements, 'theme')` |
| `components/git-graph/components/CommitDetailsAvatar.tsx` | same, for avatar-frame effects (keep `getLevelInfo` for point-based frames — that part isn't achievement-driven, it's a separate points→tier function and is not in scope) |
| `lib/appEventBus.ts` | narrow `AppEvent`/payload to a discriminated union |

---

## Migration plan (phased, behavior-preserving at each step)

1. **Phase 1 — introduce the engine without changing behavior.** Add `lib/rewards/*`, add
   `"kind"` to every entry in `achievements.json` (derivable mechanically from the existing
   `actionType`/`milestoneType`/`commandKeyword`/`prerequisiteId` combination already present per
   entry — no new trigger is added yet). `game.store.ts` keeps its current internals untouched
   for this phase; only add the new files and unit-verify the engine reproduces the same
   unlock decisions as today for all 28 entries (can be checked by diffing engine output against
   the current `handleObserverEvent` logic for a scripted sequence of events — no test runner
   exists in this repo per `CLAUDE.md`, so this is a manual/scratch verification, not a committed
   test suite).
2. **Phase 2 — cut over `game.store.ts`.** Replace `handleObserverEvent`/`checkMilestones`/the
   platinum block with a call to `rewardEngine.processEvent`. Remove the 3 duplicated
   prerequisite checks. Verify via `pnpm typecheck` and a manual `pnpm dev` pass unlocking a few
   achievements (stage/unstage pair, one commit milestone, one terminal-keyword one) — this is a
   UI-adjacent change (Tauri app, not browser-testable per `CLAUDE.md`), so manual verification in
   the running app is required before merging.
3. **Phase 3 — reward effects.** Add `"effects"` to the JSON entries currently hardcoded in
   `AppearanceSection.tsx` (commit_100→amethyst, pr_10→forest, autosquash→cyberpunk,
   platinum_trophy→platinum) and to `CommitDetailsAvatar.tsx`'s achievement-driven frame (if any
   beyond the points-based one). Replace the hardcoded checks with the selector. Verify visually
   that the 4 themes still unlock/lock exactly as before.
4. **Phase 4 (optional, do only if it earns its keep) — tighten `AppEvent` payload typing.**
   Lower priority than 1-3; can be dropped if it turns out to churn every `notify()`/listener call
   site for marginal benefit — re-evaluate once phases 1-3 are done, same spirit as doc 13's
   self-corrections.

Each phase should land as its own PR, consistent with how doc 14's phases were merged
individually (batches of 2-4 related actions per PR, not one giant rewrite).

---

## Before/after: adding a genuinely new trigger kind

Concrete test of "is this actually extensible now" — take a trigger that doesn't fit the 3
existing kinds, e.g. **"unlock after committing on 7 different calendar days"**.

**Before (today)**: add a `commitDayStreak` counter to `GameState`, add a new `if (event ===
'commit')` branch inside `handleObserverEvent` to track distinct days, add a new branch in
`checkMilestones` (or inline) to compare against a threshold — 3 edits inside the shared,
already-crowded function, none of them purely additive.

**After (target)**: implement `class CommitDayStreakRule implements RewardRule`, register
`'commit_day_streak'` in `ruleRegistry.ts`, add one JSON entry:
```json
{ "id": "week_streak", "kind": "commit_day_streak", "streakDays": 7, "effects": [...] }
```
Zero edits to `actionRule.ts`, `milestoneRule.ts`, or any other existing rule file — genuinely
additive, which is what OCP asks for and what doc 13's target principles (R3) require before a
pattern earns its place.

---

## Non-goals

- Don't replace `appEventBus` — already the correct pattern per doc 13, confirmed still correct
  here.
- Don't introduce a test framework as part of this plan — out of scope (per `CLAUDE.md`, none
  exists in this repo today). The point of extracting a pure `rewardEngine` is that it becomes
  trivially testable **whenever** a runner is introduced later, not that tests are added now.
- Don't touch Rust/backend — the reward system has no IPC surface.
- Don't apply Builder (see "Explicitly rejected" above).
- Don't generalize `points` into a `RewardEffect` — it's a required scalar on every achievement,
  not an optional/plural unlock; turning it into an effect would add indirection with no
  consumer that needs it.

---

## Implementation status

Phases 1-3 implemented in one pass (not split into separate PRs as suggested above — the whole
change was small enough, ~450 lines across new files plus 2 edited files, to review as one unit).
Phase 4 deferred, see below.

### What was built

| File | Status |
|---|---|
| `apps/desktop/src/lib/rewards/types.ts` | new — `Achievement`, `AchievementDefinition`, `RuleKind`, `RewardEffect`, `RuleContext` |
| `apps/desktop/src/lib/rewards/rules/RewardRule.ts` | new — Strategy interface |
| `apps/desktop/src/lib/rewards/rules/ActionRule.ts` | new |
| `apps/desktop/src/lib/rewards/rules/MilestoneRule.ts` | new |
| `apps/desktop/src/lib/rewards/rules/TerminalKeywordRule.ts` | new |
| `apps/desktop/src/lib/rewards/rules/PairEventRule.ts` | new |
| `apps/desktop/src/lib/rewards/rules/CompositeRule.ts` | new |
| `apps/desktop/src/lib/rewards/ruleRegistry.ts` | new — `kind → RewardRule` lookup |
| `apps/desktop/src/lib/rewards/rewardEngine.ts` | new — `processEvent()`, `unlockAchievementById()` |
| `apps/desktop/src/lib/rewards/effects.ts` | new — `isEffectUnlocked`, `findEffectGate`, `getUnlockedEffects` |
| `apps/desktop/src/lib/rewards/README.md` | new — module-level docs, data-flow diagram, "how to add a reward" |
| `apps/desktop/src/stores/game.store.ts` | rewritten — thinned to state + persistence + a `processAppEvent` adapter over the engine; `handleObserverEvent`/`checkMilestones`/`unlockAchievement` removed (confirmed via repo-wide grep that nothing outside this file referenced them) |
| `apps/desktop/src/stores/achievements.json` | every entry gained `"kind"`; the 4 theme-gating achievements (`pr_10`, `commit_100`, `autosquash`, `platinum_trophy`) gained `"effects"` |
| `apps/desktop/src/app/settings/components/AppearanceSection.tsx` | the 4 hardcoded `if (themeId === ...)` checks replaced with `isEffectUnlocked`/`findEffectGate` |

`CommitDetailsAvatar.tsx` was **not** changed: re-reading it during implementation confirmed the
plan's own note that its avatar-frame logic is purely points-tier-driven (`getLevelInfo`), not a
second instance of the AppearanceSection-style hardcoded-id pattern — nothing to fix there beyond
what `getLevelInfo`/`getUnlockedEffects` already cover.

Verified: `pnpm --filter @git-manager/desktop typecheck` passes with zero errors. `pnpm lint`
fails for the same pre-existing, unrelated reason already documented in doc 14 (missing
`eslint.config.js`). No manual pass in the running app was performed as part of this session
(Tauri, not browser-testable per `CLAUDE.md`) — **recommended before merging**: stage then
unstage the same file, make a commit, run `git status`/`git log` in the embedded terminal, and
trigger an autosquash, to exercise all 5 rule kinds end-to-end.

### Corrections discovered while migrating (behavior preserved, not changed)

Converting each achievement's implicit trigger into an explicit `kind` required reading exactly
how each one currently unlocks, which surfaced two pre-existing quirks in the *old* code — both
preserved as-is (same runtime behavior), just made explicit instead of accidental:

1. **`open_launchpad`'s old `actionType: "open_launchpad"` never actually matched anything.**
   The direct-match loop compared `achievement.actionType === event`, but the real trigger event
   is `'open_app'` (`App.tsx` calls `appEventBus.notify('open_app')`) — so the field was dead,
   and the achievement only ever unlocked via a separate hardcoded
   `if (event === 'open_app') unlockAchievement('open_launchpad')` special case. Modeled now as
   `{ "kind": "action", "event": "open_app" }`, which is what actually fires it — the dead field
   is gone, the special case is gone, behavior is identical.
2. **`stage_unstage`'s old `actionType: "stage_unstage"` was equally dead** for the same reason
   (no event is ever literally named `'stage_unstage'`); the real trigger was the separate
   stage/unstage pair-tracking block. Modeled now as `{ "kind": "pair", "startEvent": "stage",
   "endEvent": "unstage" }`.

### Found, not fixed (out of scope — a behavior change, not a refactor)

`pr_1`/`pr_10`/`pr_50` are unreachable: they require a `pr_closed_or_merged` event that nothing
in the codebase ever emits (confirmed via `grep -rn "appEventBus.notify" apps/desktop/src` —
`pr_closed_or_merged` appears only in the type definition and the old/new rule logic, never in a
`.notify()` call). This bug predates this refactor and is preserved as-is; wiring up the missing
`.notify('pr_closed_or_merged')` call is a product decision (which PR-related UI action should
count?) that belongs in its own change, not silently bundled into an architecture refactor. See
`apps/desktop/src/lib/rewards/README.md` for the same note kept close to the code.

### Phase 4 — deferred

Tightening `AppEvent`/payload typing into a discriminated union was left undone: it would touch
every `notify()`/listener call site (`App.tsx`, `PullRequestsPage.tsx`, `game.store.ts`,
`api/git.api.ts`, `api/service.ts`) for a compile-time-only safety net on a bus that currently has
exactly one real subscriber. Matches the plan's own stated bar ("do only if it earns its keep") —
revisit only if `appEventBus` grows a second consumer or a payload-shape bug actually occurs.
