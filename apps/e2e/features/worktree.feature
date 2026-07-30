@worktree
Feature: Worktree management
  As a user working across multiple branches at once
  I want to list, add, and remove git worktrees from the sidebar
  So that I don't have to leave the app to manage them

  A linked worktree is another checkout of the same repository, on a
  different branch, in its own folder — useful for working on two things at
  once without stashing or switching. Git Manager lists, adds and removes
  them from the sidebar, without you ever leaving the app for a terminal.

  Background:
    Given the "worktree-repo" fixture repository is opened

  Scenario: The sidebar lists the repo's linked worktree
    When I expand the "worktrees" sidebar section
    Then the sidebar lists a worktree for branch "feature/login"

  @doc @screenshots
  Scenario: Adding a new worktree
    Worktrees you've linked to this repository are listed in their own
    sidebar section, so you can see every branch checked out elsewhere at a
    glance. Adding one is a small dialog: pick the branch and a folder, and
    Git Manager creates the linked worktree and lists it right away.
    Removing one works the same way in reverse — and if it still has
    uncommitted changes, the dialog warns you and requires an explicit
    force before it lets you continue.
    Given the app language is English
    And AI features are turned off
    And the "worktree-repo" fixture repository is opened
    When I expand the "worktrees" sidebar section
    And I click the add-worktree button
    And I set the worktree branch to "feature/settings"
    And I set the worktree path to a fresh temporary directory
    And I confirm the add-worktree dialog
    And the interface has settled
    Then the sidebar lists a worktree for branch "feature/settings"
    And the fixture repo has a worktree at that path on disk
    And a full-window screenshot is saved as "doc-worktree-sidebar"

  Scenario: Removing an existing worktree
    When I expand the "worktrees" sidebar section
    And I click the remove button for the linked worktree
    And I confirm the remove-worktree dialog
    Then the sidebar no longer lists a worktree for branch "feature/login"
    And the fixture repo no longer has the linked worktree on disk

  Scenario: Removing a dirty worktree requires forcing
    Given the linked worktree has uncommitted changes
    When I reload the application
    And I expand the "worktrees" sidebar section
    And I click the remove button for the linked worktree
    Then the remove-worktree dialog warns about uncommitted changes
    When I check the force-remove checkbox
    And I confirm the remove-worktree dialog
    Then the fixture repo no longer has the linked worktree on disk
