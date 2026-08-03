# Architecture documents

Refactor plans and their execution records. These documents were kept up to date while the work
happened and each one states its own status at the top — but **all five refactors are now
complete**, so they are records of decisions taken, not a to-do list.

For the current architecture rules, read [CLAUDE.md](../../CLAUDE.md); it is the authoritative
source and is what a PR is checked against.

| Document                                                                      | Scope                                                          | Status                                                        |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------- |
| [Architecture refactor plan](./2026-07-architecture-refactor-plan.md)         | Splitting rules (R1/R2), patterns, prioritised roadmap         | Fully executed — still useful as the rationale for the rules  |
| [Architecture refactor tracking](./2026-07-architecture-refactor-tracking.md) | Action-by-action execution record of that plan, with a journal | **36 / 36 actions done** (2026-07-02 → 07-11)                 |
| [Rewards system](./2026-07-rewards-system-refactor.md)                        | SOLID audit of the achievements/gamification stack             | Phases 1–3 done; phase 4 (`AppEvent` payload typing) deferred |
| [Panels & interaction](./2026-07-panels-interaction-refactor.md)              | Panel/menu/anchoring duplication                               | All 14 actions done (2026-07-03)                              |
| [Notification system](./2026-07-notification-system-refactor.md)              | Notification registry + tray and hide-on-close delivery        | Both parts done (2026-07-03)                                  |

## Naming

`<year>-<month>-<subject>.md`. The date is the month the work happened, and it is part of the
point: these are records, and a record that does not say when it was true invites being read as
current. A new refactor gets a new dated file rather than an edit to one of these.

(They were previously numbered 13–17, continuing a `docs/specs/` series that no longer exists —
which left a folder starting at 13 with no 1–12 anywhere.)

## Why they are kept

The [execution tracking](./2026-07-architecture-refactor-tracking.md) is referenced from
[CLAUDE.md](../../CLAUDE.md) as the record of _what was extracted and why_ — in particular the audit
that found and fixed 27 places where a component bypassed the `api/*.api.ts` layer, which is the
reason that layering rule is stated as a hard invariant rather than a style preference. The three
subsystem audits each close with an "Implementation status" section describing what was actually
built and where it deviated from the original sketch; that is the part worth reading before touching
those subsystems.

The one genuinely open item across all five is **phase 4 of the
[rewards audit](./2026-07-rewards-system-refactor.md)** (tightening `AppEvent` payload typing),
which was deliberately deferred.
