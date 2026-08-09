# Code review

Reads a diff the way a reviewer would and reports what deserves a second look — before you commit, or
before you open the PR.

> Shared plumbing — transport, events, cancellation, errors, settings — lives in the
> [AI system overview](./README.md). This page covers only what is specific to this feature.

|                   |                                                                                                                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Descriptor**    | [`codeReviewFeature`](../../packages/ai/src/features/codeReview.ts)                                                                                                       |
| **Kind**          | streaming markdown                                                                                                                                                        |
| **Temperature**   | **0.1** — the lowest of any feature, see below                                                                                                                            |
| **Context scope** | `working` (worktree vs HEAD) or `range` (`merge-base(base, branch)..branch`), per target                                                                                  |
| **Diff budget**   | derived from the model's context window, [budgeted per file](#reading-the-right-7)                                                                                        |
| **UI**            | [`CodeReviewPanel`](../../apps/desktop/src/features/graph/components/CodeReviewPanel.tsx) — right panel — via [`useCodeReview`](../../apps/desktop/src/features/graph/hooks/useCodeReview.ts) |
| **Memory**        | branch target: yes (`branch-review`) · working target: **none**                                                                                                           |

---

## What the user sees

Two entry points, for the two moments the question is actually asked:

| Where                                                 | Item                          | Reviews                               |
| ----------------------------------------------------- | ----------------------------- | ------------------------------------- |
| Right-click the **WIP row**                           | _Review changes (LLM)_        | everything uncommitted, vs HEAD       |
| Right-click a **commit or branch** (graph or sidebar) | _Review branch changes (LLM)_ | the whole branch, vs its merge target |

Each sits directly beneath its explanation counterpart, with no separator: the pair answers the two
halves of one moment — _"what is this?"_ then _"is it alright?"_. Both are disabled for the same two
reasons as the explanations: nothing to read (a clean tree / a branch level with its base), or AI
switched off.

The branch item is only offered when the clicked commit **actually carries that branch**. On an
ordinary history commit the branch menu is a HEAD-relative fallback, and reviewing "the branch" there
would report on whichever branch happens to be checked out rather than on what was pointed at — the
same rule the branch explanation already follows.

---

## The one feature allowed to have an opinion

Every explanation instruction ends with some variant of:

> Describe, do not review: no praise, no suggestions, no "consider refactoring".

That rule is right for its purpose — someone reading a branch in the graph wants to know what it
does. But it left the opposite question unanswered, and this feature is that answer. It is the reason
the review is a **separate feature rather than a mode of the explanations**: the two instructions
contradict each other line by line.

Three choices shape the output, and all three are about making it **ignorable**:

**Findings are ranked and capped at six.** Handed a diff, a model will find something to say about
every hunk. Twelve equal-weight remarks is a list nobody reads to the end, and the useful item is as
likely to be tenth as first. Six, worst first.

**Every finding names a file and says what actually goes wrong.** _"Consider adding error handling"_
is unfalsifiable and costs the reader more than it gives. A finding that names the input that breaks
can be judged in seconds — and dismissed just as fast when the model is wrong, which it will
sometimes be. Severity tags (**Bug** / **Risk** / **Nit**) exist so a reader can stop at the line
where the tags stop mattering to them.

**"Nothing worth flagging" is an allowed answer, stated explicitly in the prompt.** Without that
permission a model invents a concern to justify the request. That is the failure mode that kills a
review tool: once it cries wolf on a clean diff, its real findings stop being read. The instruction
also bans anything a linter or formatter already owns, for the same reason.

## Why 0.1

Lower than every other feature, including the explanations at 0.2 and the PR description at 0.4.

Prose benefits from a little latitude — two runs of a branch explanation that phrase things
differently are equally good. A defect list does not work that way: sampling variance means a real
bug reported on one run and missed on the next. A reviewer you have to run twice to trust is one you
stop running.

---

## Reading the right 7 %

The first version cut the diff at 8000 characters with a `head -c`, like every other feature. Run on
its own 41-file changeset, the review came back talking about the truncation — and it was right to.
It had been shown a documentation page, two one-line additions and half a test file: **7 % of the
diff, and not one line of the feature under review.**

The budget is therefore spent per file, by
[`budgetDiff`](../../packages/ai/src/features/diffBudget.ts), on three rules:

