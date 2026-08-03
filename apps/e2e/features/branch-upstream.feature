@branches
Feature: Setting a local branch's upstream

  As a developer with a local branch that isn't tracking a remote yet
  I want to set its upstream from the app
  So that push/pull and the ahead/behind counts work without a terminal

  "Set upstream" is a branch context-menu entry (both the graph's and the sidebar's) — a real
  native macOS menu WebDriver cannot open or click into (see tag-menu.steps.ts's own note on the
  same limitation). When exactly one remote-tracking branch shares the local branch's name, the
  action applies it immediately with no dialog (resolveDefaultUpstream, lib/branchUpstream.ts);
  otherwise it opens a picker dialog. Either way the real handler ends up calling
  `setPendingGraphAction({ kind: 'setUpstream', branch })` on the repoUI store, which GitGraph.tsx
  forwards into its own real SetUpstreamDialog regardless of who set it (see the store's own doc
  comment on `pendingGraphAction`). This scenario dispatches through that same real bridge instead
  of a menu click — same as the AI recompose feature already does for its own native-menu-only
  entry (ai-commit-recompose.steps.ts) — so everything from the dialog onward (the real
  `set_branch_upstream` IPC call, the git config it writes) is exactly what a real click would have
  produced.

  Background:
    Given the "remote-ahead" fixture repository is opened

  # Test rationale (kept out of the published description): "feature/diverged" is a local branch
  # this fixture creates straight from a raw commit (not from `origin/feature/diverged`), so it
  # has no upstream configured yet even though a remote-tracking branch of the same name already
  # exists — the "unambiguous default" case resolveDefaultUpstream is built for, here reached
  # through the dialog instead of the direct-apply shortcut.
  @doc @screenshots
  Scenario: Setting a branch's upstream configures tracking on disk
    A local branch that tracks nothing has no ahead/behind counts and nothing
    to pull into. "Set upstream" fixes that in one dialog: it proposes the
    remote branch matching your branch's name when there is exactly one, and
    from the moment you confirm, push and pull know where to go and the
    toolbar badges start counting.
    Given the app language is English
    When I select the "HEAD" commit in the graph
    And I open the set-upstream dialog for branch "feature/diverged"
    Then the set-upstream dialog preselects "origin/feature/diverged"
    And the interface has settled
    And a full-window screenshot is saved as "doc-branch-upstream"
    When I confirm the set-upstream dialog
    Then the branch "feature/diverged" has upstream tracking configured for "origin"
    And no error notification is displayed
