@palette
Feature: Command palette (⌘K)
  As a user
  I want a keyboard-driven command palette
  So that I can run global and commit-scoped actions without the native menus

  ⌘K opens the command palette from anywhere in the app — a single,
  keyboard-driven list of every action you could run: global commands like
  jumping to a settings section, and, once a commit is selected in the
  graph, that commit's own scoped actions (reset, revert, branch, tag,
  cherry-pick, stash apply/pop/drop) filtered to just what makes sense for
  it.

  Background:
    Given the "rollback-history" fixture repository is opened

  Scenario: Opening a settings section from the palette
    When I open the command palette
    And I run the command palette action "settings-ui_customization"
    Then the settings screen is shown

  @doc @screenshots
  Scenario: Resetting to an earlier commit from the palette
    Selecting a commit in the graph, then opening the palette, offers that
    commit's own actions — reset, revert, branch, tag, cherry-pick — scoped
    to exactly that commit rather than a generic list. Running reset from
    here opens the same confirmation dialog the toolbar's Reset button
    would, so picking the mixed, soft or hard mode isn't skipped just
    because you got there by keyboard.
    Given the app language is English
    And AI features are turned off
    And the "rollback-history" fixture repository is opened
    When I select the "HEAD~2" commit in the graph
    And I open the command palette
    And the interface has settled
    Then the command palette shows commit actions for "HEAD~2"
    And a full-window screenshot is saved as "doc-command-palette"
    When I run the command palette action "commit-reset-mixed"
    Then the reset dialog is shown
    When I confirm the reset
    Then the repository HEAD commit subject is "chore: bump counter to 2"

  Scenario: Soft-resetting to an earlier commit keeps the change staged
    When I select the "HEAD~1" commit in the graph
    And I open the command palette
    Then the command palette shows commit actions for "HEAD~1"
    When I run the command palette action "commit-reset-soft"
    Then the reset dialog is shown
    When I confirm the reset
    Then the repository HEAD commit subject is "chore: bump counter to 3"
    And the working tree has staged changes

  Scenario: Hard-resetting requires typing RESET to confirm
    When I select the "HEAD~1" commit in the graph
    And I open the command palette
    Then the command palette shows commit actions for "HEAD~1"
    When I run the command palette action "commit-reset-hard"
    Then the reset dialog is shown
    And the reset confirm button is disabled
    When I type "RESET" into the reset confirmation input
    Then the reset confirm button is enabled
    When I confirm the reset
    Then the repository HEAD commit subject is "chore: bump counter to 3"
    And the working tree is clean

  @doc @screenshots
  Scenario: Reverting the last commit from the palette
    Revert is the safe way to undo a commit that's already shared: instead
    of rewriting history like a reset, it writes a new commit that applies
    the old one in reverse, so the branch keeps its past and anyone who
    pulled it stays in sync. Running Revert on the selected commit opens a
    confirmation dialog first — nothing is written until you confirm. For
    reverting a merge commit, which needs to pick a side, see
    [Merge commit actions](./merge-commit-actions).
    Given the app language is English
    And AI features are turned off
    And the "rollback-history" fixture repository is opened
    When I open the command palette
    Then the command palette shows commit actions for "HEAD"
    When I run the command palette action "commit-revert"
    Then the revert dialog is shown
    When the interface has settled
    Then a full-window screenshot is saved as "doc-revert-commit"
    When I confirm the revert
    Then the repository HEAD commit subject contains "chore: bump counter to 4"

  Scenario: Creating a branch from an earlier commit via the palette
    When I select the "HEAD~1" commit in the graph
    And I open the command palette
    Then the command palette shows commit actions for "HEAD~1"
    When I run the command palette action "commit-branch"
    Then the create branch dialog is shown
    When I enter the branch name "feature/from-palette"
    And I confirm the branch creation
    Then the branch "feature/from-palette" points at the commit "chore: bump counter to 3"

  @doc @screenshots
  Scenario: Cherry-picking a commit from another branch via the palette
    Cherry-pick copies a single commit from another branch onto the one you
    have checked out — the fix you need now, without merging everything
    around it. Select the commit anywhere in the graph, even on a branch
    you're not on, open the palette, and its scoped actions include
    Cherry-pick; running it replays that commit onto your current branch as
    a new commit of its own.
    Given the app language is English
    And AI features are turned off
    And the "feature-branches" fixture repository is opened
    When I select the "feature/login" commit in the graph
    And I open the command palette
    And I type "cherry" into the command palette
    And the interface has settled
    Then the command palette shows commit actions for "feature/login"
    And a full-window screenshot is saved as "doc-cherry-pick"
    When I run the command palette action "commit-cherry-pick"
    Then the commit "feat: add login screen" is reachable from "main"

  Scenario: Dropping a stash via the palette
    Given the "stash-stack" fixture repository is opened
    When I select the "stash@{0}" commit in the graph
    And I open the command palette
    When I run the command palette action "stash-drop"
    Then the repository has 1 stash

  @doc @screenshots
  Scenario: Applying a stash via the palette keeps it but restores its changes
    There's no separate "stash panel" — every stash action runs through the
    command palette, on whichever stash you've selected in the graph.
    Selecting a stash and opening the palette offers Apply, Pop and Drop
    together: Apply restores its changes to your working tree without
    removing the stash itself, so you can reuse it later; Pop does the same
    but removes it once applied, and Drop discards it outright.
    Given the app language is English
    And AI features are turned off
    And the "stash-stack" fixture repository is opened
    And the working tree starts clean
    When I select the "stash@{0}" commit in the graph
    And I open the command palette
    And the interface has settled
    Then the command palette is shown
    And a full-window screenshot is saved as "doc-stash-palette"
    When I run the command palette action "stash-apply"
    Then the repository has 2 stashes
    And the file "notes.txt" exists in the working tree

  Scenario: Popping a stash via the palette removes it and restores its changes
    Given the "stash-stack" fixture repository is opened
    And the working tree starts clean
    When I select the "stash@{0}" commit in the graph
    And I open the command palette
    When I run the command palette action "stash-pop"
    Then the repository has 1 stash
    And the file "notes.txt" exists in the working tree
    And no error notification is displayed

  # Merge, fast-forward, branch delete and create-patch all lived only on native context menus,
  # which WebDriver cannot open — the reason COVERAGE.md listed them as blocked. The palette
  # entries (`useRefCommands`, `useCommitCommands`) exist so these actions have a keyboard route at
  # all; the coverage follows from that.
  Scenario: Merging a branch from the palette
    Given the "feature-branches" fixture repository is opened
    Then the branch indicator reads "main"
    When I open the command palette
    And I run the command palette action "ref-merge-feature/login"
    Then the branch "main" contains the commit "feat: add login screen"
    And no error notification is displayed

  Scenario: Fast-forwarding the current branch onto another
    Given the "rollback-history" fixture repository is opened
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
    And I run the command palette action "ref-fast-forward-main"
    Then the branches "release/1.0" and "main" point at the same commit
    And no error notification is displayed

  Scenario: Deleting a local branch from the palette, and undoing it
    Given the "rollback-history" fixture repository is opened
    # A branch has to be merged into HEAD before git will delete it, so build one that is: at an
    # earlier commit on main, which makes it an ancestor. Creating it checks it out, hence the
    # step back onto main — git also refuses to delete the branch you are standing on.
    When I select the "HEAD~2" commit in the graph
    And I open the command palette
    And I run the command palette action "commit-branch"
    Then the create branch dialog is shown
    When I enter the branch name "release/1.0"
    And I confirm the branch creation
    And I check out the "main" branch
    And I open the command palette
    And I run the command palette action "ref-delete-branch-release/1.0"
    Then the branch "release/1.0" no longer exists
    And no error notification is displayed
    # The deletion goes through the undo-recording API wrapper, so the branch comes back at its
    # tip — the only Cmd+Z coverage there is for a ref deletion.
    When I undo the last action
    Then the branch "release/1.0" exists
    When I redo the last undone action
    Then the branch "release/1.0" no longer exists

  # Why the scenario above has to merge first: the palette deletes with `git branch -d` semantics,
  # exactly like the context menu, so unmerged work is protected rather than silently dropped.
  Scenario: Deleting an unmerged branch is refused
    Given the "feature-branches" fixture repository is opened
    When I open the command palette
    And I run the command palette action "ref-delete-branch-feature/login"
    Then the branch "feature/login" exists

  Scenario: Creating a patch file from a commit
    Given the "rollback-history" fixture repository is opened
    When I select the "HEAD~1" commit in the graph
    And I open the command palette
    And I run the command palette action "commit-create-patch"
    And I choose "e2e-commit.patch" in the save dialog
    Then the patch file "e2e-commit.patch" holds a diff
    And no error notification is displayed

  # The multi-selection variant: Cmd+click a second row, then the palette's "create patch from the
  # N selected commits" entry (commit-create-patch-selection, fed by the store's
  # `selectedCommitOids` mirror). Asserted by counting the mbox separators in the written file —
  # two commits in, two patches out — which the single-commit check above can't distinguish.
  Scenario: Creating a patch file from a multi-commit selection
    Given the "rollback-history" fixture repository is opened
    When I select the "HEAD~2" commit in the graph
    And I add the "HEAD~1" commit to the graph selection
    And I open the command palette
    And I run the command palette action "commit-create-patch-selection"
    And I choose "e2e-selection.patch" in the save dialog
    Then the patch file "e2e-selection.patch" holds patches for 2 commits
    And no error notification is displayed
