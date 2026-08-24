@ref-drop
Feature: Acting on the commit graph's ref-to-ref drop menu

  As a developer relating two branches at a glance
  I want dropping one ref badge onto another to offer the right git action
  So that fast-forwarding, merging, or opening a pull request doesn't need the toolbar or a terminal

  Dragging a branch or tag badge onto another in the commit graph pops a menu — fast-forward,
  merge, rebase, interactive rebase, push, reset, or start a pull request — each wired to a real
  git operation (`useRefDrop.ts`). The menu itself is a real native macOS menu, not a DOM element,
  so — same as every other native-menu-only flow in this suite (see `branch-rename.steps.ts`) —
  these scenarios call the exact action a real click would through the e2e-only bridge
  `RefDropContext.tsx` exposes for this reason (`window.__e2eRefDropActions`), then assert the real
  git/UI effect the click would have produced.

  Background:
    Given the "feature-branches" fixture repository is opened

  @doc
  Scenario: Fast-forwarding a target branch up to a descendant source
    Dropping a source that directly descends from the target puts fast-forward on the menu: no
    merge commit, the target branch simply moves its pointer up to match — the same fast-forward
    `git merge --ff-only` would do, wired to a drag instead of a command.
    Given branch "ff-source" exists one commit ahead of "main"
    When I run the ref-drop action "fast-forward" dropping "ff-source" onto "main"
    Then the branch "main" points at the same commit as "ff-source"

  @doc @screenshots
  Scenario: Merging a source branch into a target branch
    Two branches that have diverged get a real merge instead: the target gains a new commit with
    both tips as parents, exactly as running `git merge` from the target branch would — without
    leaving the graph to open a terminal.
    When I run the ref-drop action "merge" dropping "feature/login" onto "main"
    Then the branch "main" is a merge commit with "feature/login" as a parent
    And the interface has settled
    And a full-window screenshot is saved as "doc-ref-drop-merge"
    And no error notification is displayed

  @doc @screenshots
  Scenario: Starting a pull request pre-fills the head and base from the drop
    The same drop also offers to start a pull request between the two branches. Pick it, and the
    create-PR form opens with the source and target already filled in as head and base, so relating
    two branches in the graph carries straight into the form instead of being retyped there.
    When I run the ref-drop action "start-pr" dropping "feature/login" onto "main"
    Then the create-pr form is open with head "feature/login" and base "main"
    And the interface has settled
    And a full-window screenshot is saved as "doc-ref-drop-start-pr"
