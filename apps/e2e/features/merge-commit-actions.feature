# How these scenarios reach the two actions, and why they pick the merge they pick — harness and
# fixture rationale, not anything a reader of the documentation needs.
#
# Both entries live on the commit's native right-click menu, which WebdriverIO cannot drive (see
# tag-menu.steps.ts). Revert is still reachable through the ⌘K command palette exactly like a plain
# commit's revert — it dispatches the same `pendingGraphAction: { kind: 'revert' }` bridge, and
# `RevertDialog` shows its mainline picker on its own once it sees more than one parent.
# Compare-against-parent has no palette entry yet, so these scenarios dispatch the underlying
# `pendingGraphAction: { kind: 'compareParent', ... }` bridge directly through the e2e-exposed
# `__e2eRepoUIStore` — the same store write a palette command would perform, just without a command
# wired up to reach it yet (see COVERAGE.md).
#
# They target "Merge branch 'feat/rollback'" (tagged v0.2.0 by the showcase fixture) rather than the
# earlier "Merge branch 'feat/ai-commit'" (v0.1.0): both are real `git merge --no-ff` merges, but
# v0.1.0's mainline side (README.md) is touched again by a later commit still ahead of it on main,
# so reverting -m2 against the fixture's HEAD hits a real (and, for this test, unwanted) conflict —
# the reverse patch's context no longer matches. v0.2.0's two sides (rollback.ts/rollback.test.ts on
# the branch, README.md's "Badges!" line on main) are never touched again afterwards, so both
# mainlines revert cleanly — verified directly with `git revert -m 1|2` against the built fixture
# before writing the assertions below.
@mergecommit
Feature: Merge commit actions (revert with mainline, compare against parent)
  As a user
  I want to revert a merge commit against a specific mainline parent, and compare it against either of its parents
  So that I can undo or inspect exactly one side of a merge

  A merge commit is the one commit with two "before" states, and that changes both
  of the things you would normally do with a commit. Undoing it is ambiguous —
  Git will not invert a merge until you say which of its parents you consider the
  mainline — and reading it is lopsided, because a merge's diff is always shown
  against its first parent and nothing else.

  So a merge commit gets two entries of its own on its right-click menu. **Revert
  merge** opens the ordinary revert dialog, which grows a mainline picker as soon
  as it sees more than one parent (it is also in the ⌘K palette, and opens the same
  dialog). **Compare against parent 1 / 2** reads the merge against whichever side
  you name, so you can see what the merged-in branch contributed and, separately,
  what the mainline had been doing in the meantime.

  Background:
    Given the app language is English
    And the "showcase" fixture repository is opened

  @doc @screenshots
  Scenario: Reverting a merge commit with mainline 1 undoes the merged-in branch
    Reverting a merge is the one revert Git refuses to guess at: a merge has
    two "before" states, so the dialog asks which parent is your mainline.
    Pick parent 1 to undo everything the merged-in branch brought, as one new
    commit — the usual way to back out a bad merge without rewriting history.
    When I select the "v0.2.0" commit in the graph
    And I open the command palette
    And I pick "Revert this commit" from the palette
    Then the revert dialog is shown
    And the revert mainline picker is shown
    And the interface has settled
    And a full-window screenshot is saved as "doc-revert-merge"
    When I choose mainline parent "1" for the revert
    And I confirm the revert
    Then the repository HEAD commit subject contains "Revert"
    And the file "rollback.ts" does not exist in the working tree
    And the file "rollback.test.ts" does not exist in the working tree
    And the file "README.md" in the working tree contains "Badges!"

  Scenario: Reverting a merge commit with mainline 2 undoes the mainline's own change
    When I select the "v0.2.0" commit in the graph
    And I open the command palette
    And I run the command palette action "commit-revert"
    Then the revert dialog is shown
    When I choose mainline parent "2" for the revert
    And I confirm the revert
    Then the repository HEAD commit subject contains "Revert"
    And the file "rollback.ts" exists in the working tree
    And the file "rollback.test.ts" exists in the working tree
    And the file "README.md" in the working tree does not contain "Badges!"
    And the file "README.md" in the working tree contains "Window drag region fix."

  @doc @screenshots
  Scenario: Comparing a merge commit against parent 1 shows the merged-in branch's files
    A merge commit's regular diff panel always reads it against the mainline.
    To see the other side — or to make the first-parent reading explicit —
    compare the merge against either parent: against parent 1 you get exactly
    what the merged-in branch contributed, against parent 2 what the mainline
    had done in the meantime.
    When I select the "v0.2.0" commit in the graph
    And I compare the selected commit against parent "1"
    Then the compare-parent dialog is shown
    And the compare-parent diff lists the file "rollback.ts"
    And the compare-parent diff lists the file "rollback.test.ts"
    And the interface has settled
    And a full-window screenshot is saved as "doc-compare-parent"

  Scenario: Comparing a merge commit against parent 2 shows the mainline's own change
    When I select the "v0.2.0" commit in the graph
    And I compare the selected commit against parent "2"
    Then the compare-parent dialog is shown
    And the compare-parent diff lists the file "README.md"
