# Daily summary

A short stand-up briefing per repository: what landed on the project's main branch in the last
working day, and what to pick up next. The one AI feature that runs **without being asked** — once
each morning — and the only one whose output is **archived on disk** for two months.

> Shared plumbing — transport, events, cancellation, errors, settings — lives in the
> [AI system overview](./README.md). This page covers only what is specific to this feature.
> Searching the archive is its own feature: see [summary search](./summary-search.md).

| | |
| --- | --- |
| **Descriptors** | [`fileSummaryFeature`](../../packages/ai/src/features/fileSummary.ts) (map) → [`dailySummaryFeature`](../../packages/ai/src/features/dailySummary.ts) (reduce) |
| **Orchestrator** | [`composeDailySummaryFromSummaries`](../../packages/ai/src/features/composeDailySummary.ts) |
| **Kind** | completion + JSON schema → `DailySummary` |
| **Temperature** | 0.3 (reduce), 0.1 (map) |
| **Context** | `get_ai_activity` (the window) **plus** `get_ai_context` at `range` scope (the window's diff) |
| **UI** | ✨ per project on the dashboard → [`DailySummaryPanel`](../../apps/desktop/src/app/dashboard/components/DailySummaryPanel.tsx), the morning auto-run, and the archive panel → *AI ▸ Daily summaries* in a repo ([`DailySummariesPanel`](../../apps/desktop/src/components/git-graph/DailySummariesPanel.tsx)) |

---

## What the user sees

Three fields, rendered as a small panel on a dashboard project, and archived as markdown:

- **headline** — one plain sentence recapping the period;
- **yesterday** — 2–6 bullets of what was actually accomplished;
- **today** — 2–5 concrete next steps.

A green dot marks a project whose briefing is fresh. Clicking ✨ regenerates on demand.

Past briefings are browsed **per repository**, from the toolbar's **AI menu** (the LLM icon, its own
zone next to Tools) ▸ *Daily summaries*, which opens the archive in the graph's right-hand panel.
There, a **date field** picks the day to explore, and the generate button sits beside it — because
the date is that button's argument, generation is disabled until a day is chosen. Repo-scoped rather than a global page: a briefing
is about one project, and the question you ask of it ("when did I finish X here?") is asked while
looking at that project's history. The panel claims the same single right-hand slot as the AI
explanations — they share `aiPanelTarget` in `repoUI.store`, which is what guarantees only one of
them can hold it.

---

## Three decisions that define the feature

### 1. The main branch, not HEAD

The window is taken over the first resolvable entry of the repo's main-branch candidate list
(`origin/main`, `origin/master`, … — the same `targetBranches` the merge-target indicator uses),
falling back to HEAD when none exists so a repo with no remote still works.

A briefing about "what landed yesterday" that silently described whichever feature branch happened to
be checked out would answer a different question every morning, and the answer would depend on
something the reader can't see.

### 2. It reads the files, not the commit messages

The map phase (`summarizeFiles` → `fileSummaryFeature`, one small call per changed file) runs before
the composing call, the same shape as the commit message and the explanations.

A briefing built from commit subjects inherits whatever the author wrote — and the commits that most
need summarizing are exactly the ones whose subjects say the least (`wip`, `review fixes`, `oops`).
Reading the code is what makes the archive worth searching two months later instead of being a
reformatted `git log`. The instruction tells the model to **prefer the summaries over the subjects
when the two disagree**.

### 3. A quiet day produces nothing at all

When the window holds no commits — or commits that changed no files —
[`generateDailySummary`](../../apps/desktop/src/lib/generateDailySummary.ts) returns `null`
**before any model call**: no tokens, no file, no entry.

Asking the model to write "nothing happened today" costs a full run per quiet project, and with a
dozen projects auto-running every morning most of them are quiet on any given day. It also leaves
two months of empty entries to scroll past. The panel reports the skip as its own state, so a quiet
repository never looks like a broken provider.

---

## A briefing is about one calendar day

Not "the last N hours". The window is `[local midnight, 23:59:59]` of a specific date, the file is
named after that date, and the date is an **argument** — the panel's date field, or the previous
working day for the morning run.

It used to be a rolling window filed under the day it was *written*, which meant a file named Tuesday
describing Monday's work: readable the morning you generated it, confusing two months later in an
archive you are searching by date. It also made "summarize last Thursday" unexpressible.

The day logic is pure and unit-tested in
[`dailySummaryWindow.ts`](../../apps/desktop/src/lib/dailySummaryWindow.ts) — no React, no Tauri:

