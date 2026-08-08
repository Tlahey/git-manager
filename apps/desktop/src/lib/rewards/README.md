# `lib/rewards/` — reward rule engine

Evaluates which achievements unlock in response to app events. Extracted out of
`stores/game.store.ts` so rule logic is a plain, framework-free module — no Zustand, no React —
that can be reasoned about (and eventually unit-tested) independently of the store that wraps it.

Full rationale, SOLID audit, and before/after examples:
[docs/architecture/2026-07-rewards-system-refactor.md](../../../../../docs/architecture/2026-07-rewards-system-refactor.md).

## Data flow

```
api/git.api.ts (callCommand)         stores/game.store.ts
stores/repoUI.store.ts (setActiveTab)        │  checkTerminalHistory() (polling)
        │  notify(event, payload)            │  → lib/rewards/terminalHistory.ts
        ▼                                     ▼  (only what the user ran since the last read)
                lib/appEventBus.ts  (Observer, pub/sub)
                        │
                        ▼
        stores/game.store.ts  .processAppEvent(event, payload)
                        │
                        ▼
        lib/rewards/rewardEngine.ts  .processEvent(state, event, payload)
                        │
              reads achievement definitions from stores/achievements.json
              (kind-discriminated, see types.ts)
                        │
              for each achievement: lib/rewards/ruleRegistry.ts .getRule(achievement.kind)
                        │
              one of: ActionRule | MilestoneRule | TerminalKeywordRule | PairEventRule
              (CompositeRule evaluated separately, see below)
                        │
                        ▼
        { nextState, newlyUnlocked, pendingComposites }
                        │
        game.store.ts merges nextState, shows a toast for newlyUnlocked,
        and defers pendingComposites by 1s (so the platinum-trophy toast
        doesn't collide with the toast of the achievement that completed the set)
```

## Files

| File                           | Role                                                                                                                                                                                                             |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `types.ts`                     | `Achievement`, `AchievementDefinition`, `RuleKind`, `RewardEffect`, `RuleContext` — no logic, just shapes.                                                                                                       |
| `rules/RewardRule.ts`          | The `RewardRule` Strategy interface (`matches`, optional `track`).                                                                                                                                               |
| `rules/ActionRule.ts`          | Unlocks on a specific one-shot `AppEvent` (`discard`, `fixup`, `autosquash`, `open_launchpad`).                                                                                                                  |
| `rules/MilestoneRule.ts`       | Unlocks once a counter (commits, PRs merged) crosses a threshold.                                                                                                                                                |
| `rules/TerminalKeywordRule.ts` | Unlocks the first time a terminal command containing a keyword is observed.                                                                                                                                      |
| `rules/PairEventRule.ts`       | Unlocks when an `endEvent` (e.g. `unstage`) fires for the same file a prior `startEvent` (e.g. `stage`) recorded. Stateful — the only rule using `track()`.                                                      |
| `rules/CompositeRule.ts`       | Meta-achievement: unlocks once every other achievement is unlocked (the platinum trophy).                                                                                                                        |
| `ruleRegistry.ts`              | `RuleKind → RewardRule` lookup. The only place that imports every concrete rule class.                                                                                                                           |
| `rewardEngine.ts`              | `processEvent()` (pure) and `unlockAchievementById()` (pure, the single place prerequisite-checking lives).                                                                                                      |
| `effects.ts`                   | Selectors (`isEffectUnlocked`, `findEffectGate`, `getUnlockedEffects`) over `Achievement.effects`, used by UI code (theme picker, ...) that needs to know what an achievement unlocks without hardcoding its id. |
| `terminalHistory.ts`           | `diffHistorySources()` / `appendedCommands()` — which lines of the shell history the user ran _since the app last looked_, per history file, so a `terminal_command` event stands for a command they typed rather than for the file's contents. |

## Adding a new achievement