> This section describes machinery the review introduced but no longer owns. The sizing, the omitted
> list and the coverage report live in
> [`diffCoverage.ts`](../../packages/ai/src/features/diffCoverage.ts) and are shared with the
> [commit explanation](./commit-explanation.md#reading-a-big-commit); the review is one caller.

| Rule                                                                  | Why                                                                                                                                                                                                                                                            |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tiers.** Source, then tests, then docs/config, then generated files | A lockfile can consume an entire budget on its own, and nobody has an opinion about its diff. A lower tier is served only from genuine surplus — if source was cut, nothing flows down                                                                         |
| **Whole files, smallest first**                                       | Maximises how many files are readable _end to end_. A file seen through a 700-character window is mostly imports, and invites the model to call a function unused because its only call site fell past the cut — a wrong finding costs more than a missing one |
| **Name what was dropped**                                             | Omitted paths are listed in the prompt header, before the diff, under `NOT INCLUDED`. A reviewer who knows what they did not read is far more useful than one who does not                                                                                     |

On that same changeset: **14 files reached, 13 of them complete**, against 4 partial ones before.
`codeReview.ts`, `useCodeReview.ts` and the store — the substance of the change — went from invisible
to fully read.

### The budget follows the model, it is not a constant

A fixed number here was always two guesses pretending to be one: how much diff is useful, and how
much the model can actually hold. They are the same question. So `reviewDiffBudget(contextTokens)`
spends whatever is left of the window once the instruction (measured, not hardcoded), the prompt
envelope and room for the answer are subtracted, with 15 % slack for the estimate's error:

| Declared window         | Diff budget   |
| ----------------------- | ------------- |
| 4096 (Ollama's default) | ~6 500 chars  |
| 8192                    | ~18 700 chars |
| 16384                   | ~43 100 chars |
| 24576                   | ~67 500 chars |
| 32768                   | ~91 800 chars |

The window is declared in **Settings → AI → Context window**, because the app cannot detect it: no
protocol it speaks reports one reliably, and Ollama applies its own `num_ctx` regardless. It defaults
to 4096 — pessimistic on purpose, since that is what a user gets from a stock Ollama whatever their
model is capable of.

The envelope is **measured, not assumed** — and that distinction was itself a bug worth recording.
A flat 250-token allowance ignored the two path lists in the prompt, which on a 50-file changeset came
to ~1280 tokens: the prompt then measured 4230 against the 4096 window it had just sized itself for,
and the panel warned the user about an overflow the app had produced itself. The lists are now capped
(30 changed files, 12 omitted, each naming the count it did not print), which also breaks a feedback
loop: uncapped, trimming the diff to fit _lengthened_ the omitted list, which grew the envelope, which
trimmed the diff further.

The consequence worth understanding: **the review no longer overflows, it shrinks**. A user on the
default window gets a smaller, correct review instead of a larger, silently mangled one; a user who
declares 32k gets six times the coverage from the same code. The size warning became a safety net for
the one case trimming cannot fix — a window too small to hold the instruction at all — rather than
the usual outcome.

---

## Saying what was read, not warning about size

Context overflow is the worst-behaved failure in the stack. A provider handed more tokens than its
window does not raise, does not warn, and does not drop the _end_ — it drops the **start**, which is
where the system instruction lives. The symptom is a review that quietly stops obeying its own output
rules, with nothing anywhere saying why.

Nothing in the app reads or negotiates a context window (no `num_ctx`, no `max_tokens`, anywhere), so
[`promptSize.ts`](../../packages/ai/src/promptSize.ts) does not pretend to know one. It sizes the
prompt against the window the user _declared_, defaulting to the one the app ships against — Ollama's
4096, which is what a user gets unless they configured their Modelfile or `OLLAMA_CONTEXT_LENGTH`.

That was first surfaced as an overflow _warning_. It is no longer, and the reason is worth recording:
**once the budget followed the window, the prompt stopped overflowing.** It reads fewer files instead.
Warning about a failure that can no longer happen is how a panel teaches its reader to ignore it.

So what the panel shows is the fact the user can act on:

| State                                         | Panel                                                                                                          |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| The whole change was read                     | nothing — the common case on a normal change                                                                   |
| Some of it was shortened or left out          | one **informational** line: how many files were read in full, and the context window that would read all of it |
| The window cannot hold the instruction itself | a warning — the one state trimming cannot fix                                                                  |

The suggested window is not decorative: a test asserts that re-running at the number the panel names
actually reads everything. It is rounded up to a size people configure (8k, 16k, 32k…) rather than
reported as a precise-and-useless 46 812.

Only whole files count as read. Counting truncated ones produced the self-contradicting _"50 of 50
files read — reading all of it needs a bigger window"_, and a file the model saw half of is one it can
draw a wrong conclusion from.

Two honesty caveats. The token count is an **estimate** (characters ÷ 3.5, deliberately denser than
the ~4 quoted for prose, since diffs tokenize badly). And the window is **declared, never verified** —
see the limitations.

---

## What it is not

It reads **a diff**, not the repository. It cannot open the function you are calling, check whether a
test covers the branch, or know that the invariant you broke is enforced three files away. The
instruction says so directly, and tells the model to name what it would need to check rather than
guess:

> You cannot see the rest of the repository: if a concern depends on code that is not in the diff,
> either say what you would need to check or leave it out.

The sharpest form of this is **narrowness, not just scope**: git shows three lines around each
change, and a review will happily report that a guard is missing when the guard sits four lines above
the hunk. That happened on this feature's own diff — a `b.isOnClickedCommit &&` one line outside the
context window, reported as absent, which made a correct comment look wrong. The instruction now
forbids the inference outright ("absence of evidence is not evidence of absence"), because the model
is not wrong to reason from what it has; it is wrong to treat what it has as complete.

That is also why the panel's empty-state copy calls its output _a prompt to check, not a verdict_. It
is a second pair of eyes on a diff, with everything that implies — including being confidently wrong
occasionally. It does not replace review, and nothing in the app treats it as a gate.

---

## Two scopes, one feature

Unlike the explanations — one feature and one hook each — the review is a single descriptor
discriminating on its input's `scope`, and a single hook and panel taking a target.

The explanations genuinely diverge (a commit's parent resolution, a branch's non-HEAD range, a
working tree that is never stored). A review differs only in _which context call it makes_ and
_whether the answer is worth keeping_; splitting it would be the same twenty lines twice, and two
instructions to keep in sync forever. What does differ is stated once, in the prompt header and the
diff label (`DIFF (base..branch)` vs `DIFF (working tree vs HEAD)`), so the model always knows what
it is looking at.

## What is remembered

The same rule as the explanations, for the same reason:

| Target      | Remembered                      | Why                                                                                                                                                                                  |
| ----------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Branch**  | yes, under kind `branch-review` | Expensive to produce, and the panel shows its age and the base it used — a stale one is _visibly_ stale                                                                              |
| **Working** | no                              | The tree changes with every keystroke and nothing would tell you the review describes code you already fixed. A review flagging a bug you have since deleted is worse than no review |

`branch-review` is a distinct kind in
[`aiExplanation.store`](../../apps/desktop/src/features/graph/stores/aiExplanation.store.ts) precisely so a branch's
review and its explanation do not collide on the same key — same ref, different documents.

---

## Limitations

Beyond the [shared ones](./README.md#known-limitations):

| Limitation                                                           | Note                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Diff-only context**                                                | The single biggest one, above. Findings that depend on unseen code are guesses, and the prompt is written to suppress rather than eliminate them                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **The diff budget is bounded by the model's window**                 | A big changeset is exactly when a review is most wanted and least complete. Per-file budgeting decides _which_ files are read; the window decides how many. On a stock 4096-token setup a 130 000-character diff is mostly named, never read                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **The declared window is verifiable only while the model is loaded** | Settings → AI's _Check against the model_ button ([ai_model_info.rs](../../apps/desktop/src-tauri/src/services/ai_model_info.rs)) reads the model's ceiling and any Modelfile `num_ctx` from `/api/show`, plus — from `/api/ps`, and only while the model is loaded — the window the server **actually allocated**, which is what finally makes a server-side `OLLAMA_CONTEXT_LENGTH` visible. With the model loaded the setting can be verified or caught being too high; without it, passing still means _plausible_. Ollama-only; no OpenAI-compatible endpoint reports a context length at all. See [Checking the context window](./README.md#checking-the-context-window) |
| **The tier order is a heuristic, but an overridable one**            | Reading order is inferred from filenames, so a checked-in schema or a lockfile bump the author is asking about on purpose sorts last. `CodeReviewInput.tierOverrides` lets the caller correct it per path; nothing in the UI sets it yet                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **No severity guarantee**                                            | The **Bug**/**Risk**/**Nit** tag is the model's own judgement, not a checked classification. A **Nit** can be the real problem                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Silence is not proof**                                             | "Nothing worth flagging" means nothing was found in the diff at this budget — not that the change is correct                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **Staged and unstaged are merged**                                   | The `working` scope is one diff against HEAD, so the review cannot separate what is ready to commit from what is still being written                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

## Tests

| Test                                                                                                        | Covers                                                                                                                                                   |
| ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`codeReview.test.ts`](../../packages/ai/src/features/codeReview.test.ts)                                   | both prompt shapes, commit list, file statuses, budgeting, language, and the instruction's guarantees                                                    |
| [`diffBudget.test.ts`](../../packages/ai/src/features/diffBudget.test.ts)                                   | path classification, the backend's origin-prefixed headers, tier priority, whole-file preference, and the never-return-an-empty-diff floor               |
| [`diffCoverage.test.ts`](../../packages/ai/src/features/diffCoverage.test.ts)                               | the shared sizing: budget vs window, budget vs instruction length, the capped `NOT INCLUDED` list, and that the suggested window really reads everything |
| [`CoverageNotice.test.tsx`](../../apps/desktop/src/components/common/CoverageNotice.test.tsx) | the shared notice: silent when complete, informational styling, the window-too-small warning                                                             |
| [`useCodeReview.test.ts`](../../apps/desktop/src/features/graph/hooks/useCodeReview.test.ts)                               | scope routing, both refusals, streaming, branch memory, and that the working scope persists nothing                                                      |
| [`CodeReviewPanel.test.tsx`](../../apps/desktop/src/features/graph/components/CodeReviewPanel.test.tsx)          | both targets' headers, auto-start, stale-base warning, error decoding, and the three prompt-size states                                                  |
| [`promptSize.test.ts`](../../packages/ai/src/promptSize.test.ts)                                            | the estimate, the three risk bands, and that the assumed window is reported rather than left implicit                                                    |
| [`graphContextMenus.test.ts`](../../apps/desktop/src/lib/graphContextMenus.test.ts)                         | both menu items, their placement next to the explanations, and every reason they disable                                                                 |
