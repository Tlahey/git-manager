---
title: 'Keyboard shortcuts'
description: 'Every keyboard shortcut in one table — palettes, tabs, search, undo, settings.'
---

# Keyboard shortcuts

On Windows and Linux, read `⌘` as `Ctrl`.

| Shortcut | Does |
| --- | --- |
| `⌘K` | Open the [command palette](./features/command-palette) — every action, searchable |
| `⌘P` | Open the file search palette — jump to any file of the repository |
| `⌘T` | Open a [new tab](./features/open-repo) |
| `⌥W` | Close the current repository tab |
| `⌘Z` / `⇧⌘Z` | [Undo / redo](./features/undo-redo) the last Git action (checkout, reset, commit…) |
| `⌘F` | Filter the [commit graph](./features/commit-graph) (while the graph is on screen) |
| `⌥⌘F` | Jump to the [sidebar](./features/sidebar-navigation)'s branch filter |
| `⇧⌘F` | Open the [AI commit search](./features/ai-commit-search) panel |
| `⌘,` | Open [Settings](./features/settings) |
| `Esc` | Close the current panel, dialog or Settings |

Two context notes: `⌘F` defers to the editor's own in-file find when you are focused inside a
diff or merge editor, and `⌘Z` applies to the app's Git undo stack — not to text fields, which
keep their ordinary text undo.
