@remote
Feature: Pushing to a remote
  As a user with local commits
  I want to push from the toolbar
  So that I can publish my work without leaving the app

  The toolbar's Push button publishes whatever your branch has that the
  remote doesn't — its badge counts exactly those commits. There's no
  confirmation dialog: clicking it pushes immediately, and a toast reports
  success or failure. A push the remote can't fast-forward — because
  someone else's commit is already there and yours doesn't build on it —
  is rejected rather than silently overwriting anything.

  Background:
    Given the "remote-ahead" fixture repository is opened

  @doc @screenshots
  Scenario: Pushing publishes your commits to the remote
    The Push button's badge counts the commits your branch has that the
    remote doesn't. Clicking it publishes them immediately — no
    confirmation dialog — and a toast confirms it once the remote has
    them.
    Given the app language is English
    And AI features are turned off
    And the "remote-ahead" fixture repository is opened
    When I click the toolbar push button
    And the interface has settled
    Then the remote "origin" has the commit "chore: local work not yet pushed" on branch "main"
    And a full-window screenshot is saved as "doc-remote-push"

  @doc @screenshots
  Scenario: A rejected push reports the conflict instead of silently failing
    A push the remote can't fast-forward — someone else's commit is already
    there and yours doesn't build on it — is rejected outright rather than
    overwriting it. The toast names the problem instead of just failing
    silently, and the remote is left exactly as it was.
    Given the app language is English
    And AI features are turned off
    And the "remote-ahead" fixture repository is opened
    When I check out the "feature/diverged" branch
    And I click the toolbar push button
    And the interface has settled
    Then a push-rejected error is shown
    And the remote "origin" branch "feature/diverged" is unchanged since the last fetch
    And a full-window screenshot is saved as "doc-remote-push-rejected"

  Scenario: Pushing a brand-new branch configures its upstream tracking
    When I click the toolbar branch button
    And I set the new branch name to "feature/tracked"
    And I confirm the new branch creation
    And I check out the "feature/tracked" branch
    And I click the toolbar push button
    Then the branch "feature/tracked" has upstream tracking configured for "origin"
    And no error notification is displayed
