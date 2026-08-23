@ai @daily-summary
Feature: AI daily summary (dashboard briefing)
  As a developer opening the app in the morning
  I want a per-project briefing of what was done and what to plan
  So that I can pick up where I left off without re-reading the git log

  Background:
    Given the "daily-summary" fixture repository is opened
    And the "daily-summary" project is listed in the dashboard with no briefing yet

  @doc @screenshots
  Scenario: Opening the dashboard auto-generates the morning briefing for an open project
    A project with no briefing for the previous working day gets one generated
    automatically the moment its dashboard card is opened — no button to find or
    click. It reads only the commits that landed on the main branch that day, and
    summarizes each file they touched before writing the headline and highlights,
    so a quiet day costs nothing and a busy one gets a briefing grounded in the
    actual diff rather than the commit messages alone.
    Given the app language is English
    And the AI provider is pointed at a fake server
    When I open the dashboard
    And I open the project's daily briefing
    And the interface has settled
    Then the daily briefing headline becomes "Shipped the fake feature"
    And the daily briefing "highlights" list contains "did the fake work"
    And a full-window screenshot is saved as "doc-daily-summary"

  @doc @screenshots
  Scenario: With auto-generation off, the briefing is produced on demand
    Turning off the morning auto-run doesn't remove the briefing, only the automatic part of it:
    the card opens to an empty state instead, and the same generate button that runs every other
    morning is still one click away whenever you actually want that day's summary.
    Given the app language is English
    And the AI provider is pointed at a fake server
    And morning auto-generation of briefings is disabled
    When I open the dashboard
    And I open the project's daily briefing
    Then the daily briefing shows its empty state
    And the interface has settled
    And a full-window screenshot is saved as "doc-daily-summary-on-demand"
    When I generate the daily briefing
    Then the daily briefing headline becomes "Shipped the fake feature"
    And the daily briefing "highlights" list contains "did the fake work"
    And the sent prompt's system message contains "a short record of ONE day's work"
    And the sent prompt's user message contains "Repository: daily-summary"

  @doc @screenshots
  Scenario: Disabling the feature hides the briefing from the dashboard
    Turning the daily summary feature off in settings removes it from the dashboard entirely — no
    button, no empty state to explain, for anyone who would rather the card stay just a card.
    Given the app language is English
    And the daily summary feature is disabled in settings
    When I open the dashboard
    Then the project's daily briefing button is not shown
    And the interface has settled
    And a full-window screenshot is saved as "doc-daily-summary-disabled"
