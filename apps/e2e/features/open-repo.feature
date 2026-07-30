@new-tab
Feature: Opening a repository

  As a user
  I want a fast way back into a repository I've already worked in
  So that I don't have to browse the filesystem for it again

  The New Tab page (⌘T) is where every repository session starts. Opening,
  cloning or initializing one all go through the native OS folder picker,
  which isn't part of this page's own behaviour — this feature covers what
  is: the recently-opened list, and picking from it.

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
