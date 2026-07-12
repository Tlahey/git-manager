@fixup
Feature: Fixup autosquash
  As a user with pending fixup! commits
  I want to group them through the autosquash preview
  So that I can clean up my history before pushing

  Background:
    Given the "fixup-chain" fixture repository is built and opened

  Scenario: The pending fixups banner is shown
    Then the pending fixups banner reports 2 fixups

  Scenario: The preview groups the two fixup!/target pairs
    When I open the autosquash preview
    Then the preview groups the commit "feat: add greeting module"
    And the preview groups the commit "feat: add farewell module"
    But the preview does not show the commit "feat: add config module"

  @visual
  Scenario: The preview matches the reference visual snapshot
    When I open the autosquash preview
    Then the preview matches the visual snapshot "autosquash-preview-groups"
