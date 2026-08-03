@detached
Feature: Detached HEAD state
  As a user on a detached HEAD
  I want the branch indicator to make that obvious
  So that I don't mistake it for being on a branch

  Checking out a commit instead of a branch leaves HEAD detached — a state
  Git supports but one that's easy to lose track of. Git Manager's toolbar
  always tells you which one you're in.

  Background:
    Given the "detached-head" fixture repository is opened

  @doc @screenshots
  Scenario: The toolbar shows HEAD instead of a branch name
    Checking out a specific commit instead of a branch leaves you on a
    detached HEAD — a normal, if temporary, state Git itself supports. The
    toolbar makes it impossible to mistake for being on a branch: it reads
    plain "HEAD" instead of a branch name until you check one out again.
    Given the app language is English
    And AI features are turned off
    And the "detached-head" fixture repository is opened
    When the interface has settled
    Then the branch indicator reads "HEAD"
    And a full-window screenshot is saved as "doc-detached-head"

  Scenario: Checking out a branch from a detached HEAD returns to a named branch
    Then the branch indicator reads "HEAD"
    When I check out the "main" branch
    Then the branch indicator reads "main"

  # Undoing a checkout made *from* a detached HEAD has to come back to that commit. It used to fail
  # outright — every caller passes the string "HEAD" as "where we came from" (that is what the repo
  # summary reports off-branch), which by undo time resolves to the branch just checked out. The
  # commit was not pinned either, for the same reason.
  Scenario: Undoing a checkout made from a detached HEAD returns to that commit
    Then the branch indicator reads "HEAD"
    And the repository HEAD commit subject is "chore: v1"
    When I check out the "main" branch
    Then the branch indicator reads "main"
    When I undo the last action
    Then the repository HEAD commit subject is "chore: v1"
    And the branch indicator reads "HEAD"
    And no error notification is displayed
