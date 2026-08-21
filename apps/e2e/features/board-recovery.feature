@board-recovery
Feature: Kanban board — recovering a board its repository lost

  A local board lives on a hidden ref inside the repository, and those refs are never pushed. So a
  repository that is deleted and cloned again comes back without a single board, and looks exactly
  like one that never had any — nothing else in the app would ever mention them again.

  That is what the disaster-recovery mirror is for: every write also lands in a bare git repository
  of the board's own under `~/.git-manager/boards/`, outside the repository entirely. The board view
  reads it on open and offers back whatever the mirror still holds and the repository no longer does.

  Scenario: A board the repository lost is offered back from the mirror
    Given no board backup is left over from an earlier run
    And the "feature-branches" fixture repository is opened
    When I open the board
    And I create a board named "Sprint 12" with the card prefix "GM"
    And I add a card titled "Rework the exporter" to the "To do" column
    Then the board "Sprint 12" is mirrored outside the repository
    # The disaster itself. Opening the fixture rebuilds it from its script, which throws the
    # repository away and makes it again at the same path (`fixture_init`) — the same state a
    # delete-and-re-clone leaves behind: the work is there, every board ref is gone.
    When the "feature-branches" fixture repository is opened
    And I open the board
    Then the repository stores 0 boards in its own git history
    And the board "Sprint 12" is offered for recovery
    When I restore the board "Sprint 12"
    Then the board "Sprint 12" is shown
    And the card "Rework the exporter" is shown on the board
    And the repository stores 1 board in its own git history
    And the board history records "git-manager: restore board from backup"
    And no board is offered for recovery any more
    And no error notification is displayed
