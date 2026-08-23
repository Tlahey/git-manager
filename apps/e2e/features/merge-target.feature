@merge-target
Feature: Knowing about a merge conflict before you try the merge

  A small glyph sits between the branch selector and the pull-request tag in the toolbar,
  answering one question continuously: if the current branch were merged into its target branch
  right now, would it conflict? The merge is only simulated in memory — nothing is written to the
  repository — so the answer updates on its own as commits land on either side, with no need to
  actually attempt (and abort) a merge to find out. It stays quiet whenever there is nothing to
  report: on the target branch itself, or when the repo has no target branch to compare against.
  The target defaults to `origin/main` (or `origin/master`), configurable per repository in
  Settings → Repository.

  @doc @screenshots
  Scenario: The merge-target indicator warns about a conflict before you merge
    Here, a teammate has renamed the same line of a file on the target branch that the current,
    still-unpublished branch also renamed — from the same starting point, so neither side has seen
    the other's change yet. The indicator turns amber and its popover names the branch and its
    target, how far the two have diverged, and which file will conflict — all discovered without
    ever attempting the merge.
    Given the app language is English
    And the "merge-target" fixture repository is opened
    Then the merge-target indicator warns of a conflict
    When I open the merge-target popover
    Then the merge-target popover reports merging "feature/rename-line" into "origin/main"
    And the merge-target popover reports 1 commit ahead and 1 behind
    And the merge-target popover lists "app.txt" as a conflicting file
    And the interface has settled
    And a full-window screenshot is saved as "doc-merge-target-conflict"
