@fixup
Feature: Fixup autosquash
  As a user with pending fixup! commits
  I want to group them through the autosquash preview
  So that I can clean up my history before pushing

  Background:
    Given the "fixup-chain" fixture repository is opened

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

  Scenario: Creating a fixup commit from a staged change via the palette
    When I open the command palette
    Then the command palette shows commit actions for "HEAD"
    When I run the command palette action "commit-fixup"
    Then the fixup commit window is shown
    And the fixup commit message is prefilled with "fixup! feat: add config module"
    When I confirm the fixup commit
    Then the repository HEAD commit subject is "fixup! feat: add config module"
