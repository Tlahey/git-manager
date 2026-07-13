@mocking
Feature: Tauri command mocking
  As a test
  I want to simulate the result of a real Tauri command
  So that I can cover backend states that are hard to reproduce (network failure, service down)

  # These scenarios exercise a command's contract from the test side, through the
  # browser.tauri.execute bridge. They do NOT go through a real UI click — see the limitation
  # documented in README.md (intercepting the app's own invoke calls doesn't work on this
  # Tauri version).

  Scenario: Simulate an unavailable AI provider backend
    Given the "check_ai_status" command is mocked to return "unavailable"
    When the AI provider status is checked through the test bridge
    Then the reported status is "unavailable"
    And the "check_ai_status" command was called once

  Scenario: Simulate a connection failure
    Given the "check_ai_status" command is mocked to reject with "connection refused"
    When the AI provider status is checked through the test bridge
    Then the error "connection refused" is returned

  Scenario: Restore the real command after mocking
    Given the "check_ai_status" command is mocked with a fake value
    When all mocks are restored
    And the AI provider status is checked through the test bridge
    Then the fake value does not appear in the result

  # github_poll_token is called in a loop by useGithubDeviceFlow's polling interval — a real UI
  # click can't be driven to completion without a human authorizing the device code on github.com,
  # so its "pending"/"success"/"expired" outcomes are exercised through the test bridge instead of a
  # real click (settings.feature covers the real, UI-driven half of the flow: requesting the device
  # code itself, which needs no auth and always succeeds against GitHub's public endpoint).

  Scenario: Simulate a pending GitHub device-flow authorization
    Given the "github_poll_token" command is mocked to return authorization pending
    When the GitHub token poll is checked through the test bridge
    Then the poll result shows authorization pending

  Scenario: Simulate a completed GitHub device-flow authorization
    Given the "github_poll_token" command is mocked to return an access token
    When the GitHub token poll is checked through the test bridge
    Then the poll result contains an access token

  Scenario: Simulate an expired GitHub device code
    Given the "github_poll_token" command is mocked to return an expired device code
    When the GitHub token poll is checked through the test bridge
    Then the poll result shows an expired device code
