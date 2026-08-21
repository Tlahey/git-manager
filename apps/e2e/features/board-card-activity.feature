@board-activity
Feature: Kanban board — a card's activity feed

  The third thing a card record holds, after its fields and its checklist: the Activity panel, where
  the discussion and the card's own history sit in one timeline. "All" interleaves both by time,
  "Comments" is the discussion on its own — threaded, a reply nested under what it answers — and
  "History" is what the board's ref says changed, field by field, read straight back out of the
  commits the other scenarios only ever assert the *subject* of.

  Both halves are local-board only, and for the same reason: a card tracking a GitHub issue has no
  ref of its own to walk and no reply concept to render. Every scenario here therefore builds a local
  board through the UI, the way `board.feature` and `board-cards.feature` do, and ends on the
  repository's own storage rather than on the render.

  Scenario: The card's history says what changed, field by field
    Given the "feature-branches" fixture repository is opened
    When I open the board
    And I create a board named "Sprint 12" with the card prefix "GM"
    And I add a card titled "Polish the toolbar" to the "To do" column
    When I open the card "Polish the toolbar"
    And I set the card priority to "High"
    And I open the "History" activity tab
    Then the card history records "Priority" changing from "Normal" to "High"
    And the card history records the card being created
    # The tabs are a filter over one timeline, not three feeds: a comment is not a change, and the
    # History tab is the one place that says so.
    When I open the "Comments" activity tab
    Then the card history is not listed
    And no error notification is displayed

  # A reply is additive — it never touches the comment it answers, which is what lets a discussion
  # stay append-only (`CardActivityCommentRow`'s doc comment). The nesting is derived on read from
  # the one thing that *is* stored, `parentCommentId`, so both are asserted: the thread on screen and
  # the parent on disk.
  Scenario: A reply is threaded under the comment it answers
    Given the "feature-branches" fixture repository is opened
    When I open the board
    And I create a board named "Sprint 12" with the card prefix "GM"
    And I add a card titled "Rework the exporter" to the "To do" column
    When I open the card "Rework the exporter"
    And I write the comment "Waiting on the design review"
    And I open the "Comments" activity tab
    And I reply "The review landed this morning" to the comment "Waiting on the design review"
    Then the card record threads "The review landed this morning" under "Waiting on the design review"
    And the card "Rework the exporter" stores "The review landed this morning" as a reply to "Waiting on the design review"
    # The flat tab has unrelated history rows between the comments, so a thread would sit oddly
    # there: it annotates the reply instead of nesting it.
    When I open the "All" activity tab
    Then the reply "The review landed this morning" is marked as answering "Test User"
    # And the thread is rebuilt from storage, not held in the dialog's own state.
    When I close the card record
    And I open the card "Rework the exporter"
    And I open the "Comments" activity tab
    Then the card record threads "The review landed this morning" under "Waiting on the design review"
    And the board history records "git-manager: comment on board card"
    And no error notification is displayed
