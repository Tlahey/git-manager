@board-branch
Feature: From a card to a branch, and back when it merges

  The one thing a board hosted anywhere else cannot do: start the work from the ticket. A card's
  record carries a branch section — create the branch this card is about, check it out, give it a
  worktree of its own — and the loop closes on its own at the other end, when that branch is merged
  and the card moves to its board's done column without anybody dragging it there.

  Everything below is asserted against git rather than the render: the branch is read back with
  `git branch --list`, the checkout with `rev-parse`, the worktree with `git worktree list`, and the
  card's own half of the link out of the board's ref.

  @doc @screenshots
  Scenario: Creating the branch a card is about, from the card itself
    A card's branch section starts as a single "Create branch" button; asking it to creates the
    branch, checks it out, and links it to the card. Unlinking only forgets the card's own memory
    of the branch — the branch itself, and everything committed on it, is untouched.
    Given the app language is English
    And the "feature-branches" fixture repository is opened
    When I open the board
    And I create a board named "Sprint 1" with the card prefix "GM"
    And I add a card titled "Rework the exporter" to the "To do" column
    And I open the card "Rework the exporter"
    And I create a branch for the card
    Then the card record shows the linked branch "card/rework-the-exporter"
    And the branch "card/rework-the-exporter" exists in the repository
    And the repository has "card/rework-the-exporter" checked out
    And the card "Rework the exporter" is stored on the branch "card/rework-the-exporter"
    And the interface has settled
    And a full-window screenshot is saved as "doc-board-card-branch"
    When I unlink the branch from the card
    Then the card record offers to create a branch
    And the card "Rework the exporter" is stored with no branch
    And the branch "card/rework-the-exporter" exists in the repository
    And no error notification is displayed

  @doc @screenshots
  Scenario: A card's branch can be given a worktree of its own
    A worktree — an isolated checkout to hand to a coding agent — is only offered once a branch is
    linked, and only once that branch is free: git allows a branch checked out in one worktree at a
    time, and creating the card's branch just checked it out here. Checking out something else
    first is what a worktree needs, and the card explains exactly that rather than offering a
    button whose only outcome would be git's own refusal.
    Given the app language is English
    And no worktree is left over for the branch "card/package-the-app"
    And the "feature-branches" fixture repository is opened
    When I open the board
    And I create a board named "Sprint 1" with the card prefix "GM"
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
    And the interface has settled
    And a full-window screenshot is saved as "doc-board-card-worktree"
    And no error notification is displayed

  @doc @screenshots
  Scenario: Merging a card's branch moves the card to the board's done column
    The other end of the loop, and the reason the link is stored at all: nothing on the board is
    touched here — the merge runs from the graph, through the command palette, same as any other
    branch merge — and the card has already moved by the time the board is looked at again.
    Given the app language is English
    And the "feature-branches" fixture repository is opened
    When I open the board
    And I create a board named "Sprint 1" with the card prefix "GM"
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
    And the interface has settled
    And a full-window screenshot is saved as "doc-board-card-branch-merged"
    And no error notification is displayed