**Reusing an existing trigger kind** (most common case): add one entry to
`stores/achievements.json`. No code change. Example — a new terminal-keyword achievement:

```json
{
  "id": "terminal_reflog",
  "title": "Fouilleur de Reflog",
  "description": "Exécuter 'git reflog' dans le terminal.",
  "points": 25,
  "type": "silver",
  "difficulty": "intermediate",
  "kind": "terminal_keyword",
  "milestoneType": "terminal_command",
  "milestoneValue": 1,
  "commandKeyword": "git reflog",
  "rewardDescription": "Amélioration d'XP"
}
```

**A genuinely new trigger kind** (nothing today's 5 kinds can express, e.g. "commit on 7
different calendar days"): implement a new `RewardRule` in `rules/`, register it in
`ruleRegistry.ts`, add `'my_new_kind'` to `RuleKind` in `types.ts`. No existing rule file changes.
See the worked example in the plan doc linked above.

**A new cosmetic reward** (theme, avatar frame) gated by an achievement: add an `effects` entry
to that achievement in `achievements.json` — `{ "type": "theme", "id": "my-theme-id" }` — and
call `isEffectUnlocked(achievements, 'theme', 'my-theme-id')` from the UI. No `RewardRule` change
needed; effects are a separate, orthogonal concept from triggers.

## Every event must be something the user did

An achievement is a claim about the user's behaviour, so the engine can only be as honest as the
events it is fed — `ActionRule` in particular treats the event *as* the whole condition. Two
triggers used to break that and are worth knowing about, because both are easy to re-introduce:

- **The shell history is a file, not an action.** `checkTerminalHistory()` used to replay every
  command the history held, so opening the Rewards tab unlocked `git diff`, `git log`, `git bisect`
  and friends on the spot — for commands typed weeks earlier, in another project. It now baselines
  on its first read and only reports what got appended since ([terminalHistory.ts](terminalHistory.ts)).
  Same reason `resetGameProgress()` sets the snapshot to `null` and not `{}`, and that a read which
  came back empty is treated as no read at all.
  The corollary is that the backend reports **one entry per history file** and each is diffed on its
  own: appending to a merged `.zsh_history` + `.bash_history` list inserts in the *middle*, which
  reads as a rewritten history and credits nobody. Merging them back would silently make every
  terminal achievement unreachable for anyone with git commands in both files.
- **A mount is not a gesture.** `open_launchpad` used to fire from `App.tsx`'s mount effect (as
  `open_app`), so launching the app — or a dev hot-reload — earned "Open the app's Launchpad". It is
  raised from `repoUI.store`'s `setActiveTab` now, which every way into the Launchpad goes through.

So: raise a reward event from the handler of the gesture, never from a `useEffect`, a poll, a
refresh or a state restore. See the invariant recorded in [appEventBus.ts](../appEventBus.ts).

## Known limitations (carried over from the pre-refactor code, not introduced by it)

- **`pr_1`/`pr_10`/`pr_50` are currently unreachable.** They unlock on a `pr_closed_or_merged`
  `AppEvent` ([appEventBus.ts](../appEventBus.ts)), but nothing in the codebase calls
  `appEventBus.notify('pr_closed_or_merged', ...)` — grep confirms zero call sites. This predates
  this refactor (the same dead path existed in the old `handleObserverEvent`); wiring it up is a
  product decision (which UI action should count as "PR closed or merged"?) and is out of scope
  here — flagging it so it isn't mistaken for a regression.
- `checkTerminalHistory()` still reads the shell history file via polling (every 4s while the
  Rewards tab is open) rather than a push mechanism — unchanged from before, not part of this
  refactor's scope. Two consequences of that, both deliberate: a terminal achievement is only ever
  noticed while the Rewards tab is open (the command still counts, just later — the snapshot spans
  sessions), and a command is invisible until the shell actually writes it to the file, which zsh
  defers to shell exit unless `INC_APPEND_HISTORY`/`SHARE_HISTORY` is set.
