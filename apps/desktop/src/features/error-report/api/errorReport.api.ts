import type { MockIssue } from '../../../lib/github/types'
import {
  createIssue,
  createIssueComment,
  fetchIssuesByQuery,
} from '../../../api/github/github-issues.api'
import { PROJECT_REPO } from '../../../lib/projectRepo'
import { fingerprintMarker } from '../lib/fingerprint'
import type { ErrorReport } from '../lib/buildReport'

/**
 * The feature's only outward-facing layer: finding a previous report of the same failure, and
 * filing or amending one.
 *
 * It composes `api/github/github-issues.api.ts` rather than calling `fetch` — the same rule every
 * other api file follows, and the reason there is no new Rust command here.
 *
 * What travels from here is an **account id**, which is a GitHub login and therefore public: the
 * token itself lives in the OS keychain and is attached in Rust, where the webview cannot reach it
 * (see `githubApiShared.ts` on why `fetch` must never come back). The issue is still posted by the
 * user, under their own account, with the `repo` scope the device flow asks for — the app simply
 * never holds the credential that does it.
 *
 * Every call here targets `PROJECT_REPO` — the app's own tracker — and never the repository the
 * user has open. See `lib/projectRepo.ts` for why that is a constant rather than a lookup.
 */

/**
 * The already-filed report of this exact failure, or `null`.
 *
 * Searches the body for the fingerprint marker rather than matching on the title, which reporters
 * edit. Open *and* closed issues are searched on purpose: a fixed-but-not-released bug is the case
 * where a duplicate is most tempting and least useful, and landing the reporter on the closed issue
 * tells them a fix already exists.
 */
export async function apiFindReportedIssue(
  fingerprint: string,
  accountId: string
): Promise<MockIssue | null> {
  const marker = fingerprintMarker(fingerprint)
  const issues = await fetchIssuesByQuery(
    PROJECT_REPO.owner,
    PROJECT_REPO.repo,
    `"${marker}" in:body`,
    accountId
  )
  // GitHub's search is not exact-match on a quoted phrase inside an HTML comment, so confirm the
  // marker really is in the body before telling a user their bug is already known.
  return issues.find((issue) => issue.body?.includes(marker)) ?? null
}

/** Files the report. Returns the new issue's number and URL. */
export async function apiCreateErrorIssue(
  report: ErrorReport,
  accountId: string
): Promise<{ number: number; url: string }> {
  const created = await createIssue(
    PROJECT_REPO.owner,
    PROJECT_REPO.repo,
    { title: report.title, body: report.body },
    accountId
  )
  return { number: created.number, url: created.html_url }
}

/**
 * Adds this occurrence to an existing report instead of opening a second one.
 *
 * A "me too" with the reporter's own environment and trail attached is worth more than a 👍 — it is
 * how a maintainer learns the bug is not specific to one machine — and it is the only thing that
 * makes the duplicate check something a user accepts rather than works around.
 */
export async function apiCommentOnReportedIssue(
  issueNumber: number,
  report: ErrorReport,
  accountId: string
): Promise<void> {
  await createIssueComment(
    PROJECT_REPO.owner,
    PROJECT_REPO.repo,
    issueNumber,
    `**Also hit this.**\n\n${report.body}`,
    accountId
  )
}
