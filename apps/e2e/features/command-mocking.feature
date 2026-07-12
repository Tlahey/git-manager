@mocking
Feature: Tauri command mocking
  As a test
  I want to simulate the result of a real Tauri command
  So that I can cover backend states that are hard to reproduce (network failure, service down)

  # These scenarios exercise a command's contract from the test side, through the
  # browser.tauri.execute bridge. They do NOT go through a real UI click — see the limitation
  # documented in README.md (intercepting the app's own invoke calls doesn't work on this
  # Tauri version).

  Scenario: Simulate an unavailable Ollama backend
    Given the "check_ollama_status" command is mocked to return "unavailable"
    When the Ollama status is checked through the test bridge
    Then the reported status is "unavailable"
    And the "check_ollama_status" command was called once

  Scenario: Simulate a connection failure
    Given the "check_ollama_status" command is mocked to reject with "connection refused"
    When the Ollama status is checked through the test bridge
    Then the error "connection refused" is returned

  Scenario: Restore the real command after mocking
    Given the "check_ollama_status" command is mocked with a fake value
    When all mocks are restored
    And the Ollama status is checked through the test bridge
    Then the fake value does not appear in the result
