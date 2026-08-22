@board-recovery
Feature: Recovering a board its repository lost

  A local board lives on a hidden ref inside the repository, and those refs are never pushed. So a
  repository that is deleted and cloned again comes back without a single board, and looks exactly
  like one that never had any — nothing else in the app would ever mention them again.

  That is what the disaster-recovery mirror is for: every write also lands in a bare git repository
  of the board's own under `~/.git-manager/boards/`, outside the repository entirely. The board view
  reads it on open and offers back whatever the mirror still holds and the repository no longer does.

  @doc @screenshots
  Scenario: A board the repository lost is offered back from the mirror
    Opening the board on a repository with no board of its own — because it was deleted and cloned
    again, or the ref was never fetched in the first place — checks the mirror before giving up. If
    it still holds any, a recovery banner offers them back by name, with how many cards each has and
    when it last changed; restoring one writes it straight back into the repository's own history,
    and the offer is gone once there is nothing left the repository doesn't already have.
    Given the app language is English
    And no board backup is left over from an earlier run
    And the "feature-branches" fixture repository is opened
    When I open the board
    And I create a board named "Sprint 1" with the card prefix "GM"
    And I add a card titled "Rework the exporter" to the "To do" column
    Then the board "Sprint 1" is mirrored outside the repository
    # A second, simpler board — a standing backlog rather than a sprint — so the banner below shows
    # recovery is not a sprint-only concept.
    When I create a standing board named "Backlog" with the card prefix "BL"
    Then the board "Backlog" is mirrored outside the repository
    # The disaster itself. Opening the fixture rebuilds it from its script, which throws the
    # repository away and makes it again at the same path (`fixture_init`) — the same state a
    # delete-and-re-clone leaves behind: the work is there, every board ref is gone.
    When the "feature-branches" fixture repository is opened
    And I open the board
    Then the repository stores 0 boards in its own git history
    And the board "Sprint 1" is offered for recovery
    And the board "Backlog" is offered for recovery
    # A board is named after a sprint, and one mirror is kept per lost clone — so the name alone can
    # offer the same thing several times over. The row says how much is in it and when it last
    # changed, which is what makes one of them choosable.
    And the recovery offer for "Sprint 1" says it holds 1 card
    And the recovery offer for "Backlog" says it holds 0 cards
    And the interface has settled
    And a full-window screenshot is saved as "doc-board-recovery"
    When I restore the board "Sprint 1"
    Then the board "Sprint 1" is shown
    And the card "Rework the exporter" is shown on the board
    And the board "Backlog" is offered for recovery
    When I restore the board "Backlog"
    Then the board "Backlog" is shown
    And the repository stores 2 boards in its own git history
    And the board history records "git-manager: restore board from backup"
    And no board is offered for recovery any more
    And no error notification is displayed
