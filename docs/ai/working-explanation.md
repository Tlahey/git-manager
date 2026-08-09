# Working-changes explanation

Summarizes everything currently uncommitted — "what am I in the middle of?".

> Shared plumbing — transport, events, cancellation, errors, settings — lives in the
> [AI system overview](./README.md). This page covers only what is specific to this feature.

|                   |                                                                                                                                                                                                                               |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Descriptor**    | [`summaryExplanationFeature`](../../packages/ai/src/features/summaryExplanation.ts) (`scope: 'working'`), fed by [`summarizeFiles`](../../packages/ai/src/features/summarizeFiles.ts)                                         |
| **Kind**          | streaming markdown                                                                                                                                                                                                            |
| **Temperature**   | 0.2                                                                                                                                                                                                                           |
| **Context scope** | `working` — worktree vs HEAD, untracked included                                                                                                                                                                              |
| **Diff budget**   | none at this level: every file is read whole, in its own prompt, by the map phase                                                                                                                                             |
| **UI**            | [`WorkingExplanationPanel`](../../apps/desktop/src/features/graph/components/WorkingExplanationPanel.tsx) — right panel — via [`useWorkingExplanation`](../../apps/desktop/src/features/graph/hooks/useWorkingExplanation.ts) |
| **Memory**        | **none** — see below                                                                                                                                                                                                          |

---

## What the user sees

Right-click the **WIP row** in the graph → **Explain working changes (LLM)**. The right panel opens
and starts generating immediately.

The menu item had existed since long before the AI features, permanently greyed out as a placeholder
for a feature nobody had built. It is now wired, and disabled only for the two reasons that make it
meaningless: **a clean working tree** (nothing to summarize) or **AI switched off**.

---

## Separating the work, not merging it

The distinguishing instruction. An uncommitted tree is rarely one thing — it is a half-finished
feature, plus a fix you made along the way, plus a stray formatting change. Rolling that into one
tidy paragraph is the failure mode, so the prompt says the opposite:

> The working tree usually holds several unrelated things at once. Separating them is the most useful
> thing you can do.

and asks the opening sentence to admit it when the work is genuinely several unrelated things rather
than pretending it is one.

The file **statuses** are in the prompt alongside the diff for the same reason: an `untracked` file
is a brand-new one, possibly one the developer never meant to leave lying around. The `⚠️` line is
scoped to exactly that kind of thing — debug output, a commented-out block, a hardcoded secret, a
stray file — i.e. _"don't commit this as-is"_, not a code review.

## Related, but different

Four features can read uncommitted work; they answer different questions:

| Feature                                       | Question                                 | Scope                              |
| --------------------------------------------- | ---------------------------------------- | ---------------------------------- |
| **Working explanation** (this one)            | what am I in the middle of?              | every uncommitted file             |
| [Change explanation](./change-explanation.md) | what does this change do to _this file_? | one file, read against its content |
| [Code review](./code-review.md)               | is any of this a problem?                | every uncommitted file             |
| [File grouping](./file-grouping.md)           | how do I split this into commits?        | every uncommitted file, as data    |

The code review is the closest neighbour and the sharpest contrast: it consumes the _same_ `working`
context as this feature, and its instruction asks for precisely what this one forbids. The `⚠️` line
here is scoped to "don't commit this as-is" (debug output, a stray secret) — noticing, not judging.
Anything beyond that is the review's job.

Working explanation and file grouping consume the _same_ `working` context; one produces prose to
read, the other a commit plan to act on.

---

## Why it remembers nothing

The branch and commit summaries are persisted ([`aiExplanation.store`](../../apps/desktop/src/features/graph/stores/aiExplanation.store.ts));
this one deliberately is not.

A commit is immutable and a branch moves in discrete, detectable steps. The working tree changes
with every keystroke, and there is nothing to compare against to notice — no sha, no ref that moved.
A stored summary of _your own uncommitted work_, shown as though it were current, is worse than
waiting a minute for a fresh one: it is the one case where the reader has no way to tell it is stale.

So the panel regenerates on every open. The hook still returns the same shape as the other two
(`generatedAt: null`, `hasStored: false`), which is what lets it drive the shared
[`ExplanationPanelShell`](../../apps/desktop/src/features/graph/components/ExplanationPanelShell.tsx)
unchanged — the shell reads those as "no age line" and "always generate on open".

---

## Limitations

Beyond the [shared ones](./README.md#known-limitations):

| Limitation                             | Note                                                                                                                                                                                                                                                                                                                           |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **A big tree is still read partially** | The case most likely to hit the budget: a big messy tree is exactly when you reach for this. The file list is sent whole and declared as the authority on _how many separate pieces of work_ there are — which is the number this feature exists to get right — so what a small window costs is depth per piece, not the count |
| **Staged and unstaged are merged**     | The `working` scope is one diff against HEAD, so the summary can't tell you what is ready to commit versus what is still being written                                                                                                                                                                                         |
| **No memory, by design**               | Every open costs a fresh generation. Deliberate (above), but it does mean reopening the panel is never instant                                                                                                                                                                                                                 |
| **Untracked files are included whole** | A large new file competes for the same pool as everything else. It is classified by path like any other file, so a new lockfile or generated artifact sorts last rather than eating the allowance                                                                                                                              |

## Tests

| Test                                                                                                                    | Covers                                                                                                                                                                                                                      |
| ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`workingExplanation.test.ts`](../../packages/ai/src/features/workingExplanation.test.ts)                               | prompt shape, file statuses, language, window-sized budget (fits every window, the file list survives the smallest window because the count comes from it, code before noise), coverage, and the instruction's coverage ban |
| [`useWorkingExplanation.test.ts`](../../apps/desktop/src/features/graph/hooks/useWorkingExplanation.test.ts)            | working scope, streaming, clean-tree refusal, and that nothing is persisted                                                                                                                                                 |
| [`WorkingExplanationPanel.test.tsx`](../../apps/desktop/src/features/graph/components/WorkingExplanationPanel.test.tsx) | auto-start, no age line, error decoding                                                                                                                                                                                     |
| [`graphContextMenus.test.ts`](../../apps/desktop/src/lib/graphContextMenus.test.ts)                                     | the WIP menu item's action, and both reasons it disables                                                                                                                                                                    |

---

## Read file by file

The summary is written from **per-file summaries**, never from a budgeted diff — the same shape as
every other feature that reads a changeset, and the only shape there is.

It matters more here than almost anywhere. This summary's job is to say how many _separate_ things
are in progress, and a model shown a third of the files will confidently name a third of the work —
producing an answer that is not vaguer but wrong, in the one dimension the feature exists for.

The panel shows the per-file count while the map phase runs, in place of the coverage line: there is
no budgeted prompt left to caveat, and what the reader needs is a reason for the wait before the
first token. Cancelling stops the map at its next call boundary.
