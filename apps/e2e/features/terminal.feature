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

  @doc @screenshots
  Scenario: Working across several terminal tabs at once
    The + button spawns another shell in the same repository, and every session keeps running in
    the background — switching tabs never restarts one. Each tab is named by where it lives
    rather than a generic number, which is what tells two shells apart once more than one is open.
    When I open the integrated terminal
    And I open a new terminal tab
    Then the terminal panel has 2 tabs
    And the interface has settled
    And a full-window screenshot is saved as "doc-terminal-tabs"

  @doc @screenshots
  Scenario: Launching a configured AI agent, then reviewing what it changed
    The robot icon sends a configured command straight to the active shell — the one-click
    equivalent of typing an agent's launch command by hand. A tab you're already looking at counts
    as seen the moment it finishes, so the sparkle "review" icon is for the ones you weren't: switch
    away while it runs, and it opens the very same AI review the graph's own working-tree row
    offers, aimed at whatever the session just left behind.
    Given the AI provider is pointed at a fake server
    # Re-opened rather than trusting the Background's own copy: every other scenario that points
    # the AI provider at a fake server does it BEFORE the fixture's own reload, so that reload is
    # the one thing left settling when the interface is first touched. This scenario's Background
    # opens the fixture first, so without reopening it here, this fake-server reload instead lands
    # on an already-fully-rendered repo view — background polling hooks (auto-fetch, terminal
    # activity) mid-flight — and raced its own zustand-persist write back to French with a broken
    # AI model id (`AI_MODEL_NOT_FOUND`), which no other AI scenario has ever needed to guard
    # against.
    And the "feature-branches" fixture repository is opened
    And the agent launch command is set to "sleep 3 && echo agent-was-here >> app.txt"
    When I open the integrated terminal
    And I click the launch-agent button
    And I open a new terminal tab
    And I review the finished terminal session's changes
    Then the explanation panel shows a finished explanation
    And the interface has settled
    And a full-window screenshot is saved as "doc-terminal-review"
