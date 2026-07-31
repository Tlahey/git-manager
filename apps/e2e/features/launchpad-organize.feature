@launchpad
Feature: Follow, snooze & save views

  As a developer with more pull requests in flight than fit in one glance
  I want to shape the Launchpad around what I actually need to track
  So that reviewing PRs isn't scrolling past the same noise every time

  Background:
    Given the launchpad state is reset
    And the app language is English
    When I open the launchpad
    And I select the "prs" launchpad tab

  @doc @screenshots
  Scenario: Following a PR you don't own adds it to the Followed tab
    Some PRs are worth watching without being on them — a teammate's release blocker, a dependency
    upgrade you're waiting on. Pasting its GitHub URL adds it to its own tab, tracked the same way
    as everything else in the Launchpad.
    When I select the "followed" launchpad tab
    And I follow the pull request at "https://github.com/octocat/hello-world/pull/42"
    Then the "followed" launchpad tab shows the followed pull request "https://github.com/octocat/hello-world/pull/42"
    And the interface has settled
    And a full-window screenshot is saved as "doc-launchpad-follow"

  @doc @screenshots
  Scenario: Snoozing a PR moves it to the Snoozed tab until you're ready
    A PR you can't act on yet — waiting on CI, waiting on someone else — doesn't have to keep
    competing for your attention. Snoozing it pulls it out of the normal tabs and into its own,
    until the time you picked arrives.
    When I snooze the pull request "pr-1" for "hour"
    Then the "prs" launchpad tab does not show the pull request "pr-1"
    When I select the "snoozed" launchpad tab
    Then the "snoozed" launchpad tab shows the pull request "pr-1"
    And the interface has settled
    And a full-window screenshot is saved as "doc-launchpad-snooze"

  @doc @screenshots
  Scenario: Saving a custom filtered view persists it across a reload
    The Custom Views tab lets you build your own filter — by title, author, repo, label, status, or
    review state — and save it as a standing view next to the built-in tabs, so a search you run
    often doesn't have to be rebuilt from scratch every time.
    When I select the "views" launchpad tab
    And I create a saved filter named "Needs My Attention" that matches PRs needing my review
    Then the "Needs My Attention" saved filter is shown
    And the interface has settled
    And a full-window screenshot is saved as "doc-launchpad-views"
    When I reload the launchpad
    Then the "Needs My Attention" saved filter is shown
