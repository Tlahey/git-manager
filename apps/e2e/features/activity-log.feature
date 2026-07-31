@activity-log
Feature: The Activity log

  As a developer trying to understand what the app actually did
  I want a raw trace of every backend command it ran
  So that chasing a bug doesn't depend on reproducing it with a debugger attached

  The Activity Logs takeover (reached from the footer) captures every backend call the app makes —
  git2 operations and shell-outs alike — as a flat, filterable stream. Capture is always on; there
  is no separate opt-in. It's the debugging counterpart to the Action Journal (AI features section):
  the journal reframes the same underlying log for a reader who wants to learn what an action did,
  this view is the raw trace for whoever is chasing why something broke.

  @doc @screenshots
  Scenario: Filtering the activity log to errors only
    Every call is captured whether it succeeds or fails, so switching the level filter to Errors
    narrows a long stream down to just the operations that actually went wrong.
    Given the "stash-stack" fixture repository is opened
    And the app language is English
    When I click the toolbar fetch button
    And I open the activity logs
    And I filter the activity log to errors only
    Then the activity log does not show a "get_repo_status" entry
    When I open the "fetch_remote" activity log entry
    Then the activity log detail shows the error for "fetch_remote"
    And the interface has settled
    And a full-window screenshot is saved as "doc-activity-log"