| Helper | Job |
| ------ | --- |
| `localDateKey(date)` | the `YYYY-MM-DD` a briefing is filed under — **local**, not `toISOString()`, which would file an evening briefing under tomorrow west of Greenwich |
| `dayBounds(key)` | the epoch-second bounds the backend walks — built with the local `Date` constructor, since `Date.parse('2026-07-27')` is *UTC* midnight and lands on a different day in any non-zero offset |
| `previousWorkingDayKey(now)` | what the morning run targets: Monday reaches back over the weekend to Friday, so a fresh week doesn't open on a day nobody worked |
| `isSummaryStale(dates)` | whether the previous working day is missing from the archive — drives the "regenerate?" dot and the auto-run |

The frontend owns all of it because only it knows the user's clock and time zone; Rust receives two
absolute timestamps and stays a pure git query.

## The morning auto-run

[`useMorningSummaries`](../../apps/desktop/src/hooks/useMorningSummaries.ts) regenerates stale
briefings the first time the launchpad mounts in a session. It is careful in four ways, and each is
deliberate:

- **Reads the archive first**, so a briefing written this morning by a previous session isn't
  regenerated after a restart.
- **One repository at a time** — each briefing is already N+1 calls, so overlapping two of them would
  multiply the load by a factor nobody chose. Concurrency *inside* a briefing is the *Calls in
  flight* setting's business ([why it lives there](./README.md#reading-several-at-once)).
- **Once per path per session** — success, *skip* or failure — no retry loops against a
  misconfigured provider.
- **A failing project doesn't block the others**; you can retry it by hand from the panel.

It only runs over a bounded set (open tabs + favourites), never every discovered repo, and it obeys
both the AI master switch and its own `dailySummary.autoGenerate` setting.

---

## The context

Two calls, because the window is both a *list of commits* and a *diff*:

**`get_ai_activity`** ([ai_activity.rs](../../apps/desktop/src-tauri/src/services/ai_activity.rs))
walks the resolved main branch newest-first and collects the following. **Both** bounds matter: the
walk starts at the branch tip, usually far newer than the day asked about, so anything past
`until_epoch` is skipped on the way down rather than ending the walk.

| | |
| --- | --- |
| **commits** | non-merge commits whose **author time** falls within `[since_epoch, until_epoch]`, with subject, body, and `filesChanged/insertions/deletions`. Capped at 50 — newest win, and `truncated: true` tells the prompt it saw a sample |
| **pending** | a light snapshot of uncommitted work (path + status), so "today" can be grounded in what's in flight |
| **baseOid / headOid** | the two ends of the window: the first parent of the oldest collected commit, and the newest one |

