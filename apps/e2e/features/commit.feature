@commits @commit
Feature: Committing staged changes
  As a user with staged changes in the working tree
  I want to write a message and commit
  So that my work is recorded in history

  Committing happens right where you decided what belongs in it: write a
  message in the staging panel and confirm, and it becomes the new HEAD — no
  separate window, no context switch. Whatever you left unstaged stays
  behind, untouched, waiting for a commit of its own.

  Background:
    Given the "stash-stack" fixture repository is opened

  @doc @screenshots
  Scenario: Committing the staged changes records a new HEAD commit
    The staging panel's message box is the only place a commit gets written:
    type a subject, click commit, and the staged files become a real commit
    on HEAD immediately — the graph reflects it as the new topmost row
    without a refresh. Anything left unstaged is untouched by the commit and
    stays exactly where it was, ready to be staged and committed on its own.
    Given the app language is English
    And AI features are turned off
    And the "stash-stack" fixture repository is opened
    When I select the working-tree changes in the graph
    And I enter the commit message "chore: bump service version to api-v2"
    And I commit the staged changes
    And the interface has settled
    Then the repository HEAD commit subject is "chore: bump service version to api-v2"
    And the commit graph is shown
    And a full-window screenshot is saved as "doc-commit-written"

  @doc @screenshots
  Scenario: Amending the previous commit rewrites it instead of stacking a new one
    Ticking "Amend previous commit" needs no staged file of its own — it fills the message box
    with the commit it's about to replace, ready to edit, and confirming rewrites that commit in
    place rather than adding a new one on top of it.
    Given the app language is English
    And AI features are turned off
    And the "stash-stack" fixture repository is opened
    When I select the working-tree changes in the graph
    And I enter the commit message "chore: bump service version to api-v2"
    And I commit the staged changes
    Then the repository HEAD commit subject is "chore: bump service version to api-v2"
    When I select the working-tree changes in the graph
    And I turn on the amend-previous-commit option
    Then the commit message box holds "chore: bump service version to api-v2"
    When I enter the commit message "chore: bump service version to api-v3"
    And the interface has settled
    And a full-window screenshot is saved as "doc-commit-amend"
    And I commit the staged changes
    Then the repository HEAD commit subject is "chore: bump service version to api-v3"
    And the commit before HEAD has the subject "base: add config"

  Scenario: Undoing a commit restores the previous HEAD and redo re-applies it
    When I select the working-tree changes in the graph
    And I enter the commit message "test: commit staged changes via e2e"
    And I commit the staged changes
    Then the repository HEAD commit subject is "test: commit staged changes via e2e"
    And no error notification is displayed
    When I undo the last action
    Then the repository HEAD commit subject is "base: add config"
    When I redo the last undone action
    Then the repository HEAD commit subject is "test: commit staged changes via e2e"
