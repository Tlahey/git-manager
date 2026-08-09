# Commit explanation

Explains what a single commit actually does — beyond what its message claims.

> Shared plumbing — transport, events, cancellation, errors, settings — lives in the
> [AI system overview](./README.md). This page covers only what is specific to this feature.

|                 |                                                                                                                                                                                                       |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Descriptor**  | [`summaryExplanationFeature`](../../packages/ai/src/features/summaryExplanation.ts) (`scope: 'commit'`), fed by [`summarizeFiles`](../../packages/ai/src/features/summarizeFiles.ts)                  |
| **Kind**        | streaming markdown                                                                                                                                                                                    |
| **Temperature** | 0.2                                                                                                                                                                                                   |
| **Input**       | `get_commit_diff` (the commit vs its first parent) + the commit's own message + the complete changed-file list                                                                                        |
| **Diff budget** | none at this level: every file is read whole, in its own prompt, by the map phase                                                                                                                     |
| **UI**          | [`CommitExplanationPanel`](../../apps/desktop/src/features/graph/components/CommitExplanationPanel.tsx) — right panel — via [`useCommitExplanation`](../../apps/desktop/src/features/graph/hooks/useCommitExplanation.ts) |
| **Memory**      | [`aiExplanation.store`](../../apps/desktop/src/features/graph/stores/aiExplanation.store.ts), persisted per repo + commit, coverage included                                                                         |

---

## Why it exists

The branch summary answers _"what is this branch about?"_. It was, for a while, the only explain
action on a commit's right-click menu — and on a commit carrying no branch label, the menu falls
back to the **current** branch. So right-clicking an old unrelated commit offered to explain whatever
branch you happened to be standing on. That is a reasonable rule for pull/push/merge (they _are_
relative to HEAD); for "explain", it answers a question nobody asked.

This feature answers the one that was asked: **what does this commit, the one I just clicked, do?**

Both now sit in the commit menu, scoped differently:

| Menu item                      | Scope                            | Shown when                                          |
| ------------------------------ | -------------------------------- | --------------------------------------------------- |
| _Explain this commit (LLM)_    | the clicked commit vs its parent | any single commit                                   |
| _Explain branch changes (LLM)_ | the whole branch vs its base     | the commit carries a branch (or from the sidebar)   |
| _Review branch changes (LLM)_  | the whole branch vs its base     | same as above — see [code review](./code-review.md) |

The commit item is absent from the multi-selection layout, where "this commit" is ambiguous. There is
deliberately **no per-commit review**: a commit that is already in history is not a change you are
about to ship, and the actionable moment — before committing, before opening the PR — is what the two
review scopes cover.

---

## What the user sees

Right-click a commit → **Explain this commit (LLM)**. The right panel opens on that commit and starts
generating — unless a summary is already remembered, in which case that one is shown immediately.
Same panel chrome, memory and regenerate button as the [branch explanation](./branch-explanation.md);
they share
[`ExplanationPanelShell`](../../apps/desktop/src/features/graph/components/ExplanationPanelShell.tsx),
which owns that auto-start rule for both.

The item sits directly beside _Explain branch changes (LLM)_ when the commit carries a branch — the
two answer neighbouring questions and belong together — but stays at the **top level** of the menu
rather than inside a per-branch submenu: it is commit-scoped, and nested it would appear once per
branch, every copy meaning the same thing.

The header always states what the diff was taken against, because it is not always the obvious
thing:

| Commit   | Header says                                   |
| -------- | --------------------------------------------- |
| ordinary | _compared to its parent commit_               |
| merge    | _merge commit — compared to its first parent_ |
| root     | _root commit — compared to an empty tree_     |

---

## Not paraphrasing the message

The distinguishing constraint of this feature. A commit already carries a message, so repeating it
back adds nothing — the instruction says so outright:

> The commit's own message is given to you. Do NOT paraphrase it back — the reader can see it.

