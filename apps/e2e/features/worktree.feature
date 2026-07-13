@worktree
Feature: Worktree management
  As a user working across multiple branches at once
  I want to list, add, and remove git worktrees from the sidebar
  So that I don't have to leave the app to manage them

  Background:
    Given the "worktree-repo" fixture repository is opened

  Scenario: The sidebar lists the repo's linked worktree
    When I expand the "worktrees" sidebar section
    Then the sidebar lists a worktree for branch "feature/login"

  Scenario: Adding a new worktree
    When I expand the "worktrees" sidebar section
    And I click the add-worktree button
    And I set the worktree branch to "feature/settings"
    And I set the worktree path to a fresh temporary directory
    And I confirm the add-worktree dialog
    Then the sidebar lists a worktree for branch "feature/settings"
    And the fixture repo has a worktree at that path on disk

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
