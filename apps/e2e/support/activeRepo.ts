/**
 * The fixture repo the current scenario opened, tracked on the Node side.
 *
 * Steps that shell out to `git` need a repo path, and the obvious source — the `activeRepo` the app
 * has in `repoUI.store` (or its `git-manager-repos-ui` persisted copy) — turns out to be an
 * unreliable one: the app is a single long-lived process shared across every feature, and it can
 * reload out from under a scenario, coming back up on whatever repo an *earlier* run left behind.
 * A step then quietly runs `git -C <some-other-fixture> rev-parse <ref>` and fails with a confusing
 * "unknown revision" rather than anything resembling the real problem.
 *
 * A git assertion means "the repository this scenario opened", which is knowable without asking the
 * app at all. `repo.steps.ts` records it here as it builds the fixture; assertion steps read it
 * back. Cucumber runs one scenario at a time per worker, so a module-scoped value is scenario-safe.
 */
let activeRepoPath: string | null = null

export function setActiveRepoPath(path: string): void {
  activeRepoPath = path
}

export function getActiveRepoPath(): string {
  if (!activeRepoPath) {
    throw new Error(
      'no fixture repository has been opened in this scenario — a step needs `Given the "<name>" fixture repository is opened` first'
    )
  }
  return activeRepoPath
}
