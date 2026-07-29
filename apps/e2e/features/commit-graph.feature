@graph
Feature: The commit graph
  Every repository you open lands on the commit graph: one row per commit,
  newest first, with the branch lanes drawn on the left and the refs that point
  at each commit shown as pills. It is the view you spend most of your time in,
  and the entry point to everything else — selecting a row opens that commit,
  and the topmost row is your uncommitted work.

  Background:
    Given the app language is English
    And AI features are turned off
    And the "showcase" fixture repository is opened

  @doc @screenshots
  Scenario: Read your history at a glance
    The graph draws one lane per line of development, so a branch that was
    created, worked on and merged back reads as a single visible curve instead
    of a flat list you have to reconstruct in your head. Each row carries the
    author's avatar, the commit subject, the short SHA and the date; branch and
    tag names appear as coloured pills on the commit they actually point at,
    which is how you tell where `main`, your feature branch and your remote have
    diverged. The sidebar on the left lists the same refs as a tree — branches,
    tags, stashes, submodules and worktrees — and the topmost graph row is
    always your working tree, present as soon as you have an uncommitted change.
    When the interface has settled
    Then the commit graph is shown
    And a full-window screenshot is saved as "doc-commit-graph"

  @doc @screenshots
  Scenario: Inspect a single commit
    Selecting a row opens the commit details panel next to the graph: the full
    message, the author and committer, the parents, and the list of files the
    commit touched. Clicking a file in that list shows its diff for that commit
    alone — so you can answer "what actually changed here?" without leaving the
    graph or running `git show` in a terminal. The selection is the anchor for
    the commit actions too: right-clicking the row offers the operations that
    make sense for it, such as reverting it, resetting onto it, tagging it or
    creating a branch from it.
    When I select the newest commit in the graph
    And the interface has settled
    Then the commit details panel is shown
    And a full-window screenshot is saved as "doc-commit-details"
