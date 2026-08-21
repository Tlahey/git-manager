@board-branch
Feature: Kanban board — from a card to a branch, and back when it merges

  The one thing a board hosted anywhere else cannot do: start the work from the ticket. A card's
  record carries a branch section — create the branch this card is about, check it out, give it a
  worktree of its own — and the loop closes on its own at the other end, when that branch is merged
  and the card moves to its board's done column without anybody dragging it there.

  Everything below is asserted against git rather than the render: the branch is read back with
  `git branch --list`, the checkout with `rev-parse`, the worktree with `git worktree list`, and the
  card's own half of the link out of the board's ref.

  # Untagged, like `board-cards.feature`: the board's documentation pages are curated from
  # `board.feature`, and a page is generated per documented scenario, so widening the tour is a
  # decision to take on purpose rather than inherit from a regression suite.
  #
  # Unlinking is about the card's memory only — the branch, and everything committed on it, stays
  # exactly where it is, which is the half a DOM assertion cannot tell apart from a deletion.
  Scenario: Creating the branch a card is about, from the card itself
    Given the "feature-branches" fixture repository is opened
    When I open the board
    And I create a board named "Sprint 12" with the card prefix "GM"
    And I add a card titled "Rework the exporter" to the "To do" column
    And I open the card "Rework the exporter"
    And I create a branch for the card
    Then the card record shows the linked branch "card/rework-the-exporter"
    And the branch "card/rework-the-exporter" exists in the repository
    And the repository has "card/rework-the-exporter" checked out
    And the card "Rework the exporter" is stored on the branch "card/rework-the-exporter"
    When I unlink the branch from the card
    Then the card record offers to create a branch
    And the card "Rework the exporter" is stored with no branch
    And the branch "card/rework-the-exporter" exists in the repository
    And no error notification is displayed

  # A worktree is the same idea one step further — an isolated checkout to hand to a coding agent —
  # and it is only offered once a branch is linked, since a worktree without the branch that owns it
  # is not a state a card can represent.
  #
  # A worktree is a *second* checkout of a branch, and git allows a branch in one worktree at a time,
  # so the branch has to be free: creating a card's branch checks it out here, which is exactly what
  # then stands in the way. The card says so rather than offering a button whose only outcome is
  # git's own `fatal:` — asserted below — and the scenario then does what the message asks.
  Scenario: A card's branch can be given a worktree of its own
    Given no worktree is left over for the branch "card/package-the-app"
    And the "feature-branches" fixture repository is opened
    When I open the board
    And I create a board named "Sprint 12" with the card prefix "GM"
    And I add a card titled "Package the app" to the "In progress" column
    And I open the card "Package the app"
    And I create a branch for the card
    Then the card record refuses a worktree while the branch is checked out
    When I close the card record
    And I open the commit graph
    # No reload in between: creating the branch from the card refreshes what depends on HEAD, so the
    # graph's own chrome names the branch the board just checked out. That was a real bug until
    # 2026-08-21 — the toolbar went on naming the previous branch — and this is the assertion that
    # would catch it coming back.
    Then the branch indicator reads "card/package-the-app"
    When I check out the "main" branch
    And I open the board
    And I open the card "Package the app"
    And I create a worktree for the card
    Then the card record shows a linked worktree
    And the repository has a worktree for the branch "card/package-the-app"
    And the card "Package the app" is stored with a worktree of its own
    And no error notification is displayed

  # The other end of the loop, and the reason the link is stored at all: nothing on the board is
  # touched here — the merge is run from the graph, through the palette, exactly as `merge-branches`
  # drives it — and the card is expected to have moved by the time the board is looked at again.
  Scenario: Merging a card's branch moves the card to the board's done column
    Given the "feature-branches" fixture repository is opened
    When I open the board
    And I create a board named "Sprint 12" with the card prefix "GM"
    And I add a card titled "Ship the exporter" to the "To do" column
    And I open the card "Ship the exporter"
    And I create a branch for the card
    And I close the card record
    # Scaffolding, kept on `Given`: the branch needs a commit of its own for the merge to be a real
    # one rather than an "already up to date" no-op, and no fixture can carry a branch this scenario
    # only names once it has created it.
    Given the branch "card/ship-the-exporter" has its own commit "feat: export the report"
    # Read before anything is merged, and load-bearing: the palette's merge entry is named after the
    # branch the app *believes* it is on, so a stale toolbar would have this scenario merge in the
    # wrong direction and still pass.
    When I open the commit graph
    Then the branch indicator reads "card/ship-the-exporter"
    When I check out the "main" branch
    And I open the command palette
    And I pick "Merge a branch into main…" from the palette
    And I pick "card/ship-the-exporter" from the palette
    Then the branch "main" contains the commit "feat: export the report"
    When I open the board
    Then the card "Ship the exporter" is stored in the "Done" column
    And the "Done" column holds 1 card
    And the "To do" column holds 0 cards
    And no error notification is displayed
