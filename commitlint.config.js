// Enforces Conventional Commits (see CLAUDE.md's "Conventions" section).
// Scopes are intentionally left free-form (e.g. `feat(e2e):`, `fix(undo):`,
// `docs(settings):`) — only the commit `type` is restricted to what this
// repo's history actually uses.
module.exports = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [
      2,
      "always",
      [
        "feat",
        "fix",
        "docs",
        "chore",
        "test",
        "refactor",
        "perf",
        "style",
        "build",
        "ci",
        "revert",
      ],
    ],
  },
};
