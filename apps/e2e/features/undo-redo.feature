@undo @redo
Feature: Undo and redo a branch checkout
  As a user who switched branches
  I want Cmd+Z / Cmd+Shift+Z to undo and redo the checkout
  So that I can move HEAD back and forth without fear

  Background:
    Given the "feature-branches" fixture repository is opened

  Scenario: Undoing a checkout returns to the previous branch and redo re-applies it
    Then the branch indicator reads "main"
    When I check out the "feature/login" branch
    Then the branch indicator reads "feature/login"
    When I undo the last action
    Then the branch indicator reads "main"
    When I redo the last undone action
    Then the branch indicator reads "feature/login"

  Scenario: Undoing a reset restores HEAD and redo re-applies it
    Given the "rollback-history" fixture repository is opened
    When I select the "HEAD~2" commit in the graph
    And I open the command palette
    And I run the command palette action "commit-reset-mixed"
    Then the reset dialog is shown
    When I confirm the reset
    Then the repository HEAD commit subject is "chore: bump counter to 2"
    When I undo the last action
    Then the repository HEAD commit subject is "chore: bump counter to 4"
    When I redo the last undone action
    Then the repository HEAD commit subject is "chore: bump counter to 2"
