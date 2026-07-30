@remote
Feature: Fetching and pulling from a remote
  As a user whose branch has fallen behind
  I want to fetch and pull from the toolbar
  So that I can bring my branch up to date without a terminal

  Fetch and pull are two different amounts of the same idea. Fetch
  downloads whatever is new on the remote and updates what the app knows
  about it, without touching your own branch — the pull button's badge is
  what tells you there's now something to integrate. Pull does both steps
  at once: fetch, then fast-forward your branch onto what it found.

  Background:
    Given the "remote-behind" fixture repository is opened

  @doc @screenshots
  Scenario: Pulling brings your branch up to date
    A teammate's commit already landed on the remote before you fetch, so
    the app doesn't know about it yet. Clicking Fetch downloads it and
    updates the pull button's badge to say so, without moving your branch
    an inch — you can look at what changed before deciding to integrate it.
    Clicking Pull then fast-forwards your branch onto it in one step.
    Given the app language is English
    And AI features are turned off
    And the "remote-behind" fixture repository is opened
    When I click the toolbar fetch button
    Then the toolbar pull button shows commits waiting to be pulled
    When I click the toolbar pull button
    And the interface has settled
    Then the repository HEAD commit subject contains "teammate's follow-up commit"
    And a full-window screenshot is saved as "doc-remote-pull"