Its value is highest exactly where the message is worst: a terse subject, a squashed branch, an old
`fix stuff`. So the model is also told to flag the mismatch when there is one:

> If the diff plainly does something other than what the message claims, say so in one short
> sentence.

The message is still _in_ the prompt — you cannot notice a mismatch without it — it is just not the
answer.

---

## No backend change

This is the cheapest feature in the app to add, and worth noting as a pattern:

```mermaid
flowchart LR
    A["get_commit_diff<br/><i>existing command</i>"] --> B["GitDiffFile[]<br/><i>structured hunks</i>"]
    B --> C["formatUnifiedPatch<br/><i>existing helper</i>"]
    C --> D["patch text"]
    D --> E["commitExplanationFeature"]
    style E fill:#2d4a3e,stroke:#4ade80,color:#e8f5e9
```

`get_commit_diff` already handles the awkward cases — first parent for a merge, the empty tree for a
root commit — and [`formatUnifiedPatch`](../../apps/desktop/src/lib/formatUnifiedPatch.ts), written
for the [change explanation](./change-explanation.md), turns those hunks back into patch text. So no
Rust, no new command, no `get_ai_context` scope.

The stats sent with the prompt (`filesChanged`, `insertions`, `deletions`) come from the same
response rather than being recounted.

---

## Reading a big commit

This feature originally cut the patch at a flat 8000 characters. That single line held two
independent bugs, both inherited from the era before the [code review](./code-review.md) had to solve
them:

1. **8000 characters is a guess about a window it never looked at.** On a stock Ollama (4096 tokens)
   it built a prompt that _overflowed_ — and an overflow drops tokens from the **start**, which is
   where the system instruction lives. The feature quietly stopped obeying its own output rules, with
   nothing anywhere saying why. On a configured 32k window it was the opposite waste: a tenth of the
   room, used.
2. **A head-cut shows whatever sorts first, not whatever matters.** A commit that touches a lockfile
   and one source file spent its whole allowance on the lockfile.

It now shares the review's machinery
([`diffCoverage.ts`](../../packages/ai/src/features/diffCoverage.ts) +
[`diffBudget.ts`](../../packages/ai/src/features/diffBudget.ts)):

- the budget is **whatever is left of the declared context window** once the instruction (measured,
  not hardcoded), the prompt header — the commit message included, which on a squashed merge is not
  negligible — and room for the answer are paid for;
- it is spent **per file, source before tests before docs before generated**, so the code is read
  first and a lockfile only gets the surplus;
- files that did not fit at all are **named in the prompt** under `NOT INCLUDED`, before the diff, so
  the model knows what it has not read instead of discovering it halfway down;
- the panel reports the same thing to the user through the shared
  [`CoverageNotice`](../../apps/desktop/src/components/common/CoverageNotice.tsx):
  _"Read 6 of 40 changed files in full…"_, silent when everything fit.

### The file list is what keeps it an explanation

Budgeting the diff correctly is not enough on its own, and the first real run proved it: a 21-file
commit of which 6 were read came back as three file-by-file bullets and a closing paragraph
enumerating the fifteen files it had not opened. Correct, useless, and _not an explanation of the
commit_ — the reader lost the very thing the feature exists for.

Both halves of that failure have the same cause: **shown a fraction of the files and nothing else, a
model describes the fraction.** It had no way to know the commit was bigger than what it held.

The fix is the one a PR description already relies on. A PR description survives a truncated diff
because it is handed the branch's **commit list** — a complete, cheap summary of the change's shape,
independent of the diff. A single commit has no commit list, but it has the exact analogue, which
this prompt previously threw away in favour of the number `21`: the **complete list of files**, with
their line counts, grouped by directory, each entry marked when its diff did not fit.

