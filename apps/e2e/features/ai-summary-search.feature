@ai
Feature: Summary search

  As a developer who writes down almost nothing except these daily briefings
  I want to ask my own archive a question and get a direct answer
  So that I don't have to reread every day one by one to find when something happened

  The "Daily summaries" panel — opened from the AI toolbar menu, next to commit search — reads the
  whole archive for the current repository, not just the day on screen: narrowing to one day first
  would make a question answerable only about the day you already found. The answer names the
  specific archived days it rests on, each a real link back to that day's briefing.

  @doc @screenshots
  Scenario: Answering a question from archived daily briefings
    Asking a question over the archive spends one model call across a shortlist of days a local,
    lexical pass narrows first — cheap, and good enough to hand the model days that are at least
    plausible. The answer is grounded in that shortlist alone: it names the day(s) it rests on
    rather than a vague "at some point", so each one opens straight to that day's own briefing.
    Given the app language is English
    And the AI provider is pointed at a fake server
    And the "daily-summary" fixture repository is opened
    And the "daily-summary" project is listed in the dashboard with no briefing yet
    When I open the dashboard
    And I open the project's daily briefing
    Then the daily briefing headline becomes "Shipped the fake feature"
    When I open the "daily-summary" project's tab
    And I open the summaries panel from the AI menu
    And I ask the archive "When did I ship the fake feature?"
    Then the summary search cites the "daily-summary" repository
    And the interface has settled
    And a full-window screenshot is saved as "doc-summary-search"

  @doc @screenshots
  Scenario: Generating and deleting a briefing straight from the panel
    The panel does not need the dashboard's own briefing card: picking a day in its own field and
    pressing the little AI icon runs the exact same generation, so a project you have never opened
    from the dashboard still gets a briefing you can read right here — and one click removes it
    again once you no longer need it archived.
    Given the app language is English
    And the AI provider is pointed at a fake server
    And the "daily-summary" fixture repository is opened
    And the interface has settled
    When I open the summaries panel from the AI menu
    And I pick the previous working day in the summaries day picker
    And I generate the briefing from the panel
    Then the summaries panel shows a briefing for that day
    And a full-window screenshot is saved as "doc-summaries-panel"
    When I delete that briefing
    Then the summaries panel shows its empty state
