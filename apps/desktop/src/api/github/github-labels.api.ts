import { type GhUser, type GhLabel, ghFetch, ghRequest } from './githubApiShared'

// ─── reviewers / assignees / labels ───────────────────────────────────────────

/** Users assignable to issues/PRs in the repo (also the candidate reviewer pool). */
export async function fetchAssignableUsers(
  owner: string,
  repo: string,
  token: string
): Promise<GhUser[]> {
  return ghFetch<GhUser[]>(
    `https://api.github.com/repos/${owner}/${repo}/assignees?per_page=100`,
    token
  )
}

/**
 * Ensures a repo label exists with the given colour, creating it or recolouring an existing one.
 *
 * A board's tags *are* repo labels (see `api/board/remote-board.api.ts`), and adding a label to an
 * issue creates a missing one with a random colour — so without this a tag would render in the app
 * with the colour the user picked and on github.com with whatever GitHub rolled.
 *
 * `color` is sent without the leading `#`, which is the only form the API accepts.
 */
export async function createOrUpdateLabel(
  owner: string,
  repo: string,
  name: string,
  color: string,
  token: string
): Promise<void> {
  const body = { name, color: color.replace(/^#/, '').toLowerCase() }
  try {
    await ghRequest(`https://api.github.com/repos/${owner}/${repo}/labels`, {
      method: 'POST',
      body,
      token,
    })
  } catch {
    // Already exists (422) — patch it so a recoloured tag reaches GitHub. A failure here is not
    // worth aborting the caller's actual write over: the label still applies, just off-colour.
    await ghRequest(
      `https://api.github.com/repos/${owner}/${repo}/labels/${encodeURIComponent(name)}`,
      { method: 'PATCH', body, token }
    ).catch(() => undefined)
  }
}

/** All labels defined in the repo (the candidate pool for a PR's labels). */
export async function fetchRepoLabels(
  owner: string,
  repo: string,
  token: string
): Promise<GhLabel[]> {
  return ghFetch<GhLabel[]>(
    `https://api.github.com/repos/${owner}/${repo}/labels?per_page=100`,
    token
  )
}

/** Request reviews from the given logins. */
export async function addReviewers(
  owner: string,
  repo: string,
  prNumber: number,
  reviewers: string[],
  token: string
): Promise<unknown> {
  return ghRequest(
    `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/requested_reviewers`,
    {
      method: 'POST',
      body: { reviewers },
      token,
    }
  )
}

/** Cancel a pending review request for the given logins. */
export async function removeReviewers(
  owner: string,
  repo: string,
  prNumber: number,
  reviewers: string[],
  token: string
): Promise<unknown> {
  return ghRequest(
    `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/requested_reviewers`,
    {
      method: 'DELETE',
      body: { reviewers },
      token,
    }
  )
}

/** Add assignees (issue/PR share the assignee endpoints). */
export async function addAssignees(
  owner: string,
  repo: string,
  prNumber: number,
  assignees: string[],
  token: string
): Promise<unknown> {
  return ghRequest(`https://api.github.com/repos/${owner}/${repo}/issues/${prNumber}/assignees`, {
    method: 'POST',
    body: { assignees },
    token,
  })
}

/** Remove assignees. */
export async function removeAssignees(
  owner: string,
  repo: string,
  prNumber: number,
  assignees: string[],
  token: string
): Promise<unknown> {
  return ghRequest(`https://api.github.com/repos/${owner}/${repo}/issues/${prNumber}/assignees`, {
    method: 'DELETE',
    body: { assignees },
    token,
  })
}

/** Add labels by name. */
export async function addLabels(
  owner: string,
  repo: string,
  prNumber: number,
  labels: string[],
  token: string
): Promise<unknown> {
  return ghRequest(`https://api.github.com/repos/${owner}/${repo}/issues/${prNumber}/labels`, {
    method: 'POST',
    body: { labels },
    token,
  })
}

/** Remove a single label by name. */
export async function removeLabel(
  owner: string,
  repo: string,
  prNumber: number,
  label: string,
  token: string
): Promise<unknown> {
  return ghRequest(
    `https://api.github.com/repos/${owner}/${repo}/issues/${prNumber}/labels/${encodeURIComponent(label)}`,
    { method: 'DELETE', token }
  )
}
