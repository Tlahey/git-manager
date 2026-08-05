@board-cards
Feature: Kanban board — the card record and the board's own shape
  As a developer tracking the work on a repository
  I want a card to hold the whole state of one piece of work
  So that the board describes the work rather than only placing it

  What `board.feature` deliberately leaves out: everything *inside* a card — its checklist, its
  discussion, the fields of its side panel, its relations to other cards — and everything that
  reshapes the board around it: its columns, its settings, deleting a card, moving one to another
  sprint.

  Nothing here is tagged `@doc`. The board's documentation page is curated from `board.feature`;
  these are regressions, and a scenario that exists to catch a bug is not a tour of the feature.

  Every scenario starts from a repository with no board at all, and builds the one it needs through
  the UI — the only way a board comes into being. The assertions end on the repository's own git
  ref (`refs/git-manager/board/<id>/state`), because a render the backend never agreed to would
  satisfy a DOM assertion just as well.

  Background:
    Given the "feature-branches" fixture repository is opened
    When I open the board
    And I create a board named "Sprint 12" with the card prefix "GM"

  Scenario: A checklist ticked on the card record counts on the card's face
    Given I add a card titled "Polish the toolbar" to the "To do" column
    When I open the card "Polish the toolbar"
    And I add the checklist item "Write the changelog"
    And I add the checklist item "Ship the build"
    Then the card record's checklist reads "0/2"
    When I tick the checklist item "Write the changelog"
    Then the card record's checklist reads "1/2"
    When I close the card record
    Then the card "Polish the toolbar" shows the checklist progress "1/2"
    And the card "Polish the toolbar" stores "Write the changelog" as done
    And the card "Polish the toolbar" stores "Ship the build" as still to do
    And the board history records "git-manager: update board card"
    And no error notification is displayed

  # Comments are append-only and taken through their own backend call rather than as part of a card
  # patch, so they get their own commit subject — and a card's discussion is the one part of it that
  # would be silently lost by a write that only round-tripped the fields.
  Scenario: A comment survives closing and reopening the card
    Given I add a card titled "Rework the exporter" to the "To do" column
    When I open the card "Rework the exporter"
    And I write the comment "Waiting on the design review"
    Then the card record shows the comment "Waiting on the design review"
    When I close the card record
    And I open the card "Rework the exporter"
    Then the card record shows the comment "Waiting on the design review"
    And the card "Rework the exporter" stores the comment "Waiting on the design review"
    And the board history records "git-manager: comment on board card"
    And no error notification is displayed

  # The rule is enforced by the storage shape rather than by validation: a card holds only
  # `blockedReason`, so "blocked" *is* "has a reason" and the two cannot drift apart. Turning the
  # switch on is therefore allowed to show an empty required field — and must write nothing at all
  # until there is something to write.
  Scenario: A card cannot be marked blocked without saying what is blocking it
    Given I add a card titled "Migrate the database" to the "In progress" column
    When I open the card "Migrate the database"
    And I turn the blocked switch on
    Then the card record asks for a blocking reason
    And the card "Migrate the database" is not stored as blocked
    When I give the blocking reason "The staging server is down"
    Then the card "Migrate the database" is stored as blocked on "The staging server is down"
    When I close the card record
    Then the card "Migrate the database" is flagged as blocked on the board
    And no error notification is displayed

  # Every field of the side panel saves on its own, with no Save button — and on a local board each
  # write moves the *board's* ref tip, which is the revision the next write has to present. So four
  # edits in a row are also a test of the revision being refreshed between them.
  Scenario: Every field of the card's side panel saves on its own
    Given I add a card titled "Cut the release" to the "To do" column
    When I open the card "Cut the release"
    And I assign the card to "Marie Dubois"
    And I set the card priority to "High"
    And I set the card due date to "2031-03-04"
    And I tag the card "infra"
    Then the card "Cut the release" is stored as assigned to "Marie Dubois"
    And the card "Cut the release" is stored with the priority "high"
    And the card "Cut the release" is stored with the due date "2031-03-04"
    And the card "Cut the release" is stored with the tag "infra"
    And the board offers the tag "infra"
    And no error notification is displayed

  # Only the forward half of a relation is stored (`features/board/lib/cardLinks.ts`): saying "A is
  # blocked by B" writes `blocks` on **B**, and A's side of it is derived on read. Both ends are
  # asserted here, and so is the asymmetry on disk — a second stored half would be a second thing
  # that can disagree, and a half-deleted link has no natural repair.
  Scenario: Declaring a card blocked writes the relation on the card that blocks it
    Given I add a card titled "Ship the installer" to the "To do" column
    And I add a card titled "Sign the build" to the "To do" column
    When I open the card "Ship the installer"
    And I link the card "Sign the build" as "Is blocked by"
    Then the card record lists "Sign the build" under "Blocked by"
    When I close the card record
    And I open the card "Sign the build"
    Then the card record lists "Ship the installer" under "Blocks"
    When I close the card record
    Then the card "Sign the build" stores a "blocks" relation to the card "Ship the installer"
    And the card "Ship the installer" stores no relation of its own
    # And back the other way: removing the relation from the card that only *derives* it has to
    # write on the card that owns the stored half, or the row comes back on the next read.
    When I open the card "Ship the installer"
    And I remove the relation to "Sign the build"
    Then the card record lists no relation
    When I close the card record
    Then the card "Sign the build" stores no relation of its own
    And no error notification is displayed

  Scenario: A column added to the board takes cards like any other
    When I open the column editor
    And I add the column "In review"
    And I flag the column "In review" as counting for done
    And I save the columns
    Then the board shows the columns "To do, In progress, Done, In review"
    And the board history records "git-manager: update board columns"
    And the board stores the column "In review" as counting for done
    When I add a card titled "Review the migration" to the "In review" column
    Then the "In review" column holds 1 card
    And the card "Review the migration" is stored in the "In review" column
    And no error notification is displayed

  # The board only renders a card into a column that exists, so a card left behind in a removed one
  # would be invisible: not on the board, not in the archive, not reachable by searching. Removing a
  # column therefore re-homes its cards into the first remaining one, in the same commit — the rule
  # `move_cards_to_board` already applies when a card lands on a board without its column.
  Scenario: Removing a column does not swallow the cards that were in it
    Given I add a card titled "Draft the release notes" to the "In progress" column
    When I open the column editor
    And I remove the column "In progress"
    And I save the columns
    Then the board shows the columns "To do, Done"
    And the card "Draft the release notes" is shown on the board
    And the "To do" column holds 1 card
    And the card "Draft the release notes" is stored in the "To do" column
    And no error notification is displayed

  # A card carries its own prefix, which is what lets its identifier survive a move to another board
  # — so editing the board's list of prefixes never touches a card. `GM-1` stays `GM-1` after the
  # board stops offering `GM` at all, and the next card drawn from `OPS` starts its own sequence.
  Scenario: Renaming the board and its prefix leaves the existing cards' identifiers alone
    Given I add a card titled "Cut the release" to the "To do" column
    Then the card "Cut the release" is identified as "GM-1"
    When I open the board settings
    And I rename the board to "Sprint 12 hardening"
    And I add the card prefix "OPS"
    And I remove the card prefix "GM"
    And I add the board tag "infra"
    And I save the board settings
    Then the board "Sprint 12 hardening" is shown
    And the board history records "git-manager: update board settings"
    And the board offers the card prefixes "OPS"
    And the board offers the tag "infra"
    And the card "Cut the release" is identified as "GM-1"
    When I add a card titled "Rotate the signing key" to the "To do" column
    Then the card "Rotate the signing key" is identified as "OPS-1"
    And no error notification is displayed

  # Deleting is the one card action nothing undoes, so the confirmation offers the reversible
  # neighbour someone reaching for it usually wanted: archiving, which takes the card off the board
  # and keeps every word of it.
  Scenario: The delete confirmation offers archiving instead, and deletes for good when asked
    Given I add a card titled "Retire the old parser" to the "To do" column
    When I open the card "Retire the old parser"
    And I ask to delete the card
    Then the delete confirmation is shown
    When I archive the card from the delete confirmation
    Then the card record is shown again
    When I close the card record
    Then the "To do" column holds 0 cards
    And the card "Retire the old parser" is stored as archived
    When I restore the card "Retire the old parser" from the archive
    Then the "To do" column holds 1 card
    When I open the card "Retire the old parser"
    And I ask to delete the card
    And I confirm the deletion
    Then the "To do" column holds 0 cards
    And no card titled "Retire the old parser" is stored in the repository
    And the board history records "git-manager: delete board card"
    And no error notification is displayed

  # The card keeps its id, its identifier and its column: the prefix belongs to the card, and a
  # column is matched by id across boards, so "In progress" on one sprint is "In progress" on the
  # next rather than a fall back to the first column.
  Scenario: A card moved to another sprint keeps its identifier and its column
    Given I add a card titled "Package the app" to the "In progress" column
    And I create a board named "Sprint 13" with the card prefix "GM"
    And I select the "Sprint 12" sprint
    When I open the card "Package the app"
    And I ask to move the card to another board
    And I move the card to the "Sprint 13" board
    Then the "In progress" column holds 0 cards
    When I select the "Sprint 13" sprint
    Then the card "Package the app" is shown on the board
    And the card "Package the app" is identified as "GM-1"
    And the "Sprint 13" board stores the card "Package the app" in the "In progress" column
    And the "Sprint 12" board stores no card titled "Package the app"
    And no error notification is displayed
