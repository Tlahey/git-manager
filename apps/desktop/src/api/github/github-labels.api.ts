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
