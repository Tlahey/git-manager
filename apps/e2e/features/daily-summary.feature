@ai @daily-summary
Feature: AI daily summary (launchpad briefing)
  As a developer opening the app in the morning
  I want a per-project briefing of what was done and what to plan
  So that I can pick up where I left off without re-reading the git log

  Background:
    Given the "stash-stack" fixture repository is opened
    And the "stash-stack" project is listed in the launchpad with no briefing yet

  Scenario: Opening the launchpad auto-generates the morning briefing for an open project
    Given the AI provider is pointed at a fake server
    When I open the launchpad dashboard
    And I open the project's daily briefing
    Then the daily briefing headline becomes "Shipped the fake feature"
    And the daily briefing "yesterday" list contains "did the fake work"
    And the daily briefing "today" list contains "plan the next thing"
    And the sent prompt's system message contains "daily stand-up briefing"
    And the sent prompt's user message contains "Repository: stash-stack"

  Scenario: With auto-generation off, the briefing is produced on demand
    Given the AI provider is pointed at a fake server
    And morning auto-generation of briefings is disabled
    When I open the launchpad dashboard
    And I open the project's daily briefing
    Then the daily briefing shows its empty state
    When I generate the daily briefing
    Then the daily briefing headline becomes "Shipped the fake feature"
    And the daily briefing "today" list contains "plan the next thing"

  Scenario: Disabling the feature hides the briefing from the launchpad
    Given the daily summary feature is disabled in settings
    When I open the launchpad dashboard
    Then the project's daily briefing button is not shown
