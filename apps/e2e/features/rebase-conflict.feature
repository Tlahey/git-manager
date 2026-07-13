@rebase @conflict
Feature: Rebase conflict resolution
  As a user whose rebase paused on a conflict
  I want the conflict resolution panel to surface automatically
  So that I can continue, skip or abort without hunting for it

  Background:
    Given the "rebase-conflict" fixture repository is opened

  Scenario: A paused rebase auto-opens the conflict resolution panel
    Then the conflict resolution panel is shown
    And the conflict panel offers to skip or abort the rebase

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
