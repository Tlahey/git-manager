@rebase @conflict
Feature: Rebase conflict resolution
  As a user whose rebase paused on a conflict
  I want the conflict resolution panel to surface automatically
  So that I can continue, skip or abort without hunting for it

  When a rebase stops because two commits touch the same lines, Git Manager
  doesn't leave you to notice the paused state on your own: opening (or
  returning to) a repository with a paused rebase surfaces the conflict
  resolution panel immediately, listing the files that still need attention
  and a clear way out — skip the commit, abort the rebase, or continue once
  everything is resolved.

  Background:
    Given the "rebase-conflict" fixture repository is opened

  @doc @screenshots
  Scenario: A paused rebase auto-opens the conflict resolution panel
    A rebase that stops on a conflict isn't a silent failure state you have
    to go looking for: the conflict resolution panel is already open when
    you get here, with the conflicting files listed and nowhere else to
    check first. From it you can skip the conflicting commit, abort back to
    where you started, or continue once every file is resolved.
    Given the app language is English
    And AI features are turned off
    And the "rebase-conflict" fixture repository is opened
    When the interface has settled
    Then the conflict resolution panel is shown
    And the conflict panel offers to skip or abort the rebase
    And a full-window screenshot is saved as "doc-rebase-conflict-panel"

  @visual
  Scenario: The conflict resolution panel matches the reference snapshot
    Then the conflict resolution panel matches the visual snapshot "conflict-resolution-panel"

  Scenario: Aborting a paused rebase returns to the pre-rebase state
    When I abort the rebase
    Then the conflict resolution panel is not shown
    And the repository HEAD commit subject contains "theirs: add theirs-metrics"

  Scenario: Skipping the conflicting commit completes the rebase without it
    When I skip the rebase step
    Then the conflict resolution panel is not shown
    And the repository HEAD commit subject contains "ours: add metrics/tracing addons"

  Scenario: Resolving the conflict and continuing completes the rebase
    Given the conflicted file is resolved on disk
    When I reload the application
    Then the conflict resolution panel is shown
    When I continue the rebase
    Then the conflict resolution panel is not shown
    And the commit "ours: add metrics/tracing addons, bump http-client/database-driver/retry-policy/auth-provider, drop old-widget/legacy-cache/legacy-session" is reachable from "HEAD"
