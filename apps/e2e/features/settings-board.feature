@settings
Feature: Board

  The Board settings tab holds one thing: whether the app periodically commits and pushes
  `.git-manager/board.json` on your behalf, for a GitHub-backed board whose column changes need to
  reach the team without a manual commit.

  @doc @screenshots
  Scenario: Turning on board auto-sync and setting its interval
    Auto-sync is off by default — like force-push, it touches the repository on your own behalf,
    so it is a choice rather than a default. Turning it on unlocks the interval field below it (1
    to 120 minutes), and both survive a reload the same way every other setting here does.
    Given the app language is English
    And the git-manager application is running
    When I reload the application
    And I open the settings
    And I open the "board" settings tab
    And I turn on board auto-sync
    And I set the board auto-sync interval to "15" minutes
    And the interface has settled
    And a full-window screenshot is saved as "doc-settings-board"
    When I reload the application
    And I open the settings
    And I open the "board" settings tab
    Then board auto-sync is on
    And the board auto-sync interval is "15" minutes