```
--- CHANGED FILES (21, complete) ---
apps/desktop/src/app/settings/components/ — AiContextWindowCheck.tsx (+23/-5, diff not shown), AiProviderForm.tsx (+24/-5, diff not shown)
apps/desktop/src/hooks/ — useCodeReview.test.ts (+29/-5, diff not shown), useCodeReview.ts (+30/-5, diff not shown)
packages/ai/src/ — promptSize.ts (+35/-5, diff not shown), index.ts (+36/-5, diff not shown)
--- END CHANGED FILES ---
```

Grouped rather than flat, for two reasons at once. It is **cheaper** — this repo's paths run to 60
characters and 21 of them flat cost ~490 tokens, 12 % of a stock 4096-token window taken straight out
of the diff; grouped, ~366. And it is **the right shape**: the answer is meant to be about areas of
the change, so the list it reasons from should be too. `modified` is left implicit, being the
default.

#### The tail is collapsed, never dropped

The list first shipped with a plain cap — thirty files named, then `…and 18 more files`. That looks
harmless and is not, and a 48-file commit proved it: the answer described "the 18 other files" as
documentation, tests and stores, **all of which were among the thirty it could see**. Nothing was
invented and the sentence was still false, which is the worst shape an error can take here.

The cause was the cap, not the model. The instruction requires every file to be accounted for; a
remainder with no paths in it is a question the model cannot answer and will not leave alone, so it
reaches for the nearest paths it has. Worse, the vanished tail on that commit was
`packages/ai/src/features/` — **12 files and +1083 lines, the actual substance of the change.**

So past thirty named files the list keeps going at directory granularity:

```
packages/ai/src/features/ — 12 files (+1083/-55)
packages/i18n/locales/en/ — 3 files (+12/-0)
```

Every file stays accounted for at some level, the cost stays bounded (516 tokens on that commit,
_less_ than the 30-name version it replaced), and "4 documentation pages" becomes a claim the model
can make truthfully. Directories are expanded or collapsed **whole** — a half-listed directory reads
as a complete one, which is the same lie in smaller print. Only a tree with more than fifteen
distinct trailing directories produces a remainder at all.

Three instruction rules follow from it, all against symptoms seen in that run:

| Rule                                                                            | Why                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Bullets are about changes, never files one by one**                           | The symptom itself. Files serving one change are one bullet; a file the model could not read is accounted for by its path and line counts ("the same rename across 9 call sites") — what it evidently _is_, never what it evidently _does_                                                                                                                  |
| **Never mention truncation, budgets, or what it could not read — not one word** | Stricter than the code review, which is merely asked to keep its coverage line short. The review has to hedge: it claims defects, and one it could not see matters. An explanation claims nothing of the sort, the panel reports coverage exactly, and a model asked for "one short line" produces a list as long as the answer — against a 250-word budget |
| **Absence of evidence is not evidence of absence**                              | Carried over unchanged from the review                                                                                                                                                                                                                                                                                                                      |

The instruction is also kept deliberately tight, because every token in it is one the diff does not
get, on every run: it drifted to 919 tokens while these rules were being written — ~1400 characters
of diff on a 4096-token window, spent on prose about prose — and was trimmed back.

### Third failure: summarizing the message instead of the diff

Fixing the two above exposed a third, which they had been hiding. The next run was well-structured
and still wrong: on a commit whose message runs to three paragraphs, all four bullets tracked those
paragraphs almost sentence for sentence, while the 45 lines deleted from `runtime.ts` and
`runtime.test.ts` — which the message never mentions — appeared nowhere.

Same root cause as the other two. **Starved of diff, the richest text in the prompt is the message**,
so a model with little else to work from summarizes that. Which is the one thing this feature must
never do: the reader has the message on screen, three lines above the answer.

`Do NOT paraphrase it back` was already in the instruction and was not enough, because it is a
prohibition with no test attached. It is now two things instead:

- **a gradient** — _the more detailed the message, the less of it you may follow; a terse or
  misleading message is where you say the most_. This is the honest shape of the rule: the feature's
  value is inversely proportional to the message's quality, and the instruction should say so.
