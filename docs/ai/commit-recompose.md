# Recompose a commit message

Rewriting the message of a commit that already exists, from what it actually changed.

| | |
| --- | --- |
| **Descriptor** | [`commitRecomposeFeature`](../../packages/ai/src/features/commitRecompose.ts) |
| **Kind** | completion → the message string |
| **Temperature** | 0.3 — same as the commit message it mirrors |
| **Context scope** | none: the commit's own patch, via `get_commit_diff` |
| **Diff budget** | derived from the model's context window, spent per file — see the shared [`diffCoverage`](../../packages/ai/src/features/diffCoverage.ts) |
| **Output reserve** | default (600) — a commit message is prose |
| **UI** | [`RecomposeDialog`](../../apps/desktop/src/components/git-graph/components/RecomposeDialog.tsx) via [`useCommitRecompose`](../../apps/desktop/src/hooks/useCommitRecompose.ts) |

---

## What the user sees

Right-click a commit in the graph:

- **Rewrite this commit's message (LLM)** — the clicked commit alone.
- **Rewrite `<sha>` and its N descendants (LLM)** — that commit plus every commit after it on the
  branch's first-parent line. Hidden on a tip commit, where N would be zero.

Both open the same review dialog. Nothing is written until you confirm: each proposed message is an
editable row with the current message shown above it, and a **Keep the current message** checkbox per
commit. A proposal that breaks the project's convention is flagged, not blocked.

Both entries are disabled on a **protected branch**, on a **detached HEAD**, and when AI is off.

---

## The thing that makes it different from every other AI feature

Every other feature produces text you can ignore. This one **replaces messages in the repository's
history**. Two consequences shape the design:

**The old message is never shown to the model.** Given the current wording, a model paraphrases and
defends it instead of describing the diff — which is the opposite of what someone asking for a
rewrite wants. So the prompt carries the commit's identity, the project's commit style and the patch,
and nothing else. (The [commit explanation](./commit-explanation.md) makes the *opposite* call for
the opposite reason: it must not restate a message the reader can already see.)

**Rewording commit *n* rewrites everything after it.** A commit's identity includes its parents, so
the descendants get new SHAs even though their messages are untouched. The dialog says so in a
warning, and names the count of commits carried along that are not on screen. A branch already pushed
needs a force-push afterwards.

---

## Applying: no new backend command

The rewrite goes through the **existing** `run_interactive_rebase`. Its todo renderer
([git_interactive_rebase.rs](../../apps/desktop/src-tauri/src/services/git_interactive_rebase.rs))
already turns a `reword` step into `pick` + `exec git commit --amend -F <file>` — the sidecar file
is what makes multi-line messages safe — and
[`apiRunInteractiveRebase`](../../apps/desktop/src/api/git.api.ts) already records the undo entry via
`settleRebaseUndo` and brackets the run as activity.

So the hook builds a todo and hands it over:

```
oldest accepted commit ──► apiListRebaseCommits ──► every commit from there to HEAD
                                                    │
                            accepted?  ──► reword + new message
                            otherwise  ──► pick        (this is what rewrites the descendants)
```

A direct git2 chain-rewrite was drafted and discarded. It would have been *safer in isolation* —
unchanged trees mean no conflict is possible and the working tree is never touched — but it would
have meant a **second history-rewriting engine** beside a tested one, which is the duplication the
architecture rules exist to prevent. The existing path shells out with `--autostash` and handles a
pause through the rebase-state UI already in the app.

---

## Limitations

Beyond the [shared ones](./README.md#known-limitations):

| Limitation | Note |
| ---------- | ---- |
| **The descendant count is page-bounded** | It walks the loaded graph nodes; a target whose branch tip is outside the loaded page reports 0 and the "descendants" entry hides. Conservative on purpose — a guessed count would head a menu entry that rewrites history |
| **First-parent line only** | The set the rebase would replay. A commit on a side branch merged in is not offered a "descendants" rewrite |
| **One message per model call** | N commits means N completions, run sequentially. A ten-commit rewrite is ten round-trips, and the dialog reports progress rather than pretending otherwise |
| **A big commit is read partially** | Same budget as every other feature. The instruction forbids scoping a subject to only the files that fitted, but a huge commit on a small window still gets a message written from part of it |
| **Not offered on a protected branch** | By design. There is no override in the dialog: the menu entry is disabled and that is the whole answer |
| **No preview of the resulting SHAs** | The dialog says SHAs will change, but cannot say what they become — they do not exist until the rebase runs |

## Tests

| Test | Covers |
| ---- | ------ |
| [`commitRecompose.test.ts`](../../packages/ai/src/features/commitRecompose.test.ts) | prompt assembly, the old message never reaching the model, merge framing, window-sized budget, coverage, fence/quote stripping, and the instruction's "never narrate the rewrite" rule |
| [`useCommitRecompose.test.ts`](../../apps/desktop/src/hooks/useCommitRecompose.test.ts) | one call per commit, convention fetched once, empty answers declined, the rebase starting at the oldest accepted commit, picks for the rest, live edits carried through, failures surfaced |
| [`RecomposeDialog.test.tsx`](../../apps/desktop/src/components/git-graph/components/RecomposeDialog.test.tsx) | the history warning, oldest-first target order, the carried-along count, keep-as-is, progress, and no-apply-while-writing |
| [`descendantsOnCurrentBranch.test.ts`](../../apps/desktop/src/hooks/descendantsOnCurrentBranch.test.ts) | the count behind the menu entry: first-parent only, zero on a tip, zero off the loaded page |
| [`graphContextMenus.test.ts`](../../apps/desktop/src/lib/graphContextMenus.test.ts) | both entries, and every gate (protected branch, detached, AI off, multi-selection) |
