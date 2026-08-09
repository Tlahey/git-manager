# `components/diff-viewer`

One file, read every way the app can read it: its diff, its contents, its blame, an image preview —
plus the toolbar that switches between them and the AI explanation of its pending change.

## Why it is here rather than in a feature folder

**Three different screens mount it, and none of them owns it.** The commit graph opens it on a file
of a commit or of the working tree; the files view (`features/files`) opens it on a file of the
working tree picked from the project tree; the pull-request screens open it on a file of a PR. The
repo's own rule is that anything genuinely shared between features stays in `src/components/` — a
feature that imported the viewer out of another feature's folder would make that folder a
dependency of a screen it knows nothing about.

It was extracted from `components/git-graph/` (2026-08) for exactly that reason: the graph's folder
had become three things sharing a directory, and this was the piece two other areas were reaching
into it for.

## What it does _not_ own

- **Where the file came from.** Callers pass a `path` plus how to read it (staged, unmodified, which
  tab to open on); resolving that is the caller's business.
- **The blame/history _panel_** (`components/repository-sidebar/BlameHistoryPanel`). The toggle for
  it is in this toolbar, but the panel itself lands in the repo tab's left slot, which
  `RepoWorkspace` owns — see its doc comment for why blame takes that slot on two different views.
