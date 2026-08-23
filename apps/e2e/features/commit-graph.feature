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

  @doc @screenshots
  Scenario: Selecting several commits shows their combined diff
    Cmd-clicking a second row turns the single commit panel into a merged one for the whole
    selection: the commits listed in order, and one file list for everything they touched between
    them — a file two of them both edited shows up once, with its net change across the range,
    not twice.
    Given the "rollback-history" fixture repository is opened
    When I select the "HEAD~2" commit in the graph
    And I add the "HEAD~1" commit to the graph selection
    Then the multi-commit panel shows 2 commits selected
    And the multi-commit panel lists "counter.txt" as a changed file
    And the interface has settled
    And a full-window screenshot is saved as "doc-multi-commit-diff"

  @doc @screenshots
  Scenario: Opening a commit on GitHub, resolved from the repository's own remote
    Every commit's palette entry offers a link to that same commit on GitHub — resolved from the
    repository's own "origin" remote rather than a separate setup step. Nothing configured (or
    configured to somewhere that isn't GitHub) surfaces a clear error instead of a dead click; a
    real GitHub remote turns the same entry into the exact commit's page.
    Given the "feature-branches" fixture repository is opened
    When I select the newest commit in the graph
    And I open the command palette
    And I pick "Open commit on GitHub" from the palette
    Then an error notification reading "No GitHub remote configured for this repository" is displayed
    When the repository's "origin" remote is set to "https://github.com/octocat/hello-world.git"
    And I open the command palette
    Then the palette offers "Open commit on GitHub"
    And the interface has settled
    And a full-window screenshot is saved as "doc-open-on-github"

  @doc @screenshots
  Scenario: Filtering the graph with ⌘F
    ⌘F opens a small search bar floating over the graph and steps through the commits matching
    what you type — by subject, body, author name or email, or SHA — without hiding the rest of
    the history the way a filter would. The counter says which match you're on and how many there
    are in total; Enter and the arrows step forward, Shift+Enter back.
    When I open the commit search panel
    And I search the commit graph for "notification"
    And the interface has settled
    Then the commit search shows "1/5"
    And a full-window screenshot is saved as "doc-commit-search"
    When I go to the next commit search match
    Then the commit search shows "2/5"

  @doc @screenshots
  Scenario: Filtering the graph by author
    The funnel in the Author column header narrows attention to one or more people's own work,
    without hiding anything else the way ⌘F's search does not either — every commit stays in the
    graph, and everyone but the selected authors just dims, so the shape of history around their
    commits is still there to read.
    Given the "feature-branches" fixture repository is opened
    When I open the author filter
    And I filter the graph by author "Marie Dubois"
    Then the author filter shows "1" selected
    And the commit "chore: extend app on main" is not dimmed
    And the commit "chore: initial app" is dimmed
    And the interface has settled
    And a full-window screenshot is saved as "doc-author-filter"
    When I clear the author filter
    Then the commit "chore: initial app" is not dimmed
