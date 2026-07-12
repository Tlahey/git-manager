@smoke
Feature: Application launch
  As a user
  I want the real native application to start correctly
  So that I can use it

  Scenario: The native window boots with the real frontend
    Given the git-manager application is running
    Then the window title is "Git Manager"

  Scenario: React is mounted inside the real Tauri webview
    Given the git-manager application is running
    Then the root element is displayed and not empty
