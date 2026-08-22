@compare
Feature: Comparing a commit against the working directory

  As a user wondering how far the working tree has drifted from an older point in history
  I want to diff any commit's tree straight against what's on disk right now
  So that I don't have to check out that commit or read every commit in between to find out

  "Compare to working directory", on a commit's own context menu, diffs that commit's tree
  against the working directory as it stands — not just the index, and not limited to what
  changed in that one commit. It answers a different question than the graph itself: not "what
  did this commit do" but "what's different between then and right now, uncommitted changes
  included".

  Background:
    Given the app language is English
    And AI features are turned off
    And the "rollback-history" fixture repository is opened

  @doc @screenshots
  Scenario: Comparing an older commit against the current working directory
    Picking an older commit shows every file that differs between its tree and the working
    directory today — the combined effect of every commit since, plus anything still uncommitted,
    in one diff rather than one commit at a time.
    When I select the "HEAD~2" commit in the graph
    And I open the compare-to-workdir dialog
    Then the compare-to-workdir dialog is shown
    And the compare-to-workdir diff includes the file "counter.txt"
    And the interface has settled
    And a full-window screenshot is saved as "doc-compare-to-workdir"
