type GithubEntityKind = 'pull' | 'issues'

interface OwnerRepo {
  owner: string
  repo: string
}

/**
 * Resolves a PR/issue's GitHub URL: the first already-known URL (a fetched `html_url`, or a
 * Launchpad-supplied one), else a best-effort guess built from `ownerRepo` — the already-resolved
 * `{ owner, repo }` from {@link useRepoGitHub}, not a heuristic on `repoPath` (which can be either a
 * `owner/repo` string or a local filesystem path depending on the caller, and both contain `/`, so
 * `repoPath.includes('/')` can't tell them apart — a prior version of this guessed a broken
 * `github.com//local/path/...` URL during the brief window before `ownerRepo` resolves).
 */
export function resolveGithubUrl(
  kind: GithubEntityKind,
  ownerRepo: OwnerRepo | null,
  number: number,
  ...knownUrls: Array<string | null | undefined>
): string | undefined {
  return (
    knownUrls.find((url): url is string => Boolean(url)) ??
    (ownerRepo
      ? `https://github.com/${ownerRepo.owner}/${ownerRepo.repo}/${kind}/${number}`
      : undefined)
  )
}
