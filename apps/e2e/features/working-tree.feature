@commits @staging
Feature: Working tree staging
  As a user with uncommitted changes
  I want to select the working-tree node and see my changes staged for commit
  So that I can craft a commit

  Your uncommitted work is not hidden away in a separate screen: it is the top
  row of the commit graph, sitting exactly where the commit you are about to
  write will land. Selecting it swaps the commit details panel for the staging
  panel, which is where you decide what goes into the next commit and what
  waits for the one after.

  Background:
    Given the "stash-stack" fixture repository is opened

  @doc @screenshots
  Scenario: Decide what goes into the next commit
    The staging panel splits your changes in two: staged files, which are what
    the next commit will contain, and unstaged files, which are everything else
    you have touched. Each file can be moved across on its own, or you can move
    the whole group at once when the change really is one unit of work. Nothing
    is committed until you write a message and confirm, so staging is a
    reversible sorting step — unstage a file and it simply drops back into the
    lower group, with your edits untouched on disk.
    Given the app language is English
    And AI features are turned off
    And the "stash-stack" fixture repository is opened
    When I select the working-tree changes in the graph
    And the interface has settled
    Then the staging panel is shown
    And a full-window screenshot is saved as "doc-staging-panel"

  @doc @screenshots
  Scenario: Read a file's diff before you stage it
    Clicking a file in either group opens its diff, so you can check what you
    are about to commit line by line rather than trusting the filename. This is
    where stray debug statements and half-finished edits get caught: review the
    file, then stage it if it belongs in this commit, or leave it unstaged and
    keep working.
    Given the app language is English
    And AI features are turned off
    And the "stash-stack" fixture repository is opened
    When I select the working-tree changes in the graph
    And I open the diff for "config.yml"
    And the interface has settled
    Then a full-window screenshot is saved as "doc-staging-file-diff"

  Scenario: Selecting the working-tree node shows the staging panel
    When I select the working-tree changes in the graph
    Then the staging panel is shown

  @visual
  Scenario: The staging panel matches the reference snapshot
    When I select the working-tree changes in the graph
    Then the staging panel matches the visual snapshot "wip-staging-panel"

  @visual
  Scenario: Viewing a changed file shows its diff
    When I select the working-tree changes in the graph
    And I open the diff for "config.yml"
    Then the file diff matches the visual snapshot "wip-file-diff"

  Scenario: Staging an individual unstaged file
    When I select the working-tree changes in the graph
    And I stage the file "IN_PROGRESS.md"
    Then the file "IN_PROGRESS.md" is staged

  Scenario: Unstaging an individual staged file
    When I select the working-tree changes in the graph
    And I unstage the file "config.yml"
    Then the file "config.yml" is not staged

  @doc @screenshots
  Scenario: Bulk-staging all unstaged files
    Each zone's header carries its own "stage all"/"unstage all" button, for when the change
    really is one unit of work and sorting file by file would just be busywork — one click moves
    every unstaged file into the next commit at once.
    Given the app language is English
    And AI features are turned off
    And the "stash-stack" fixture repository is opened
    When I select the working-tree changes in the graph
    And I stage all unstaged files
    Then the file "IN_PROGRESS.md" is staged
    And the interface has settled
    And a full-window screenshot is saved as "doc-staging-bulk-stage"

  @doc @screenshots
  Scenario: Discarding a file's changes throws them away
    Next to each changed file, the discard button undoes your edits to that
    one file and puts it back to what the last commit says — the working
    tree's equivalent of closing a document without saving. It asks for
    confirmation first, because unlike everything else here there is no undo:
    the changes were never committed, so Git has no copy to restore.
    Given the app language is English
    And AI features are turned off
    And the "stash-stack" fixture repository is opened
    When I select the working-tree changes in the graph
    And the interface has settled
    And a full-window screenshot is saved as "doc-discard-changes"
    And I discard the changes to "config.yml"
    Then the file "config.yml" has no working-tree changes
    And no error notification is displayed

  @doc @screenshots
  Scenario: Bulk-unstaging all staged files
    The staged zone carries the same button in reverse: unstage everything at once to start the
    sorting over, rather than clicking each file back down one at a time.
    Given the app language is English
    And AI features are turned off
    And the "stash-stack" fixture repository is opened
    When I select the working-tree changes in the graph
    And I unstage all staged files
    Then the file "config.yml" is not staged
    And the interface has settled
    And a full-window screenshot is saved as "doc-staging-bulk-unstage"
