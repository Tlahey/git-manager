/**
 * Forge-agnostic parsing of a git remote URL. Unlike `githubRemote.ts` — which only recognises
 * github.com because it feeds the GitHub REST calls — this understands any host, because the
 * dashboard's owner column has to label GitLab/Bitbucket/self-hosted repos too.
 */
export interface ParsedRemote {
  /** Host without credentials or port, e.g. `github.com`. */
  host: string
  /** Everything between the host and the repo name — `owner`, or `group/subgroup` on GitLab. */
  owner: string
  /** Repo name, `.git` suffix stripped. */
  repo: string
}

/** Strips a trailing `.git` and any trailing slashes. */
function normalizePath(pathname: string): string {
  return pathname
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
    .replace(/\.git$/, '')
}

function split(host: string, fullPath: string): ParsedRemote | null {
  const segments = normalizePath(fullPath).split('/').filter(Boolean)
  if (segments.length < 2) return null
  const repo = segments[segments.length - 1]
  const owner = segments.slice(0, -1).join('/')
  if (!host || !owner || !repo) return null
  return { host, owner, repo }
}

/**
 * Parses `https://host/owner/repo.git`, `ssh://git@host:22/owner/repo.git` and the scp-like
 * `git@host:owner/repo.git` into `{ host, owner, repo }`. Returns `null` for anything else —
 * notably local paths (`/srv/git/foo.git`), which have no owner to show.
 */
export function parseRemoteUrl(url: string): ParsedRemote | null {
  const trimmed = url.trim()
  if (!trimmed) return null

  // scp-like syntax has no scheme and uses `:` as the host/path separator: git@github.com:me/app
  const scpLike = trimmed.match(/^(?:[^@/]+@)?([^/:]+):(?!\/)(.+)$/)
  if (scpLike) return split(scpLike[1], scpLike[2])

  const withScheme = trimmed.match(/^[a-z][a-z0-9+.-]*:\/\/(.+)$/i)
  if (!withScheme) return null

  const rest = withScheme[1]
  const slash = rest.indexOf('/')
  if (slash === -1) return null

  // Drop `user:password@` credentials and any `:port` suffix from the authority.
  const authority = rest.slice(0, slash)
  const host = authority.split('@').pop()?.split(':')[0] ?? ''
  return split(host, rest.slice(slash))
}

/** The first remote URL that parses, in the order given. `origin` should be passed first. */
export function firstParsedRemote(urls: string[]): ParsedRemote | null {
  for (const url of urls) {
    const parsed = parseRemoteUrl(url)
    if (parsed) return parsed
  }
  return null
}
