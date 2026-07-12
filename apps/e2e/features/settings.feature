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
