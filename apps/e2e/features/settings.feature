@settings
Feature: Settings
  As a user
  I want to open the settings and have them laid out correctly
  So that I can configure the app

  Scenario: The settings screen opens on the general section
    Given the git-manager application is running
    When I open the settings
    Then the settings screen is shown
    And the general settings tab is available

  @visual
  Scenario: The settings screen matches the reference snapshot
    Given the git-manager application is running
    When I open the settings
    Then the settings screen matches the visual snapshot "settings-general"

  @visual
  Scenario: The notifications section matches the reference snapshot
    Given the git-manager application is running
    When I open the settings
    And I open the "notifications" settings tab
    Then the settings screen matches the visual snapshot "settings-notifications"

  Scenario: Toggling the row height setting persists across a reload
    Given the git-manager application is running
    When I open the settings
    And I open the "ui_customization" settings tab
    And I select the "small" row height
    And I reload the application
    And I open the settings
    And I open the "ui_customization" settings tab
    Then the row height setting is "small"
