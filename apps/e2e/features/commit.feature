@commits @commit
Feature: Committing staged changes
  As a user with staged changes in the working tree
  I want to write a message and commit
  So that my work is recorded in history

  Background:
    Given the "stash-stack" fixture repository is opened

  Scenario: Committing the staged changes records a new HEAD commit
    When I select the working-tree changes in the graph
    And I enter the commit message "test: commit staged changes via e2e"
    And I commit the staged changes
    Then the repository HEAD commit subject is "test: commit staged changes via e2e"

  Scenario: Undoing a commit restores the previous HEAD and redo re-applies it
    When I select the working-tree changes in the graph
    And I enter the commit message "test: commit staged changes via e2e"
    And I commit the staged changes
    Then the repository HEAD commit subject is "test: commit staged changes via e2e"
    When I undo the last action
    Then the repository HEAD commit subject is "base: add config"
    When I redo the last undone action
    Then the repository HEAD commit subject is "test: commit staged changes via e2e"
