@ai
Feature: Drafting a PR description

  As a developer about to open a pull request
  I want the body filled in from what my branch actually changed
  So that I don't have to write a summary of my own commits by hand

  Unlike the explanations above, this is the one generation feature whose output is meant to be
  published — it fills a real template from the branch's per-file summaries and its commit list, the
  same range the branch explanation reads. The field stays a normal, editable textarea afterwards:
  nothing is submitted until you actually publish the PR.

  @doc @screenshots
  Scenario: Generating a PR description from a branch's commits
    "Generate title and description (LLM)" reads everything the selected branch changes compared to
    its base — the whole range, not one commit — and writes a description from it, template
    included when the repo has one. Only the form is exercised here, not an actual PR submission:
    that reaches GitHub directly and is out of scope the same way the Launchpad's PR mutations are.
    Given the app language is English
    And the AI provider is pointed at a fake server
    And the "feature-branches" fixture repository is opened
    When I check out the "feature/login" branch
    And I open the create-PR form
    And I fill the create-PR form with head "feature/login" and base "main"
    And I click the generate-description button
    Then the PR description field contains "feat: add fake thing"
    And the interface has settled
    And a full-window screenshot is saved as "doc-ai-pr-description"
