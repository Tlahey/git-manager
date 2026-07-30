@new-tab
Feature: Opening a repository

  As a user
  I want a fast way back into a repository I've already worked in
  So that I don't have to browse the filesystem for it again

  The New Tab page (⌘T) is where every repository session starts: pick a
  repository you've already opened, or start a new one via Open, Clone or
  Create — all three end at your OS's native folder picker, so this page's
  own screenshot is of the list you pick from.

  Background:
    Given the "stash-stack" fixture repository is listed as recent

  @doc @screenshots
  Scenario: Picking a recent repository reopens it
    A blank tab (⌘T) lists the repositories you've opened before, most
    recent first. Picking one opens it straight into the working tab —
    the blank placeholder is consumed by the repository it was used to
    open, rather than lingering next to it.
    Given the app language is English
    And AI features are turned off
    When I open a new tab
    And the interface has settled
    Then a full-window screenshot is saved as "doc-new-tab"
    When I pick the "stash-stack" recent repository
    Then the "stash-stack" repository is open and focused

  Scenario: Opening an already-open recent repository focuses its tab instead of duplicating it
    Given the "stash-stack" fixture repository is already open in a tab
    When I open a new tab
    And I pick the "stash-stack" recent repository
    Then the "stash-stack" repository is open and focused
    And only one tab is open for it

  # Open/Clone/Create all end at the native OS folder picker, which a real user sees but
  # WebDriver can't drive. `pickFolder.ts` swaps in a plain in-webview debug dialog for any e2e
  # build (never rendered, and never captured in a @doc screenshot, otherwise) — these three
  # regression scenarios drive that instead, proving the three buttons actually work end to end.

  Scenario: Opening a folder through the picker
    When I open a new tab
    And I click the New Tab "Open" button
    And I choose "/tmp/git-manager-fixtures/stash-stack" in the folder picker
    Then a repository is open at "/tmp/git-manager-fixtures/stash-stack"

  Scenario: Creating a new repository through the picker
    Given "/tmp/git-manager-fixtures/e2e-create-dest" is an empty directory on disk
    When I open a new tab
    And I click the New Tab "Create" button
    And I choose "/tmp/git-manager-fixtures/e2e-create-dest" in the folder picker
    Then a repository is open at "/tmp/git-manager-fixtures/e2e-create-dest"

  Scenario: Cloning a repository through the picker
    Given "/tmp/git-manager-fixtures-clone-dest" is an empty directory on disk
    When I open a new tab
    And I click the New Tab "Clone" button
    And I enter "/tmp/git-manager-fixtures/stash-stack" as the clone URL
    And I click the clone dialog's Browse button
    And I choose "/tmp/git-manager-fixtures-clone-dest" in the folder picker
    And I click the clone dialog's Clone button
    Then a repository is open at "/tmp/git-manager-fixtures-clone-dest/stash-stack"
