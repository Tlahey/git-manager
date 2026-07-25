# Architecture documents

Refactor plans and their execution records. Unlike [`../specs/archive/`](../specs/archive/README.md),
these documents were kept up to date while the work happened and each one states its own status
at the top — but **all five refactors are now complete**, so they are records of decisions taken,
not a to-do list.

For the current architecture rules, read [CLAUDE.md](../../CLAUDE.md); it is the authoritative
source and is what a PR is checked against.

| Document                                                              | Scope                                                       | Status                                                        |
| --------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------- |
| [13 — Architecture refactor plan](./13-architecture-refactor-plan.md) | Splitting rules (R1/R2), patterns, prioritised roadmap      | Fully executed — still useful as the rationale for the rules  |
| [14 — Execution tracking](./14-architecture-refactor-tracking.md)     | Action-by-action breakdown of plan 13, with a dated journal | **36 / 36 actions done**                                      |
| [15 — Rewards system](./15-rewards-system-refactor-plan.md)           | SOLID audit of the achievements/gamification stack          | Phases 1–3 done; phase 4 (`AppEvent` payload typing) deferred |
| [16 — Panels & interaction](./16-panels-interaction-refactor-plan.md) | Panel/menu/anchoring duplication                            | All 14 actions done (2026-07-03)                              |
| [17 — Notification system](./17-notification-system-refactor-plan.md) | Notification registry + tray and hide-on-close delivery     | Both parts done (2026-07-03)                                  |

## Why they are kept

Document 14 is referenced from [CLAUDE.md](../../CLAUDE.md) as the record of _what was extracted
and why_ — in particular the audit that found and fixed 27 places where a component bypassed the
`api/*.api.ts` layer, which is the reason that layering rule is stated as a hard invariant rather
than a style preference. Documents 15–17 each close with an "Implementation status" section
describing what was actually built and where it deviated from the original sketch; that is the
part worth reading before touching those subsystems.

The one genuinely open item across all five is **phase 4 of document 15** (tightening `AppEvent`
payload typing), which was deliberately deferred.
