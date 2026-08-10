# `features/ai-search` — asking the repository a question

The AI commit search: the user types a question, the app scans a window of commits against it, and
answers in markdown with the commits it found. Opened from the AI menu or ⇧⌘F, rendered as the
graph's right panel.

| Folder        | What it holds                                                                                |
| ------------- | -------------------------------------------------------------------------------------------- |
| `index.ts`    | The public surface: `AiCommitSearchPanel`, and nothing else.                                 |
| `components/` | The panel and its four lists — the form, the matches, the unread ones, the saved history.    |
| `hooks/`      | `useAiCommitSearch` — the run itself: scan, judge, answer, and the progress the panel shows. |
| `stores/`     | `aiCommitSearch.store` — the saved runs, persisted per repository.                           |
| `lib/`        | `commitSearchNotch` — the notch card a run publishes while it works and when it finishes.    |

## Why this is a feature and the rest of the app's AI is not

The app's AI surface is large — around thirty hooks, five stores, an api domain, a dozen library
modules — and almost none of it is feature-shaped. It is a _capability_ woven into other views:
explanation panels in the graph, a review in the diff viewer, a status light in the footer, a card
in the notch. `features/*` is vertical by definition, and those have no vertical of their own.

This one does. It has a subject (a question about the repository), its own persisted state, its own
progress reporting, its own notification, and a panel that is entirely its own. Above all it has
**one consumer**: `AiSidePanel` renders it when the graph's `aiPanelTarget` says `commitSearch`.
That is why `index.ts` exports a single name, and why it can stay that way.

## What deliberately lives elsewhere

- **The AI brain** — the two features the run is built from (`commitRelevanceFeature`, then
  `commitSearchAnswerFeature`), their prompts, their schemas and the `scanCommits` sequencing — is in
  `packages/ai`. Adding an AI capability happens there, not here. See
  [docs/ai/commit-search.md](../../../../../docs/ai/commit-search.md).
- **The transport** — `useAiStream`, `api/ai.api`, `aiActivity.store`, `aiErrorMessage` — is shared
  with every other AI feature and stays in the app's own layers.
- **The plain ⌘F commit search** is a different thing that happens to share a name:
  `stores/commitSearch.store` and `features/graph/components/CommitSearchPanel` are a text filter
  over the loaded page, with no model involved. They stay in the graph.
- **The notch host** stays in `lib/notifications/`; only the _card builder_ for this feature moved,
  because what a search's card says is part of what the search is.

## Not a package

Same reason as the other features (see [`features/board/README.md`](../board/README.md)): this
reaches the app's IPC layer, its settings store and its shared components. Extracting it would drag
the app in behind it.
