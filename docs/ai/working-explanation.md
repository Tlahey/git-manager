# Working-changes explanation

Summarizes everything currently uncommitted — "what am I in the middle of?".

> Shared plumbing — transport, events, cancellation, errors, settings — lives in the
> [AI system overview](./README.md). This page covers only what is specific to this feature.

| | |
| --- | --- |
| **Descriptor** | [`workingExplanationFeature`](../../packages/ai/src/features/workingExplanation.ts) |
| **Kind** | streaming markdown |
| **Temperature** | 0.2 |
| **Context scope** | `working` — worktree vs HEAD, untracked included |
| **Diff budget** | 8000 chars |
| **UI** | [`WorkingExplanationPanel`](../../apps/desktop/src/components/git-graph/WorkingExplanationPanel.tsx) — right panel — via [`useWorkingExplanation`](../../apps/desktop/src/hooks/useWorkingExplanation.ts) |
| **Memory** | **none** — see below |

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
stray file — i.e. *"don't commit this as-is"*, not a code review.

## Related, but different

Three features can read uncommitted work; they answer different questions:

| Feature | Question | Scope |
| ------- | -------- | ----- |
| **Working explanation** (this one) | what am I in the middle of? | every uncommitted file |
| [Change explanation](./change-explanation.md) | what does this change do to *this file*? | one file, read against its content |
| [File grouping](./file-grouping.md) | how do I split this into commits? | every uncommitted file, as data |

Working explanation and file grouping consume the *same* `working` context; one produces prose to
read, the other a commit plan to act on.

---

## Why it remembers nothing

The branch and commit summaries are persisted ([`aiExplanation.store`](../../apps/desktop/src/stores/aiExplanation.store.ts));
this one deliberately is not.

A commit is immutable and a branch moves in discrete, detectable steps. The working tree changes
with every keystroke, and there is nothing to compare against to notice — no sha, no ref that moved.
A stored summary of *your own uncommitted work*, shown as though it were current, is worse than
waiting a minute for a fresh one: it is the one case where the reader has no way to tell it is stale.

So the panel regenerates on every open. The hook still returns the same shape as the other two
(`generatedAt: null`, `hasStored: false`), which is what lets it drive the shared
[`ExplanationPanelShell`](../../apps/desktop/src/components/git-graph/components/ExplanationPanelShell.tsx)
unchanged — the shell reads those as "no age line" and "always generate on open".

---

## Limitations

Beyond the [shared ones](./README.md#known-limitations):

| Limitation | Note |
| ---------- | ---- |
| **8000-char diff budget** | The case most likely to overflow it: a big messy tree is exactly when you reach for this. Beyond the budget the summary leans on the file list and a partial diff |
| **Staged and unstaged are merged** | The `working` scope is one diff against HEAD, so the summary can't tell you what is ready to commit versus what is still being written |
| **No memory, by design** | Every open costs a fresh generation. Deliberate (above), but it does mean reopening the panel is never instant |
| **Untracked files are included whole** | A large new file consumes the budget as fast as it can be read |

## Tests

| Test | Covers |
| ---- | ------ |
| [`workingExplanation.test.ts`](../../packages/ai/src/features/workingExplanation.test.ts) | prompt shape, file statuses, truncation, language |
| [`useWorkingExplanation.test.ts`](../../apps/desktop/src/hooks/useWorkingExplanation.test.ts) | working scope, streaming, clean-tree refusal, and that nothing is persisted |
| [`WorkingExplanationPanel.test.tsx`](../../apps/desktop/src/components/git-graph/WorkingExplanationPanel.test.tsx) | auto-start, no age line, error decoding |
| [`graphContextMenus.test.ts`](../../apps/desktop/src/lib/graphContextMenus.test.ts) | the WIP menu item's action, and both reasons it disables |
