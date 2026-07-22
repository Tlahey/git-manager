@tagmenu
Feature: Tag badge context menu

  A right-click on a tag ref badge in the graph must open the tag-specific context menu, not the
  commit menu shown when right-clicking the rest of the row. Routing relies on the badge carrying a
  `data-ref-tag` marker the row handler reads; this guards that marker on the real WebKit build.

  Scenario: A tag badge carries the context-menu marker
    Given the "showcase" fixture repository is opened
    Then the tag "v0.1.0" badge carries the context-menu marker on its commit row
