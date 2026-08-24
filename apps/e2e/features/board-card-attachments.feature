@board-card-attachments
Feature: Attaching an image to a board card

  As a developer documenting a bug on a board card
  I want to drop or paste a screenshot straight into the description
  So that I don't have to host the image anywhere myself

  Dropping or pasting an image into a card's description or comment box writes it into the
  repository's `.git-manager/attachments/` folder and inserts a markdown reference at the caret —
  no external image host involved.

  Background:
    Given the "feature-branches" fixture repository is opened
    When I open the board
    And I create a board named "Sprint 12" with the card prefix "GM"
    And I add a card titled "Rework the exporter" to the "To do" column
    When I open the card "Rework the exporter"

  Scenario: Dropping an image onto the description attaches it
    When I drop an image onto the card description
    Then the card "Rework the exporter" description references an attached image
    And the attached image for "Rework the exporter" exists in the repository
    And no error notification is displayed
