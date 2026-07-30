@notifications
Feature: Notification tray
  As a user
  I want to see and manage PR notifications from the bell dropdown
  So that I don't miss review requests or merges

  Background:
    Given the notification tray is seeded with sample notifications

  @doc @screenshots
  Scenario: Opening the bell shows the seeded notifications and unread count
    The bell in the toolbar carries an unread count, and opening it lists what
    came in — a review request, a merge, whatever the connected GitHub account
    has seen. Marking everything read clears the count without removing the
    notifications; clearing empties the tray outright.
    Given the app language is English
    When I open the notification tray
    And the interface has settled
    Then the notification tray shows 2 notifications
    And the notification unread badge reads "1"
    And a full-window screenshot is saved as "doc-notifications"

  Scenario: Marking all as read clears the unread badge
    When I open the notification tray
    And I mark all notifications as read
    Then the notification unread badge is not shown

  Scenario: Clearing all notifications empties the tray
    When I open the notification tray
    And I clear all notifications
    Then the notification tray is empty
