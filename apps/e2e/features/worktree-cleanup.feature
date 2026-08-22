@worktree-cleanup
Feature: Cleaning up finished worktrees in bulk

  As a developer who works across several worktrees at once
  I want to clear out the ones that are done, all in one pass
  So that the worktree list stays a list of what's actually in progress

  The Worktrees section header's ⋯ menu offers two bulk actions. "Prune worktrees" cleans up
  administrative metadata for worktrees whose folder is already gone from disk (deleted outside
  the app — `rm -rf`, a dropped external drive) rather than through Remove-worktree. "Remove
  merged worktrees" is the other direction: the folder still exists, but its branch is done —
  merged, or its upstream deleted — so the whole worktree (folder and all) is removed at once,
  skipping anything dirty or detached.

  @doc @screenshots
  Scenario: Pruning worktrees whose folder is gone from disk
    Nothing here touches disk — a worktree whose folder is already gone just has leftover
    administrative metadata under `.git`, and pruning clears that out so the entry stops showing
    up as a worktree that no longer exists anywhere.
    Given the "remote-ahead" fixture repository is opened
    And the app language is English
    And a worktree for a new branch "scratch/spike" exists on disk
    And that worktree's folder is deleted directly from disk
    And I reload the application
    When I open the worktree actions menu
    And I pick "Prune worktrees" from the worktree actions menu
    Then the worktree-prune dialog lists the worktree for branch "scratch/spike"
    And the interface has settled
    And a full-window screenshot is saved as "doc-worktree-prune"
    When I confirm the worktree-prune dialog
    Then the repository no longer has a worktree entry for branch "scratch/spike"

  @doc @screenshots
  Scenario: Removing merged worktrees in bulk
    Unlike pruning, this deletes a folder that's still there — so it only offers a worktree whose
    branch is actually done (merged, or its upstream gone) and whose checkout is clean, skipping
    anything dirty or detached rather than guessing.
    Given the "remote-ahead" fixture repository is opened
    And the app language is English
    And a local branch "finished/importer" tracks "feature/diverged" on the remote
    And the remote branch "feature/diverged" is deleted
    And a worktree for the branch "finished/importer" exists on disk
    And the remote is fetched with prune
    And I reload the application
    When I open the worktree actions menu
    And I pick "Remove merged worktrees" from the worktree actions menu
    Then the worktree-remove-merged dialog lists the worktree for branch "finished/importer"
    And the interface has settled
    And a full-window screenshot is saved as "doc-worktree-remove-merged"
    When I confirm the worktree-remove-merged dialog
    Then the repository no longer has a worktree entry for branch "finished/importer"
    And the worktree folder for branch "finished/importer" no longer exists on disk
