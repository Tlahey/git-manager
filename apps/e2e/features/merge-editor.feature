@merge @conflict
Feature: Three-way merge editor
  As a user resolving a conflict
  I want the three-way merge editor to open for a conflicted file
  So that I can resolve it block by block

  When a merge, a pull or a rebase cannot reconcile two versions of a file on
  its own, Git Manager opens that file in a three-way editor instead of leaving
  conflict markers in your working copy for you to untangle by hand. The two
  versions sit on either side, the result you are building is in the middle,
  and each side is labelled with where it comes from — worth reading, because
  which one counts as "yours" flips between a merge and a rebase.

  Background:
    Given the "rebase-conflict" fixture is built

  @doc @screenshots
  Scenario: Resolve a conflicted file block by block
    Clicking a conflicted file in the graph's conflict panel opens it here, in
    its own window. A conflicted file is rarely conflicted everywhere — most of
    it is changes only one side made, which have exactly one sensible outcome,
    and "Apply non-conflicting changes" takes all of those in one click. What
    is left is the blocks where both sides really did edit the same lines: for
    each of those you pick a side from the gap between the panes, or type the
    answer yourself in the middle pane when neither version is quite right. The
    apply button stays disabled until every block has an outcome, so you cannot
    accidentally write a half-resolved file; applying it writes the merged
    result to disk and stages it, which is what tells Git the conflict is
    settled.
    Given the app language is English
    And AI features are turned off
    When I open the merge editor for "dependency-manifest.txt"
    And the interface has settled
    Then the merge editor is shown
    And the merge editor offers to auto-merge the non-conflicting blocks
    And a full-window screenshot is saved as "doc-merge-editor"

  @doc @screenshots
  Scenario: Filtering the diff by whitespace, highlight mode, and unfolding everything
    The same toolbar that resolves conflicts also decides how the diff itself reads. "Do not
    ignore" is the default; pointing it at "Ignore whitespace" hides changes that are only
    reindentation, so what's left is what actually changed. The highlight mode chooses whether an
    edit is marked word by word or by the whole line it sits on. Unchanged fragments between
    blocks are collapsed away from the moment the editor opens — one click on the fold icon gets
    the whole file back, for the times a change only makes sense next to what didn't change.
    Given the app language is English
    And AI features are turned off
    When I open the merge editor for "dependency-manifest.txt"
    Then the whitespace mode is "Do not ignore"
    And the highlight mode is "Highlight words"
    And unchanged regions are collapsed
    When I turn off collapsing unchanged regions
    Then unchanged regions are not collapsed
    When I set the whitespace mode to "Ignore whitespace"
    Then the whitespace mode is "Ignore whitespace"
    When I set the highlight mode to "Highlight lines"
    Then the highlight mode is "Highlight lines"
    And the interface has settled
    And a full-window screenshot is saved as "doc-merge-toolbar"
    When I click the recalculate-diff button
    Then the merge editor is shown
    And no error notification is displayed

  Scenario: The merge editor opens for a conflicted file
    When I open the merge editor for "dependency-manifest.txt"
    Then the merge editor is shown
    And the merge editor offers to auto-merge the non-conflicting blocks

  @visual
  Scenario: The merge editor matches the reference snapshot
    When I open the merge editor for "dependency-manifest.txt"
    Then the merge editor matches the visual snapshot "merge-editor"

  @doc @screenshots
  Scenario: Auto-merging then resolving the remaining conflicts writes the merged result to disk
    "Apply non-conflicting changes" is the wand icon in the toolbar: one click resolves every
    block where only one side actually changed something, which on a real conflicted file is most
    of it. What survives is the handful of blocks both sides genuinely touched — pick a side from
    each remaining gap the same way as always, and the apply button enables the moment none are
    left undecided.
    Given the "rebase-conflict" fixture repository is opened
    When I click the conflicted file "dependency-manifest.txt" to resolve it
    And I click the merge editor auto-merge wand
    And I accept the right side for every remaining conflicting block
    Then the merge apply button is enabled
    And the interface has settled
    And a full-window screenshot is saved as "doc-merge-auto-merge"
    When I click the merge editor apply button
    Then the file "dependency-manifest.txt" is staged and no longer conflicted
    # Wand-resolved modifications (both sides):
    And the file "dependency-manifest.txt" contains the line "http-client = 7.32.0"
    And the file "dependency-manifest.txt" contains the line "json-parser = 2.9.0"
    # Manually accepted via the right gap — the 2 real conflicts (ours wins) and the ours-only
    # deletion/addition the wand deliberately leaves pending (see git_merge_diff.rs):
    And the file "dependency-manifest.txt" contains the line "database-driver = 5.1.0"
    And the file "dependency-manifest.txt" contains the line "auth-provider = 2.1.0"
    And the file "dependency-manifest.txt" contains the line "addon-metrics = 1.0.0"
    And the file "dependency-manifest.txt" does not contain the line "legacy-cache = 0.3.0"
    # Theirs-only deletion/addition were never touched (only the right gap was driven) — the
    # wand's documented default holds: the deletion's kept content stays, the addition stays absent.
    And the file "dependency-manifest.txt" contains the line "deprecated-auth = 0.2.0"
    And the file "dependency-manifest.txt" does not contain the line "theirs-metrics = 1.0.0"
