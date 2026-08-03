@merging
Feature: Merging branches

  Bringing another branch's work into yours is a palette action, not a
  buried menu: open the palette (⌘K) and every local branch offers Merge
  and, when your branch is simply behind, Fast-forward. A merge that
  brings in diverged history records a merge commit; if the two branches
  touched the same lines, the merge pauses and the three-way merge editor
  takes over.

  # These two scenarios moved here from command-palette.feature when they were promoted into the
  # documentation (the palette page was outgrowing its subject, and "how do I merge" deserves its
  # own page). They keep their original regression role: merge, fast-forward and the other
  # ref-scoped actions had no keyboard route at all before `useRefCommands` — native context menus
  # are undrivable by WebDriver — so these assert the palette route end to end against git itself.

  @doc @screenshots
  Scenario: Merging a branch from the palette
    From the branch you're on, open the palette and pick the other
    branch's Merge entry — here, merging feature/login into main. Git
    Manager runs the same merge git would: commits already contained in
    your branch are skipped, new ones come in, and a diverged history gets
    a merge commit. If the branches conflict, the merge pauses and the
    merge editor opens on the conflicted files.
    Given the app language is English
    And AI features are turned off
    And the "feature-branches" fixture repository is opened
    Then the branch indicator reads "main"
    When I open the command palette
    And I type "merge" into the command palette
    And the interface has settled
    Then the command palette is shown
    And a full-window screenshot is saved as "doc-merge-branch"
    When I run the command palette action "ref-merge-feature/login"
    Then the branch "main" contains the commit "feat: add login screen"
    And no error notification is displayed

  @doc @screenshots
  Scenario: Fast-forwarding the current branch onto another
    If your branch is strictly behind another — every commit of yours is
    already part of its history — there is nothing to merge: fast-forward
    just moves your branch pointer up to match, with no merge commit. The
    palette offers it per branch, so catching a release branch up to main
    is one keystroke away.
    Given the app language is English
    And AI features are turned off
    And the "rollback-history" fixture repository is opened
    # Build a branch that is strictly behind main, then catch it up — a fast-forward needs an
    # ancestor relationship, which no shared fixture happens to carry.
    When I select the "HEAD~2" commit in the graph
    And I open the command palette
    And I run the command palette action "commit-branch"
    Then the create branch dialog is shown
    When I enter the branch name "release/1.0"
    And I confirm the branch creation
    Then the branch indicator reads "release/1.0"
    When I open the command palette
    And I type "fast" into the command palette
    And the interface has settled
    Then a full-window screenshot is saved as "doc-fast-forward"
    When I run the command palette action "ref-fast-forward-main"
    Then the branches "release/1.0" and "main" point at the same commit
    And no error notification is displayed
