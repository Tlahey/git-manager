# `components/github-panels`

The pull-request and issue screens: a PR's detail view, its files and per-file diff, the composer
and the create form, and an issue's detail view.

## Why it is here rather than in a feature folder

**Two unrelated screens mount the same panels.** The commit graph swaps its centre for a PR or an
issue when one is selected from the branch sidebar (`GitGraph`), and the Launchpad page
(`app/pull-requests/`) mounts the same three panels as its own centre. Neither is the owner: the
graph is not "where pull requests live", and Launchpad is not what the sidebar opens.

Extracted from `components/git-graph/` (2026-08), where they had accumulated because the graph was
the first screen to show a PR. Leaving them there would have meant `app/pull-requests/` importing
out of the graph's folder — and, once the graph became `features/graph/`, importing *into* a feature
from outside it, which the barrel rule exists to prevent.

## Boundaries

- **The GitHub API calls** stay in `api/github/*.api.ts`, as for every other screen.
- **The diff of a PR's file** is `components/diff-viewer/`'s, not a second implementation.
- **The lists** (rows, filters, saved searches) belong to whichever screen draws them —
  `app/pull-requests/components/` and `components/repository-sidebar/` — because a row is about how
  a screen lists things, and a panel is about the thing itself.
