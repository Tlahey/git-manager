@file-explorer
Feature: Browse the repository's files

  As a developer reading a repository
  I want to browse its files without leaving the app
  So that I can look something up without switching to an editor or a terminal

  The Files tab swaps the commit graph for a file browser on the same repository: the working tree
  in the panel on the left, the current directory's contents in the middle, and a file search in
  the toolbar. It is a view of the working tree as it is on disk right now, not of a commit, and
  the Graph tab puts the graph back exactly where it was.

  Background:
    Given the app language is English
    And the "feature-branches" fixture repository is opened

  @doc @screenshots
  Scenario: Opening the file explorer lists the working tree
    The Files tab swaps the commit graph for a browser over the same
    repository: the working tree in the left panel, where the branches sit on
    the graph, and the current folder's contents in the middle. The toolbar
    changes with it — a file search replaces the git actions, which have
    nothing to act on here. It shows the working tree as it is on disk right
    now, not a commit, and the Graph tab puts the graph back exactly where it
    was.
    When I open the file explorer
    Then the file explorer is shown
    And the file tree sidebar is shown
    And the file explorer lists the file "app.txt"
    And the interface has settled
    And a full-window screenshot is saved as "doc-file-explorer"

  Scenario: Going back to the Graph tab puts the graph back
    When I open the file explorer
    And I close the file explorer
    Then the file explorer is no longer shown

  Scenario: Filtering the tree narrows it to the matching file
    # `login.txt` only exists on feature/login, so on main the tree has exactly one file to filter
    # — which makes "the filter excluded it" distinguishable from "it was never there".
    When I open the file explorer
    Then the file tree sidebar lists "app.txt"
    When I filter the file tree by "nothing-matches-this"
    Then the file tree sidebar does not list "app.txt"

  Scenario: The tree sidebar can be hidden and stays recoverable
    When I open the file explorer
    And I hide the file tree sidebar
    Then the file tree sidebar is hidden
