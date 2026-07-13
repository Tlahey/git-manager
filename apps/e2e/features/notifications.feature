@notifications
Feature: Notification tray
  As a user
  I want to see and manage PR notifications from the bell dropdown
  So that I don't miss review requests or merges

  Background:
    Given the notification tray is seeded with sample notifications

  Scenario: Opening the bell shows the seeded notifications and unread count
    When I open the notification tray
    Then the notification tray shows 2 notifications
    And the notification unread badge reads "1"

  Scenario: Marking all as read clears the unread badge
    When I open the notification tray
    And I mark all notifications as read
    Then the notification unread badge is not shown

  Scenario: Clearing all notifications empties the tray
    When I open the notification tray
    And I clear all notifications
    Then the notification tray is empty
