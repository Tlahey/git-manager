@patch
Feature: Patch workflows

  As a user who needs to share or apply a change outside a normal push
  I want to create a .patch file from my working tree, or apply one I was sent
  So that I'm not limited to git's own remote-sharing mechanisms

  @doc @screenshots
  Scenario: Creating a patch from the working tree
    Tools → Patch → Create opens a right panel with the same two-zone
    staged/unstaged list the WIP staging panel uses — only what's in the
    Patch (staged) zone ends up in the file, and the hover +/- (or the
    bulk button) moves files between the two. Confirming asks where to
    save the result as a plain .patch file, shareable with anyone even if
    they don't have push access to your remote.
    Given the app language is English
    And AI features are turned off
    And the "stash-stack" fixture repository is opened
    When I open the tools menu
    And I click the Patch "Create" menu item
    And I stage all files in the patch workspace
    And the interface has settled
    Then a full-window screenshot is saved as "doc-patch-create"
    When I click the patch create confirm button
    And I choose "/tmp/git-manager-fixtures/patch-create-test.patch" in the folder picker
    Then the patch workspace closes
    And a real patch file exists at "/tmp/git-manager-fixtures/patch-create-test.patch"

  @doc @screenshots
  Scenario: Applying an external patch file
    Tools → Patch → Apply takes any .patch/.diff file — not necessarily one
    this app made — runs a dry-run check first, and lists the files it
    touches so you can review each diff before committing to it.
    Given the app language is English
    And AI features are turned off
    And a real patch file exists at "/tmp/git-manager-fixtures/patch-apply-test.patch" for "feature-branches"
    And the "feature-branches" fixture repository is opened
    When I open the tools menu
    And I click the Patch "Apply" menu item
    And I click the patch choose-file button
    And I choose "/tmp/git-manager-fixtures/patch-apply-test.patch" in the folder picker
    Then the patch apply confirm button is enabled
    When the interface has settled
    Then a full-window screenshot is saved as "doc-patch-apply"
    When I click the patch apply confirm button
    Then the patch workspace closes
    And the working tree file "app.txt" contains the line "line 3"
