@action-journal @ai
Feature: Behind the scenes — the Action Journal

  As a developer still learning git
  I want a plain-language lesson about the commands my last actions actually ran
  So that I understand what "commit" or "rebase" really did, not just that it worked

  Opened from the footer's graduation-cap button (or the command palette), the journal is the app's
  own behaviour as the subject — not the repository's contents, so it needs no git data of its own:
  every command was already recorded as it ran, and this reads that log back. Every row shows the
  real command line with no model configured at all; asking "Explain" is what turns it into a lesson.

  @doc @screenshots
  Scenario: Explaining the commands behind a recent action
    Every action you perform — a commit, a checkout, a rebase step — is recorded as the git
    command(s) it actually ran, newest first. Picking one and asking to explain it reads those
    commands back as a short lesson in plain language, remembered afterwards so reopening the same
    action doesn't regenerate it.
    Given the app language is English
    And the AI provider is pointed at a fake server
    And the "stash-stack" fixture repository is opened
    When I select the working-tree changes in the graph
    And I enter the commit message "test: action journal e2e marker"
    And I commit the staged changes
    Then the repository HEAD commit subject is "test: action journal e2e marker"
    When I open the action journal
    And I filter the action journal for "action journal e2e marker"
    And I open the filtered action
    And I click the explain-action button
    Then the action explanation shows a finished explanation
    And the interface has settled
    And a full-window screenshot is saved as "doc-action-journal"
