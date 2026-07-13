@blame @history
Feature: File blame and history
  As a user reviewing a file
  I want its commit history and per-line blame
  So that I can see who changed what, and jump to older versions

  # feature-branches: app.txt is created in "chore: initial app" and modified in
  # "chore: extend app on main" (HEAD), so it has real multi-commit history + blame.
  # The diff is opened deterministically via the e2e store hook (no racy graph clicks).
  Background:
    Given the "feature-branches" fixture repository is opened
    And I open the diff for "app.txt" at "HEAD"

  Scenario: The history panel lists the file's versions
    When I open the file history
    Then the history panel lists at least 1 version

  Scenario: The File view shows blame avatars in the gutter
    When I switch to the File view
    Then the blame gutter shows at least one author avatar

  Scenario: Blame mode annotates lines with the commit name
    When I switch to the File view
    And I enable blame mode
    Then the blame column shows a commit annotation

  Scenario: Selecting a history version shows that version in the diff
    When I open the file history
    And I select the first history version
    Then the diff shows the version SHA bar
