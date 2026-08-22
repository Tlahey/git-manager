@board-cards
Feature: The card record and the board's own shape

  What `board.feature` deliberately leaves out: everything *inside* a card — its checklist, its
  discussion, the fields of its side panel, its relations to other cards — and everything that
  reshapes the board around it: its columns, its settings, deleting a card, moving one to another
  sprint. Most scenarios here are curated onto the board's documentation page alongside
  `board.feature`'s own — the card's side-panel fields, its relations, its columns, its settings,
  deleting a card and moving one to another sprint — the rest exist purely to catch a regression
  and stay untagged, since a scenario written to pin a bug is not automatically a tour of the
  feature.

  Every scenario starts from a repository with no board at all, and builds the one it needs through
  the UI — the only way a board comes into being. The assertions end on the repository's own git
  ref (`refs/git-manager/board/<id>/state`), because a render the backend never agreed to would
  satisfy a DOM assertion just as well.

  Scenario: A checklist ticked on the card record counts on the card's face
    Given the "feature-branches" fixture repository is opened
    When I open the board
    And I create a board named "Sprint 12" with the card prefix "GM"
    And I add a card titled "Polish the toolbar" to the "To do" column
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
    Given the "feature-branches" fixture repository is opened
    When I open the board
    And I create a board named "Sprint 12" with the card prefix "GM"
    And I add a card titled "Rework the exporter" to the "To do" column
    When I open the card "Rework the exporter"
    And I write the comment "Waiting on the design review"
    Then the card record shows the comment "Waiting on the design review"
    When I close the card record
    And I open the card "Rework the exporter"
    Then the card record shows the comment "Waiting on the design review"
    And the card "Rework the exporter" stores the comment "Waiting on the design review"
    And the board history records "git-manager: comment on board card"
    And no error notification is displayed

  # A description is markdown, and the record *renders* it rather than printing what was typed — the
  # bug that shipped before it did was a card showing its own asterisks. The global ticket search
  # reads that description too, as plain text: a card is findable by a word nobody thought to put in
  # its title, and the row quotes the sentence it found rather than leaving the reader to guess why
  # a card with an unrelated title came back.
  Scenario: A card's description is rendered as markdown, and searched as text
    Given the "feature-branches" fixture repository is opened
    When I open the board
    And I create a board named "Sprint 12" with the card prefix "GM"
    And I add a card titled "Rework the exporter" to the "To do" column
    When I open the card "Rework the exporter"
    And I give the card the description "Blocked on the **parquet** encoder"
    Then the card record renders "parquet" in bold
    And the card "Rework the exporter" is stored with the description "Blocked on the **parquet** encoder"
    When I close the card record
    And I search every board for "parquet"
    Then the ticket "Rework the exporter" is offered by the search
    And the search result for "Rework the exporter" quotes "Blocked on the parquet encoder"
    When I close the ticket search
    Then no error notification is displayed

  # The rule is enforced by the storage shape rather than by validation: a card holds only
  # `blockedReason`, so "blocked" *is* "has a reason" and the two cannot drift apart. Turning the
  # switch on is therefore allowed to show an empty required field — and must write nothing at all
  # until there is something to write.
  Scenario: A card cannot be marked blocked without saying what is blocking it
    Given the "feature-branches" fixture repository is opened
    When I open the board
    And I create a board named "Sprint 12" with the card prefix "GM"
    And I add a card titled "Migrate the database" to the "In progress" column
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
  @doc @screenshots
  Scenario: Every field of the card's side panel saves on its own
    The right-hand panel is the rest of what a card can carry: who has it, how urgent it is,
    when it is due, and the tags that group it with others like it. Every field commits the
    moment you leave it — there is no Save button anywhere on the panel — and each one lands
    in the repository as its own commit.
    Given the app language is English
    And the "feature-branches" fixture repository is opened
    When I open the board
    And I create a board named "Sprint 12" with the card prefix "GM"
    And I add a card titled "Cut the release" to the "To do" column
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
    And the interface has settled
    And a full-window screenshot is saved as "doc-card-options"
    And no error notification is displayed

  # Only the forward half of a relation is stored (`features/board/lib/cardLinks.ts`): saying "A is
  # blocked by B" writes `blocks` on **B**, and A's side of it is derived on read. Both ends are
  # asserted here, and so is the asymmetry on disk — a second stored half would be a second thing
  # that can disagree, and a half-deleted link has no natural repair.
  Scenario: Declaring a card blocked writes the relation on the card that blocks it
    Given the "feature-branches" fixture repository is opened
    When I open the board
    And I create a board named "Sprint 12" with the card prefix "GM"
    And I add a card titled "Ship the installer" to the "To do" column
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

  # The documented counterpart of the scenario above: the same gesture, without the internal
  # storage asymmetry a reader has no reason to know about.
  @doc @screenshots
  Scenario: Linking a card to another states how they relate
    Cards relate to each other by more than sitting on the same board: a card can block
    another, be blocked by it, contain it, be part of it, or simply relate to it. Adding one
    writes on both cards at once — the blocked card lists what blocks it, and the one doing
    the blocking lists what it blocks — so either card tells the whole story on its own,
    without opening the other.
    Given the app language is English
    And the "feature-branches" fixture repository is opened
    When I open the board
    And I create a board named "Sprint 12" with the card prefix "GM"
    And I add a card titled "Ship the installer" to the "To do" column
    And I add a card titled "Sign the build" to the "To do" column
    When I open the card "Ship the installer"
    And I link the card "Sign the build" as "Is blocked by"
    Then the card record lists "Sign the build" under "Blocked by"
    And the interface has settled
    And a full-window screenshot is saved as "doc-card-relations"
    And no error notification is displayed

  @doc @screenshots
  Scenario: A column added to the board takes cards like any other
    The three starting columns are a default, not a fixed shape — the Columns button adds, removes
    and reorders them, and flags whichever one means "done" so the board's own definition of
    finished follows it. A new column takes cards exactly like To do or In progress always could.
    Given the "feature-branches" fixture repository is opened
    When I open the board
    And I create a board named "Sprint 12" with the card prefix "GM"
    And I open the column editor
    And I add the column "In review"
    And I flag the column "In review" as counting for done
    And I save the columns
    Then the board shows the columns "To do, In progress, Done, In review"
    And the board history records "git-manager: update board columns"
    And the board stores the column "In review" as counting for done
    When I add a card titled "Review the migration" to the "In review" column
    Then the "In review" column holds 1 card
    And the card "Review the migration" is stored in the "In review" column
    And the interface has settled
    And a full-window screenshot is saved as "doc-board-columns"
    And no error notification is displayed

  @doc @screenshots
  Scenario: Removing a column does not swallow the cards that were in it
    The board only renders a card into a column that exists, so a card left behind in a removed
    one would be invisible: not on the board, not in the archive, not reachable by searching.
    Removing a column re-homes its cards into the first remaining one instead, in the same commit.
    Given the "feature-branches" fixture repository is opened
    When I open the board
    And I create a board named "Sprint 12" with the card prefix "GM"
    And I add a card titled "Draft the release notes" to the "In progress" column
    When I open the column editor
    And I remove the column "In progress"
    And I save the columns
    Then the board shows the columns "To do, Done"
    And the card "Draft the release notes" is shown on the board
    And the "To do" column holds 1 card
    And the card "Draft the release notes" is stored in the "To do" column
    And the interface has settled
    And a full-window screenshot is saved as "doc-board-columns-removed"
    And no error notification is displayed

  @doc @screenshots
  Scenario: Renaming the board and its prefix leaves the existing cards' identifiers alone
    A card carries its own prefix, which is what lets its identifier survive a move to another
    board — so editing the board's list of prefixes never touches a card. `GM-1` stays `GM-1`
    after the board stops offering `GM` at all, and the next card drawn from `OPS` starts fresh.
    Given the "feature-branches" fixture repository is opened
    When I open the board
    And I create a board named "Sprint 12" with the card prefix "GM"
    And I add a card titled "Cut the release" to the "To do" column
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
    And the interface has settled
    And a full-window screenshot is saved as "doc-board-settings"
    And no error notification is displayed

  # Deleting is the one card action nothing undoes, so the confirmation offers the reversible
  # neighbour someone reaching for it usually wanted: archiving, which takes the card off the board
  # and keeps every word of it.
  Scenario: The delete confirmation offers archiving instead, and deletes for good when asked
    Given the "feature-branches" fixture repository is opened
    When I open the board
    And I create a board named "Sprint 12" with the card prefix "GM"
    And I add a card titled "Retire the old parser" to the "To do" column
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

  # The documented counterpart of the scenario above: just the confirmation and the escape hatch a
  # reader would actually reach for, without the archive/restore/delete round trip a regression
  # needs to pin the whole behaviour.
  @doc @screenshots
  Scenario: Deleting a card offers archiving as the reversible way out
    Deleting a card is the one action nothing undoes, so its confirmation offers the
    reversible neighbour first: archive it instead, and it comes back exactly as it was
    whenever it is needed again. Confirming the deletion itself, with archiving turned down,
    throws the card away for good — description, checklist and comment thread included.
    Given the app language is English
    And the "feature-branches" fixture repository is opened
    When I open the board
    And I create a board named "Sprint 12" with the card prefix "GM"
    And I add a card titled "Retire the old parser" to the "To do" column
    When I open the card "Retire the old parser"
    And I ask to delete the card
    Then the delete confirmation is shown
    And the interface has settled
    And a full-window screenshot is saved as "doc-card-delete"
    When I confirm the deletion
    Then the "To do" column holds 0 cards
    And no card titled "Retire the old parser" is stored in the repository
    And no error notification is displayed

  # The card keeps its id, its identifier and its column: the prefix belongs to the card, and a
  # column is matched by id across boards, so "In progress" on one sprint is "In progress" on the
  # next rather than a fall back to the first column.
  @doc @screenshots
  Scenario: A card moved to another sprint keeps its identifier and its column
    A card that outlives one sprint does not have to be recreated in the next: move it, and it
    keeps its own identifier and lands in the column of the same name — "In progress" on one
    sprint is "In progress" on the next, matched by the column itself rather than falling back
    to the first one. The sprint it left no longer lists it; the one it landed on now does.
    Given the app language is English
    And the "feature-branches" fixture repository is opened
    When I open the board
    And I create a board named "Sprint 12" with the card prefix "GM"
    And I add a card titled "Package the app" to the "In progress" column
    And I create a board named "Sprint 13" with the card prefix "GM"
    And I select the "Sprint 12" sprint
    When I open the card "Package the app"
    And I ask to move the card to another board
    And I move the card to the "Sprint 13" board
    Then the "In progress" column holds 0 cards
    When I select the "Sprint 13" sprint
    Then the card "Package the app" is shown on the board
    And the card "Package the app" is identified as "GM-1"
    And the interface has settled
    And a full-window screenshot is saved as "doc-card-move-sprint"
    And the "Sprint 13" board stores the card "Package the app" in the "In progress" column
    And the "Sprint 12" board stores no card titled "Package the app"
    And no error notification is displayed
