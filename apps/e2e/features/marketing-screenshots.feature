@screenshots
Feature: Marketing screenshots

  Not a regression suite: these scenarios drive the real app against the
  "showcase" fixture and export PNGs to docs/screenshots/, where the README
  (and anything else) can embed always-up-to-date pictures of the actual UI.
  Run just these with:
    pnpm --filter @git-manager/e2e exec wdio run ./wdio.conf.ts --cucumberOpts.tags='@screenshots'

  Scenario: Capture the commit graph view
    Given the app language is English
    And the "showcase" fixture repository is opened
    When the interface has settled
    Then a full-window screenshot is saved as "app-commit-graph"

  Scenario: Capture a selected commit with its details panel
    Given the app language is English
    And the "showcase" fixture repository is opened
    When I select the newest commit in the graph
    And the interface has settled
    Then a full-window screenshot is saved as "app-commit-details"
