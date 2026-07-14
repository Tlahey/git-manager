# Changelog

Notable changes to git-manager, release by release. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/). This file is bundled into the app and rendered
on Settings → Changelog (and via the version badge in the footer).

## [Unreleased]

### Added

- In-app auto-updater with a signed GitHub Releases pipeline (Settings → General)
- Per-project AI daily summary briefing in the launchpad
- Per-feature AI runtime with commit-batch review and repo-aware commit style detection
- Searchable provider combobox for AI settings
- File blame and history in the diff viewer
- Obsidian theme with dark sidebar/tab-bar chrome
- Sidebar UI for worktree list/add/remove
- Cmd+K command palette
- Instant startup splash screen
- Opt-in debug log capturing all IPC operations
- Undo/redo support for revert, branch creation, and tag creation

### Fixed

- WCAG AA contrast issues across themes
- Rebase conflict panel now auto-opens when a rebase pauses
- Undo history now rehydrates after fixup/rebase commits made from child windows

## [0.1.0] - 2026-06-30

Initial release.

### Added

- Repository browsing: commit graph, branches, tags, stashes, submodules
- Stage/unstage/commit/discard workflow with a 3-way merge conflict editor (drag-and-drop interactive rebase planning included)
- Fixup/autosquash support with pre-commit conflict warnings
- Undo/redo across most git operations
- GitHub integration: OAuth device flow, pull request browsing
- Local AI-assisted commit messages (Ollama and OpenAI-compatible providers)
- Achievements & rewards system with unlockable cosmetic themes
- English/French localization
