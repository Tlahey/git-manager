@hooks @notch
Feature: Repository hooks gate what the app writes
  As a user whose repository installs its own quality gates
  I want the app to run them exactly as the command line does
  So that a commit made here cannot bypass a check a commit made there would fail

  libgit2 runs no hooks at all, so every hook a repository installed was silently
  skipped for anything done from this app — the same commit passing in a terminal
  and passing here for entirely different reasons. These scenarios use fixtures
  carrying real, executable hooks, so what is asserted is that a genuine
  `pre-commit` script ran, refused, and had its own output carried back.

  Scenario: A pre-commit hook that refuses stops the commit and shows its output
    Given the "hooks-plain" fixture repository is opened
    And the notch queue is being recorded
    When I select the working-tree changes in the graph
    And I stage the file "trip-precommit.txt"
    And I enter the commit message "chore: this must not land"
    And I commit the staged changes
    Then the repository HEAD commit subject remains "chore: bulk payload so a push has something to transfer"
    And the notch reported the "pre-commit" hook running
    And the notch shows the "pre-commit" hook's output
    And the notch output mentions "BREAK-PRECOMMIT"

  Scenario: A commit the hooks accept goes through as it always did
    Given the "hooks-plain" fixture repository is opened
    And the notch queue is being recorded
    When I select the working-tree changes in the graph
    And I stage the file "clean.txt"
    And I enter the commit message "chore: a commit every hook accepts"
    And I commit the staged changes
    Then the repository HEAD commit subject is "chore: a commit every hook accepts"
    And the notch raises no hook failure

  # The resolution path most real projects are actually on, and the one nothing covered
  # end-to-end: husky keeps its hooks in the working tree and points `core.hooksPath` at them,
  # so a lookup that only knew about `.git/hooks` would find nothing and silently run none.
  Scenario: Hooks installed husky-style through core.hooksPath run just the same
    Given the "hooks-husky" fixture repository is opened
    And the notch queue is being recorded
    When I select the working-tree changes in the graph
    And I stage the file "trip-precommit.txt"
    And I enter the commit message "chore: this must not land either"
    And I commit the staged changes
    Then the repository HEAD commit subject remains "chore: install husky-style hooks under .husky"
    And the notch shows the "pre-commit" hook's output
