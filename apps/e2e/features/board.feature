@board
Feature: Kanban board
  As a developer tracking the work on a repository
  I want a board whose cards live inside that repository
  So that planning does not need a second tool, an account, or a network

  The Board is a Kanban view of one repository's work, opened from the toolbar next to the
  graph and the file explorer. A board is a sprint: cards in columns, each card carrying a
  description, a checklist, a type and an identifier of its own.

  A local board is stored in the repository's own `.git`, on a hidden ref, one commit per
  change — so the board is versioned like everything else and never leaves the machine. A
  repository with a connected GitHub account can host a shared board instead, whose cards
  are real issues; everything below is the local one, which needs nothing set up.

  @doc @screenshots
  Scenario: Creating a board for a repository
    A repository starts with no board, and the Board view offers to create the first one.
    A board needs a name — a sprint's name, usually — and can take a card prefix: give it
    `GM` and its cards are numbered `GM-1`, `GM-2`, the identifier you paste into a commit
    message or a pull request. It starts with the three columns every board starts with, To
    do, In progress and Done, which the Columns button changes afterwards.
    Given the app language is English
    And the "feature-branches" fixture repository is opened
    When I open the board
    And I create a board named "Sprint 12" with the card prefix "GM"
    Then the board "Sprint 12" is shown
    And the board shows the columns "To do, In progress, Done"
    And the repository stores 1 board in its own git history
    And the board history records "git-manager: create board"
    And the interface has settled
    And a full-window screenshot is saved as "doc-board-create"

  @doc @screenshots
  Scenario: Adding a card and moving it across the board
    The `+` on a column header opens a new card in that column. Only what has to be decided
    before the card exists is asked for — its type, its identifier and its title — and the
    card then opens as a full record where every other field saves on its own.

    Changing which column a card is in is a drag on the board, and, for the times the card is
    already open, the status button at the top of its right-hand panel. Both write the same
    thing, and both land in the repository as a commit on the board's ref.
    Given the app language is English
    And the "feature-branches" fixture repository is opened
    When I open the board
    And I create a board named "Sprint 12" with the card prefix "GM"
    And I add a card titled "Write the release notes" to the "To do" column
    Then the card "Write the release notes" is identified as "GM-1"
    When I set the status of the card "Write the release notes" to "In progress"
    Then the "In progress" column holds 1 card
    And the "To do" column holds 0 cards
    And the card "Write the release notes" is stored in the "In progress" column
    And the board history records "git-manager: update board card"
    And no error notification is displayed
    And the interface has settled
    And a full-window screenshot is saved as "doc-board-card"

  @doc @screenshots
  Scenario: Filling in a card's record
    Opening a card gives the whole of it: the description and the Definition-of-Done checklist on
    the left with the discussion under them, and on the right the fields that say who has it and
    when it is due. There is no Save button anywhere on it — every field commits on its own, the
    moment you leave it, and each one lands in the repository as its own commit.

    The checklist is ordinary Markdown, the same `- [ ]` GitHub renders, so what the card counts is
    what a reader of the raw text would count. Its progress follows the card back onto the board,
    which is where the number is actually read.
    Given the app language is English
    And the "feature-branches" fixture repository is opened
    When I open the board
    And I create a board named "Sprint 12" with the card prefix "GM"
    And I add a card titled "Rework the exporter" to the "To do" column
    And I open the card "Rework the exporter"
    And I add the checklist item "Agree the output format"
    And I add the checklist item "Migrate the templates"
    And I tick the checklist item "Agree the output format"
    And I assign the card to "Marie Dubois"
    And I set the card priority to "High"
    And I write the comment "Waiting on the design review before the second half"
    Then the card record's checklist reads "1/2"
    And the card record shows the comment "Waiting on the design review before the second half"
    And the board history records "git-manager: comment on board card"
    And no error notification is displayed
    And the interface has settled
    And a full-window screenshot is saved as "doc-board-record"

  @doc @screenshots
  Scenario: Closing a sprint and carrying the unfinished work over
    Closing a sprint freezes what it achieved and, unless you say otherwise, opens its
    successor and moves the unfinished cards into it — they keep their identifiers, their
    checklists and their discussion. A card in a column flagged as "done" counts as finished
    and stays behind.

    The closed sprint does not disappear: it becomes read-only, keeps its report, and is
    reachable again by ticking "Show closed sprints" in the board picker.
    Given the app language is English
    And the "feature-branches" fixture repository is opened
    When I open the board
    And I create a board named "Sprint 12" with the card prefix "GM"
    And I add a card titled "Ship the installer" to the "To do" column
    And I add a card titled "Update the changelog" to the "To do" column
    And I set the status of the card "Update the changelog" to "Done"
    And I close the sprint, carrying the unfinished cards into "Sprint 13"
    Then the board "Sprint 13" is shown
    And the card "Ship the installer" is shown on the board
    And the repository stores 2 boards in its own git history
    When I show closed sprints
    And I select the "Sprint 12" sprint
    Then the sprint is read-only
    And the card "Update the changelog" is shown on the board
    And the sprint report is shown
    And the interface has settled
    And a full-window screenshot is saved as "doc-board-sprint"

  # Not documented: archiving is described on the page above only as the reversible neighbour of
  # deleting. This covers the round trip, and above all the deliberate rule that the global ticket
  # search runs over archived cards too — archiving hides a card from the board without losing it.
  Scenario: An archived card leaves the board but stays findable
    Given the "feature-branches" fixture repository is opened
    When I open the board
    And I create a board named "Sprint 12" with the card prefix "GM"
    And I add a card titled "Rework the onboarding" to the "To do" column
    And I archive the card "Rework the onboarding"
    Then the "To do" column holds 0 cards
    When I search every board for "onboarding"
    Then the ticket "Rework the onboarding" is offered by the search
    When I close the ticket search
    And I restore the card "Rework the onboarding" from the archive
    Then the "To do" column holds 1 card
    And no error notification is displayed