**`get_ai_context`** at `range` scope over `baseOid..headOid` then yields the window's diff and file
list. No new Rust diff path was needed: `build_ai_context`'s `merge_base(base, head)` collapses to
`baseOid`, since it is an ancestor of `headOid` by construction. Keeping the boundary at the
*collected* oldest commit (not the window's true oldest) is what makes the diff match `commits` even
when the walk stopped early at the 50-commit cap.

Merge commits are skipped: their auto-generated subjects don't describe authored work.

---

## The prompt

**System** — `DAILY_SUMMARY_INSTRUCTION`, which is mostly about restraint: group the files by the
area they serve into one outcome-focused bullet per theme rather than restating every commit or file;
describe impact, not hashes or paths; prefer the file summaries over the commit subjects; and **never
invent work that has no basis in the data**.

**User** — the repo and main branch, the day being summarized, the commits (with stats and bodies),
the pending files, a note when the window was truncated, the target language, and then a summary of
every file the window touched (trimmed by `renderSummaryList`, which drops *detail* before it drops
*files*).

`DAILY_SUMMARY_SCHEMA` constrains the output to `{ headline, yesterday[], today[] }`.
`parseDailySummary` tolerates prose or fences around the JSON, coerces the lists to clean non-empty
strings, and throws only when *all three* fields are empty. Structured output rather than a stream,
for the same reason the commit message uses one: this text is stored and re-read weeks later, so a
reasoning model's deliberation leaking into it is a permanent defect, not a transient one.

## Language

The output is prose the user reads in their own language, so the UI language (`settings.language`)
is injected into the prompt (`Write the entire briefing in French.`). It's a frontend concern — Rust
never sees it.

**Both phases are asked, not just the composing one.** The per-file summaries are the only evidence
the composing call ever sees, so requesting French while handing it English `intent`/`area` clauses
produced French sentences with English fragments surviving verbatim — the area labels especially.
`composeDailySummaryFromSummaries` therefore wraps the summarize runner to pass `language` down.

The wrapping happens there rather than inside `summarizeFiles` on purpose: the commit-writing paths
share that function, and a commit message follows the repository's convention — usually English.
`FileSummaryInput.language` is optional and stays undefined for them, so their prompt is unchanged.

---

## The archive

Each briefing is written as a markdown file, so it can be opened in an editor, grepped, or kept after
uninstalling the app. [`daily_summary_archive.rs`](../../apps/desktop/src-tauri/src/services/daily_summary_archive.rs)
owns the layout; [`dailySummaryMarkdown.ts`](../../apps/desktop/src/lib/dailySummaryMarkdown.ts) owns
the format (render **and** parse, round-trip tested).

```text
~/.git-manager/summaries/<repo-name>-<path-hash>/YYYY-MM-DD.md
```

The path hash disambiguates two checkouts of the same project. Files older than **60 days** are
pruned on every write.

```md
---
repo: git-manager
repoPath: /Users/antoine/Workspace/git-manager
date: 2026-07-27
branch: origin/main
generatedAt: 2026-07-27T08:12:03.000Z
commits: 7
files: 12
---

# 2026-07-27 — git-manager

Shipped the summaries archive

## Yesterday

- …

## Today

- …
```

The front matter is a flat `key: value` block, hand-parsed on both sides — no YAML crate, no library
needed to read it. Section headings are English and fixed: this is a file format, not UI copy, so
switching the app's language must not orphan an existing archive. The parser tolerates a hand-edited
file (missing front matter, `*` bullets, CRLF, reordered keys) and degrades instead of throwing; a
file with no usable date is skipped rather than failing the whole archive.

**The file is the source of truth.** [`dailySummary.store.ts`](../../apps/desktop/src/stores/dailySummary.store.ts)
is an in-memory index rebuilt from disk, deliberately **not** persisted — a `localStorage` copy would
only be a second version of the same text waiting to disagree with the first.

### The optional in-repo copy

`dailySummary.saveToRepo` (off by default) also writes each briefing to
`<repo>/.git-manager/summaries/`, so the archive travels with the project. Enabling it registers
`.git-manager/` in **`.git/info/exclude`** — the local, never-committed ignore file — rather than the
project's own `.gitignore`: turning on a convenience feature in this app must not produce a diff in
the user's repository, and untracked files in a git client's own repos are a visible regression.

---

## Limitations

Beyond the [shared ones](./README.md#known-limitations):

| Limitation | Note |
| ---------- | ---- |
| **Not filtered by author** | It reports every non-merge commit in the window, including teammates' commits merged in. On an active shared branch, "what *I* did yesterday" is diluted |
| **Main branch only** | Work sitting on an unmerged feature branch is invisible; it appears the day it lands |
| **50-commit cap** | A very busy window is summarized from a sample; the prompt is told, but the result is still partial |
| **Cost scales with the day** | One model call per file changed in the window, plus one. A 60-file day is a 61-call run — bounded, but not instant |
| **Retention is fixed at 60 days** | Not user-configurable; older files are pruned on the next write |

## Tests

| Test | Covers |
| ---- | ------ |
| [`dailySummary.test.ts`](../../packages/ai/src/features/dailySummary.test.ts) | prompt shape, file-summary evidence, language, parse tolerance |
| [`composeDailySummary.test.ts`](../../packages/ai/src/features/composeDailySummary.test.ts) | map→reduce orchestration, progress, cancellation, per-file failure |
| [`dailySummaryWindow.test.ts`](../../apps/desktop/src/lib/dailySummaryWindow.test.ts) | the weekend rule, the local date key, staleness |
| [`dailySummaryMarkdown.test.ts`](../../apps/desktop/src/lib/dailySummaryMarkdown.test.ts) | the file format, round trip, hand-edited tolerance |
| [`generateDailySummary.test.ts`](../../apps/desktop/src/lib/generateDailySummary.test.ts) | end-to-end orchestration, the skip rule, the archive write |
| [`dailySummary.store.test.ts`](../../apps/desktop/src/stores/dailySummary.store.test.ts) | hydration from disk, per-day indexing, deletion |
| [`useMorningSummaries.test.ts`](../../apps/desktop/src/hooks/useMorningSummaries.test.ts) | sequential run, once-per-session, failure isolation |
| [`DailySummaryPanel.test.tsx`](../../apps/desktop/src/app/dashboard/components/DailySummaryPanel.test.tsx) | rendering, progress, the skip state, the regenerate action |
| [`DailySummariesPanel.test.tsx`](../../apps/desktop/src/components/git-graph/DailySummariesPanel.test.tsx) | repo scoping (list *and* model shortlist), filters, actions |
| `ai_activity.rs` / `daily_summary_archive.rs` tests | branch resolution, window boundary, retention, the exclude entry |
