@launchpad
Feature: Your contribution activity

  As a developer curious about my own commit cadence
  I want a heatmap of my activity without leaving the app
  So that I don't have to open GitHub's own profile page for it

  @doc @screenshots
  Scenario: The Commit Stats tab shows a year of activity
    A GitHub-profile-style heatmap of the last year, plus a day-by-day breakdown of the last two
    weeks — backed by demo data when no GitHub account is connected, the same as every other
    Launchpad tab.
    Given the app language is English
    When I open the launchpad
    And I select the "stats" launchpad tab
    Then the commit stats tab shows a year of contribution activity
    And the interface has settled
    And a full-window screenshot is saved as "doc-launchpad-commit-stats"
