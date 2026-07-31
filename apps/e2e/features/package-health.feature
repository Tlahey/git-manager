@health
Feature: Package health checks

  As a user maintaining a JavaScript repo
  I want an offline check of my package.json manifests
  So that I catch dependency drift before it turns into a real bug

  The health check reads every package.json in the workspace and runs a set of
  checks against them entirely offline — no install, no network call. It looks
  for the kind of drift that's easy to introduce by hand and easy to miss in
  review: a dependency pinned to two different ranges across the workspace, a
  literal range where the pnpm catalog already defines one, a sibling package
  depended on by version instead of workspace:, and a few others.

  @doc @screenshots
  Scenario: Running a health check reports package and dependency counts
    Tools → Health Check (only offered in a repo with a root package.json) reads
    every package.json in the workspace and runs a set of offline checks against
    them — no network call and no need to have run install first. The right panel
    lists the checks with a pass/warning/skipped badge each; the center pane opens
    on the overview, with the workspace's package and dependency counts up top.
    Given the app language is English
    And AI features are turned off
    And the "package-health" fixture repository is opened
    When I run a health check from the tools menu
    And the interface has settled
    Then a full-window screenshot is saved as "doc-package-health"
