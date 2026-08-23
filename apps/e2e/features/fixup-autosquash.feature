@fixup
Feature: Fixup autosquash
  As a user with pending fixup! commits
  I want to group them through the autosquash preview
  So that I can clean up my history before pushing

  A `fixup!` commit is Git's own convention for "this belongs squashed into
  an earlier commit" without rewriting anything yet. Git Manager notices
  them and banners the graph the moment any exist, groups each with the
  target commit it belongs to, and rewrites history in one action once you
  approve the plan — no manual interactive rebase required.

  Background:
    Given the "fixup-chain" fixture repository is opened

  Scenario: The pending fixups banner is shown
    Then the pending fixups banner reports 2 fixups

  @doc @screenshots
  Scenario: The preview groups the two fixup!/target pairs
    The pending-fixups banner appears as soon as any `fixup!` commit exists,
    and opening the autosquash preview from it groups each one with the
    target commit it belongs to — so you can check the pairing is right
    before running it. Running it rewrites history in a single action,
    exactly as if you'd run `git rebase --autosquash` by hand.
    Given the app language is English
    And AI features are turned off
    And the "fixup-chain" fixture repository is opened
    When I open the autosquash preview
    And the interface has settled
    Then the preview groups the commit "feat: add greeting module"
    And the preview groups the commit "feat: add farewell module"
    But the preview does not show the commit "feat: add config module"
    And a full-window screenshot is saved as "doc-autosquash-preview"

  @visual
  Scenario: The preview matches the reference visual snapshot
    When I open the autosquash preview
    Then the preview matches the visual snapshot "autosquash-preview-groups"

  @doc @screenshots
  Scenario: Creating a fixup commit from a staged change via the palette
    "Create fixup commit" turns a staged change into the other half of the pair the preview above
    groups: the message is prefilled with `fixup! <target's own subject>` so Git's own autosquash
    convention is followed without typing it out, and confirming commits it immediately — the
    actual squash happens later, from the pending-fixups banner.
    Given the app language is English
    And AI features are turned off
    And the "fixup-chain" fixture repository is opened
    When I open the command palette
    Then the command palette shows commit actions for "HEAD"
    When I run the command palette action "commit-fixup"
    Then the fixup commit window is shown
    And the fixup commit message is prefilled with "fixup! feat: add config module"
    And the interface has settled
    And a full-window screenshot is saved as "doc-fixup-commit"
    When I confirm the fixup commit
    Then the repository HEAD commit subject is "fixup! feat: add config module"