- **one checkable obligation** — at least one bullet must carry something the message never
  mentions. The file list is what makes this checkable rather than aspirational: _a path the message
  is silent about_ is a candidate the model can actually go and find. On the run above,
  `runtime.ts (+0/-18, diff not shown)` sits in the list, in its own directory group, unmentioned by
  the message — exactly the bullet that was missing.

### The message body is envelope too

A well-written commit message is not small. The one that introduced the code review runs to 3106
characters — **888 tokens, a fifth of a stock 4096-token window** — and the prompt sent all of it,
then instructed the model not to follow it. Spending a fifth of the window on text whose stated
purpose is to be _skipped_ was the clearest waste left in this prompt.

The body is now cut at 1200 characters. The subject is never touched, and the opening paragraphs
carry the claims a mismatch would contradict, which is what the body is genuinely needed for; what is
lost is the tail of a long rationale, and ~1900 characters of diff come back with it.

The cut is **silent and on a paragraph boundary**, both deliberately. A visible `[…truncated]` marker
would re-arm the exact failure the coverage ban exists to prevent — the model is forbidden from
remarking on what it could not read, and a marker is an invitation to remark. A message that simply
ends is one it has no reason to discuss.

### One number, one source

The panel reported _"6 of 21 files"_ on a commit `git show --stat` counts **26** files for.

Three counters, two sources: the prompt header's `filesChanged` and the CHANGED FILES list both come
from `get_commit_diff`, while coverage re-derived its own total by scanning the assembled patch text
for `diff --git` headers ([`splitDiffByFile`](../../packages/ai/src/features/diffBudget.ts)) — a
re-parse of something the app had just built structurally, and one that can silently disagree with it.

`assessCommitExplanationCoverage` now takes the total from the inventory when it has one, keeping
only what budgeting genuinely knows — _how many files it had to drop or shorten_ — and re-basing the
total under it. The number in the panel, the number in the prompt header and the length of the list
are now the same number by construction, whatever the patch text happens to parse as.

---

## Limitations

