@health
Feature: Checking for dependency updates, and what an upgrade would break

  As a user maintaining a JavaScript repo
  I want to see which dependencies have newer releases and update them from the app
  So that I don't have to leave it to run the package manager by hand

  Updates has its own destination in the health tool, below the offline checks: it is the one part
  that reaches the network (through the repo's own package manager, not a call the app makes
  itself) and the only part that can change the repo. A plain update stays within what the
  manifests already allow; "Update to latest" can cross a major and asks for confirmation first.
  Release notes for a pending update sit behind their own button, and beneath them — only when AI
  is enabled — an assessment of what that upgrade would actually break in this repository, judged
  against the notes and the repo's own import sites rather than the release in the abstract.

  @doc @screenshots
  Scenario: Updating a dependency, then assessing what a bigger one would break
    An in-range update needs one click and no confirmation — the declared range already allows it.
    "chalk"'s only available move crosses a major: before taking it, this scenario asks the AI
    assessment what that would break here (it reads the release notes against the files that
    actually import the package, and says whether the change lands on code this repo has), then
    takes the major update anyway — which, crossing a major, asks for confirmation first.
    Given the app language is English
    And the "package-health" fixture repository is opened
    And the repository has outdated dependencies ready for the updates demo
    When I run a health check from the tools menu
    And I open the package updates page
    Then the updates page lists "left-pad" as outdated
    And the updates page lists "chalk" as outdated
    When I update "left-pad" to the in-range version
    Then the updates page no longer lists "left-pad"
    When I view the release notes for "chalk"
    And I run the upgrade risk report
    Then the upgrade risk report names the affected file "packages/ui/src/index.ts"
    When I close the release notes panel
    And I update "chalk" to the latest version
    Then a major-version update confirmation is shown
    When I confirm the major-version update
    Then the updates page no longer lists "chalk"
    And the interface has settled
    And a full-window screenshot is saved as "doc-package-updates"
