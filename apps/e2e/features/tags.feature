@tag
Feature: Tagging a commit
  As a user marking a release
  I want to tag any commit, lightweight or annotated
  So that the point I care about has a name I can come back to

  A tag is a permanent name for one commit — a release, a known-good build,
  anything worth finding again. Any commit can take one, not just the latest:
  select it in the graph, run "Create tag" from the command palette, and the
  tag appears as a badge on its row.

  Background:
    Given the "rollback-history" fixture repository is opened

  @doc @screenshots
  Scenario: Tagging an earlier commit from the palette
    Select the commit you want to mark, open the palette with ⌘K and pick
    "Create tag": you name it, confirm, and the badge appears on that row —
    on the commit you chose, not on HEAD. This is a *lightweight* tag, just a
    name pointing at the commit.
    Given the app language is English
    And AI features are turned off
    When I select the "HEAD~1" commit in the graph
    And I open the command palette
    Then the command palette shows commit actions for "HEAD~1"
    When I pick "Create tag here" from the palette
    Then the tag name input is shown
    When I enter the tag name "v-from-palette"
    And I confirm the tag creation
    Then the tag "v-from-palette" points at the commit "chore: bump counter to 3"
    And the tag "v-from-palette" is shown as a ref in the graph
    And the interface has settled
    And a full-window screenshot is saved as "doc-tag-created"

  @doc
  Scenario: Creating an annotated tag instead
    "Create annotated tag" makes a tag that is an object of its own, carrying
    a tagger, a date and a message — what release tooling generally expects,
    and what `git describe` prefers. Same flow, a different palette entry.
    Given the app language is English
    When I select the "HEAD~1" commit in the graph
    And I open the command palette
    Then the command palette shows commit actions for "HEAD~1"
    When I pick "Create annotated tag here" from the palette
    Then the tag name input is shown
    When I enter the tag name "v-annotated-from-palette"
    And I confirm the tag creation
    Then the tag "v-annotated-from-palette" points at the commit "chore: bump counter to 3"
    And the tag "v-annotated-from-palette" is annotated

  # Guards the `data-ref-tag` marker the row handler reads to route a right-click on a tag badge
  # to the tag menu rather than the commit menu — a real regression on the WebKit build, and not
  # something a reader needs, hence no @doc.
  Scenario: A tag badge carries its own context-menu marker
    Given the "showcase" fixture repository is opened
    Then the tag "v0.1.0" badge carries the context-menu marker on its commit row

  # Publishing and removing tags. These live on the tag's context menu, which WebDriver cannot open
  # — the palette entries they run through (`useRefCommands`) are the keyboard route to the same
  # handlers, added so these actions stop requiring a mouse.
  @doc
  Scenario: Publishing a tag to the remote, and taking it back
    A tag you create is yours alone until you publish it: "Push tag" sends it to
    the remote, and the two deletions are deliberately separate — removing your
    local copy leaves the published one alone, and removing the remote's copy
    (which asks for confirmation, since it affects everyone who has fetched it)
    leaves yours.
    Given the app language is English
    And the "remote-ahead" fixture repository is opened
    When I open the command palette
    And I pick "Push a tag…" from the palette
    And I pick "v0.9" from the palette
    Then the remote "origin" has the tag "v0.9"
    And no error notification is displayed
    When I open the command palette
    And I pick "Delete a remote tag…" from the palette
    And I pick "v1.0" from the palette
    Then the remote tag deletion dialog is shown
    When I confirm the remote tag deletion
    Then the remote "origin" no longer has the tag "v1.0"
    # The local copy is untouched: the two deletions are separate actions on purpose.
    And the local tag "v1.0" still exists

  Scenario: Deleting a local tag leaves the remote's copy alone
    Given the "remote-ahead" fixture repository is opened
    When I open the command palette
    And I run the command palette action "ref-deleteTag"
    And I run the command palette action "ref-pick-deleteTag-v1.0"
    Then the local tag "v1.0" no longer exists
    And the remote "origin" has the tag "v1.0"
    And no error notification is displayed
