@error-report
Feature: Reporting a problem

  As a user who has just hit a bug in the app
  I want to send what went wrong to the people who can fix it
  So that a failure I can reproduce doesn't have to be one I retype into a browser

  When something in the app fails, the footer's report button (the speech bubble, next to the
  activity button) opens the activity log filtered down to failures. Picking the operation that
  went wrong and choosing "Report this problem" assembles the whole issue for you: the error, the
  operations that led up to it, your app version and platform.

  Nothing is sent on its own, and nothing is sent behind your back. The dialog shows the exact text
  that will be posted — paths, repository names and argument values are already stripped out of it —
  and you add what you were trying to do before submitting. With a GitHub account connected, one
  button opens the issue under your own account; without one, you copy the report and file it
  yourself.

  The app also tells you what it makes of the failure first. A protected branch, a hook of your own
  that refused a commit, an AI provider that isn't running: those are explained rather than filed,
  because a tracker buried in reports nobody can act on stops being read. When it isn't sure — the
  case for most errors Git itself raises — it asks you to say what you expected, which is the one
  thing it cannot work out on its own.

  @doc @screenshots
  Scenario: Reporting a failed operation from the activity log
    A fetch against a repository with no reachable remote fails, and the report dialog built from
    that failure shows what would be posted: the verdict on whether it is a bug, a box for what you
    were doing, and the complete issue body, ready to read before anything leaves your machine.
    Given the "stash-stack" fixture repository is opened
    And the app language is English
    When I click the toolbar fetch button
    And I open the activity logs from the report button
    Then the activity log shows only failed operations
    When I open the "fetch_remote" activity log entry
    And I report the selected activity log entry
    Then the report dialog shows what will be sent
    And the report dialog hides the repository path
    And the interface has settled
    And a full-window screenshot is saved as "doc-error-report"