Beyond the [shared ones](./README.md#known-limitations):

| Limitation                                         | Note                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A merge is read against its first parent**       | Which is what `git show` does too, but it means the diff shows everything the merge brought in, not what its author resolved by hand. The prompt says so explicitly; the panel says so in its header                                                                                                                                                                                                                                                                                   |
| **No surrounding context**                         | Unlike the [change explanation](./change-explanation.md), which sends the file's current content alongside the patch, this sends the patch alone. A commit spans files, and sending all of them whole would blow the budget                                                                                                                                                                                                                                                            |
| **A big commit is still read partially**           | The budget follows the window rather than a constant, spends itself on the code first, and the file list keeps the _scope_ right whatever fits — but on a stock 4096-token window a 21-file commit is explained from one or two files' content plus an inventory. The list makes that answer honest and correctly scoped; it does not make it deep. Raising the window is the only thing that does, short of the two-pass approach below                                               |
| **Single-pass, so depth is bounded by the window** | The way to explain a big commit in a small window is map-reduce: summarize each file's diff on its own, then summarize the summaries. That is N sequential calls to a local model where this is one, so it is a deliberate non-goal for now rather than an oversight — worth revisiting if per-file summaries become useful elsewhere                                                                                                                                                  |
| **Worth least on a well-documented commit**        | Structural, and worth stating plainly: the better the commit message, the less there is to add. On a 48-file commit with a 50-line message, six of the answer's claims were in the message verbatim — and the model was right to be there, since after the instruction the message is the largest readable thing in the prompt. The feature earns its keep on terse, old or unfamiliar commits; a repository whose messages are consistently good is one where it has the least to say |

### What the window actually buys

Measured on the code-review commit — 48 files, a 184 867-character patch:

| Declared window | Files read in full |
| --------------- | ------------------ |
| 4096 (default)  | 5 / 48             |
| 8192            | 14 / 48            |
| 16384           | 21 / 48            |
| 32768           | 30 / 48            |
| 65536           | 48 / 48            |

At the default the prompt carries ~3 % of the diff. No prompt rule recovers the other 97 %: raising
**Settings → AI → Context window** is the only thing that does, and the _Check against the model_
button beside it says how far the model can go.
| **Nothing links it to the branch summary** | Explaining ten commits one by one is ten runs and ten separate answers; there is no "explain these 3 selected commits" |
| **Memory never expires, and never regenerates itself** | A commit is immutable, so the answer stays valid — but a _poor_ answer also persists until regenerated or deleted. Reopening the panel shows the stored answer verbatim and runs nothing (`ExplanationPanelShell` skips its auto-start whenever `text` is set), which is deliberate — regenerating over a kept answer spends a minute of local model time to replace something already on screen. The consequence worth knowing: **a prompt change does not reach a commit you have already explained** until you press Regenerate or delete the stored one. The age line is the tell |

## Tests

| Test                                                                                                             | Covers                                                                                                                                                                                                                                                                                           |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`commitExplanation.test.ts`](../../packages/ai/src/features/commitExplanation.test.ts)                          | prompt shape, body handling, merge warning, language, window-sized budget (fits every window, long message paid out of the diff, code before noise), the changed-file list (grouping, marks, cap, one list not two), coverage counted from the inventory, and the instruction's three guarantees |
| [`diffCoverage.test.ts`](../../packages/ai/src/features/diffCoverage.test.ts)                                    | the shared budget/coverage machinery — see [code review](./code-review.md)                                                                                                                                                                                                                       |
| [`useCommitExplanation.test.ts`](../../apps/desktop/src/features/graph/hooks/useCommitExplanation.test.ts)                      | diff → patch, metadata + stats, merge flag, empty-diff refusal, context window passed through, coverage exposed, memory, no key collision with a branch                                                                                                                                          |
| [`CommitExplanationPanel.test.tsx`](../../apps/desktop/src/features/graph/components/CommitExplanationPanel.test.tsx) | header per commit type, auto-start on open, no regeneration over a remembered summary, error decoding, coverage line                                                                                                                                                                             |
| [`CoverageNotice.test.tsx`](../../apps/desktop/src/components/common/CoverageNotice.test.tsx)      | the shared notice: silent when complete, informational styling, the window-too-small warning                                                                                                                                                                                                     |
| [`graphContextMenus.test.ts`](../../apps/desktop/src/lib/graphContextMenus.test.ts)                              | the menu item's action, AI-disabled state, absence in multi-selection, adjacency to the branch item                                                                                                                                                                                              |
| [`aiExplanation.store.test.ts`](../../apps/desktop/src/features/graph/stores/aiExplanation.store.test.ts)                       | keying by kind, isolation, clear                                                                                                                                                                                                                                                                 |

---

## Read file by file

The explanation is written from **per-file summaries**, never from a budgeted diff. One small call
describes each changed file from its own patch, then a single streaming call writes the prose from
the descriptions.

This is the same shape as the commit planner and the commit message, and it is the only shape — there
is no file-count threshold and no single-prompt alternative. A button that did two different things
depending on an invisible number is not something a user or a bug report can reason about.

The instruction is shorter for it. Both instructions this replaced carried a paragraph forbidding the
model from mentioning what it could not read — a rule that only existed because it _was_ being shown
a fraction and would otherwise open with an apology. With complete evidence there is nothing to hide.

The panel shows the per-file count while the map phase runs
([`SummaryProgressNotice`](../../apps/desktop/src/components/common/SummaryProgressNotice.tsx)),
which replaces the coverage line. Coverage answered "how little did it read?"; there is no budgeted
prompt to answer that about any more, and what the reader needs is a reason for the wait before the
first token. Cancelling stops the map at its next call boundary.
