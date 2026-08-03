@terminal
Feature: The built-in terminal
  As a user who occasionally needs a real shell
  I want one inside the app, already in the right repository
  So that the odd command I can't run from the interface doesn't cost me a context switch

  The app covers the Git operations worth a button, not every flag Git has.
  For the rest there is a real terminal panel at the bottom of the window,
  started in the repository you have open — so a one-off command is a
  keystroke away rather than a trip to another application.

  Background:
    Given the app language is English
    And AI features are turned off
    And the "feature-branches" fixture repository is opened

  @doc @screenshots
  Scenario: Running a command in the repository you have open
    The Terminal button opens a shell panel already `cd`-ed into the current
    repository, so commands run where you expect without typing a path.
    It is a real terminal — anything your shell can do, including Git
    commands the interface doesn't cover — and it keeps running while you
    work in the app above it.
    When I open the integrated terminal
    Then the terminal panel is shown
    When I run "git rev-parse --abbrev-ref HEAD" in the terminal
    Then the terminal output contains "main"
    And the interface has settled
    And a full-window screenshot is saved as "doc-terminal"

  Scenario: The terminal starts in the repository's own directory
    When I open the integrated terminal
    Then the terminal panel is shown
    When I run "pwd" in the terminal
    Then the terminal output contains the repository path

  Scenario: Closing the terminal puts the panel away
    When I open the integrated terminal
    Then the terminal panel is shown
    When I close the integrated terminal
    Then the terminal panel is no longer shown
