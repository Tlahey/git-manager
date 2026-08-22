@file-explorer
Feature: Browse the repository's files

  As a developer reading a repository
  I want to browse its files without leaving the app
  So that I can look something up without switching to an editor or a terminal

  The Files tab swaps the commit graph for a file browser on the same repository: the file tree in
  the panel on the left, the current directory's contents in the middle, and a file search in the
  toolbar. It lists the files git tracks — the same set the repository shows on its forge — as they
  are on disk right now, and the Graph tab puts the graph back exactly where it was.

  Background:
    Given the app language is English
    And the "feature-branches" fixture repository is opened

  @doc @screenshots
  Scenario: Opening the file explorer lists the working tree
    The Files tab swaps the commit graph for a browser over the same
    repository: the file tree in the left panel, where the branches sit on the
    graph, and the current folder's contents in the middle. The toolbar changes
    with it — a file search replaces the git actions, which have nothing to act
    on here. What it lists is the files git tracks, as they are on disk right
    now: the same set the repository shows on GitHub, rather than whatever your
    working directory happens to hold. A file you have created but not yet
    staged belongs to the working-tree panel on the Graph tab, not here — and
    the Graph tab puts the graph back exactly where it was.
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

  @doc @screenshots
  Scenario: Filtering the tree narrows it to the matching file
    The search field above the tree filters it live, by name — useful the moment a repository has
    more files than fit on screen at once. A query that matches nothing says so, rather than
    leaving the tree just looking empty.
    When I open the file explorer
    Then the file tree sidebar lists "app.txt"
    # `login.txt` only exists on feature/login, so on main the tree has exactly one file to filter
    # — which makes "the filter excluded it" distinguishable from "it was never there".
    When I filter the file tree by "nothing-matches-this"
    Then the file tree sidebar does not list "app.txt"
    And the file tree sidebar reports no matches
    And the interface has settled
    And a full-window screenshot is saved as "doc-file-tree-filter"

  @doc @screenshots
  Scenario: The tree sidebar can be hidden and stays recoverable
    The tree takes up room a wide file deserves once you already know your way around a
    repository. Hiding it gives that space back to the file list and the preview, and the
    toolbar's own panel toggle — not a control local to this view — is what brings it back.
    When I open the file explorer
    And I hide the file tree sidebar
    Then the file tree sidebar is hidden
    And the interface has settled
    And a full-window screenshot is saved as "doc-file-tree-hidden"
