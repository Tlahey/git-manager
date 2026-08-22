@branch-cleanup
Feature: Cleaning up finished branches in bulk

  As a developer who just merged several pull requests
  I want to clear out the local branches they leave behind, all at once
  So that the branch list stays a list of active work, not a growing pile of finished tickets

  The Branches section header's ⋯ menu offers two bulk actions, both excluding the checked-out
  branch, main/master, and anything checked out in a worktree. "Prune local branches" is the
  GitHub-independent signal: a branch whose upstream remote branch is gone (deleted after its PR
  merged, then pruned locally by a fetch). "Remove merged branches" widens that with a GitHub
  pull-request check when an account is connected, so a branch merged but not yet cleaned up on
  the remote is still caught.

  Background:
    Given the app language is English
    And the "remote-ahead" fixture repository is opened
    # A local branch deliberately tracking a remote one this scenario is about to delete — the
    # fixture's own `feature/diverged` is a diverged *local* branch used by other scenarios and
    # was never given an upstream, so it does not qualify on its own.
    And a local branch "finished/exporter" tracks "feature/diverged" on the remote
    And the remote branch "feature/diverged" is deleted
    # Both branches are created on disk, outside the app — its own branch list was already
    # fetched when the repo opened and won't pick either up on its own.
    And I reload the application

  @doc @screenshots
  Scenario: Pruning local branches whose upstream is gone
    Opening the dialog re-fetches with prune first, so a branch whose remote copy was deleted
    since the last fetch still shows up as gone without a manual fetch beforehand.
    When I open the branch actions menu
    And I pick "Prune local branches" from the branch actions menu
    Then the branch-prune dialog lists "finished/exporter" as prunable
    And the interface has settled
    And a full-window screenshot is saved as "doc-branch-prune"
    When I confirm the branch-prune dialog
    Then the branch "finished/exporter" no longer exists in the repository

  @doc @screenshots
  Scenario: Removing merged branches in bulk
    Without a connected GitHub account the check falls back to the same gone-upstream signal as
    pruning — the dialog says so, and still offers the branch.
    Given the remote is fetched with prune
    When I open the branch actions menu
    And I pick "Remove merged branches" from the branch actions menu
    Then the branch-remove-merged dialog lists "finished/exporter" as removable
    And the interface has settled
    And a full-window screenshot is saved as "doc-branch-remove-merged"
    When I confirm the branch-remove-merged dialog
    Then the branch "finished/exporter" no longer exists in the repository
