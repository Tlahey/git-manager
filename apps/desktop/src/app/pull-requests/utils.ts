import type { CiStatus, CiDetail, MockIssue } from './types'

/**
 * Whether an issue is "mine" for the signed-in user — authored by me or assigned to me. Used to
 * default the Issues tab to my own issues while still fetching every issue in the added repos.
 * Always `false` without a known user (e.g. signed out / demo mode), so no filtering is implied.
 */
export function isMyIssue(issue: MockIssue, username: string | null): boolean {
  if (!username) return false
  return issue.author === username || issue.assignees.some((a) => a.login === username)
}

/** Branch name suggested when creating a local branch from an issue, e.g. `312-tab-close-button`.
 * The title is slugified and capped so the ref stays short; falls back to just the number. */
export function issueBranchName(issue: Pick<MockIssue, 'number' | 'title'>): string {
  const slug = issue.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '')
  return slug ? `${issue.number}-${slug}` : `${issue.number}`
}

/** Whether a local branch name references the given issue number as a standalone token — so branch
 * `312-fix` matches issue 312 but not issue 31 or 3123. Used to show a linked-branch tag on the row
 * instead of the "Create a branch" button. */
export function branchMatchesIssue(branchName: string, issueNumber: number): boolean {
  return new RegExp(`(^|[^0-9])${issueNumber}([^0-9]|$)`).test(branchName)
}

export async function openUrl(url: string) {
  try {
    const { open } = await import('@tauri-apps/plugin-shell')
    await open(url)
  } catch {
    window.open(url, '_blank')
  }
}

/**
 * The best CI "action" URL to open for a PR's status — the link that lets you jump
 * straight to the run and see why it's OK / KO / still going. Prefers a failing
 * check (what you want to inspect when it's red), then a running one, then any check
 * carrying a link, and finally falls back to the PR's own Checks tab so there is
 * always a way through even when GitHub doesn't attach a per-check URL. Returns
 * undefined only when there is no CI at all (and no PR URL to fall back to).
 */
export function ciActionUrl(
  status: CiStatus,
  details: CiDetail[] | undefined,
  prUrl?: string
): string | undefined {
  const withUrl = (details ?? []).filter((d): d is CiDetail & { url: string } => !!d.url)
  const chosen =
    withUrl.find((d) => d.status === 'failure') ??
    withUrl.find((d) => d.status === 'running') ??
    withUrl[0]
  if (chosen) return chosen.url
  if (prUrl && status !== null) return `${prUrl}/checks`
  return undefined
}

export function timeAgo(date: Date): string {
  const s = Math.floor((Date.now() - date.getTime()) / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d ago`
  return `${Math.floor(d / 30)}mo ago`
}

// ─── Snooze ─────────────────────────────────────────────────────────────────

export type SnoozeDuration = 'hour' | 'tomorrow' | 'nextWeek' | 'indefinitely'

/**
 * Whether a PR is currently snoozed given the store map and a reference time. An entry with a wake
 * timestamp in the past counts as woken (auto-expiry) and returns `false`; `null` means indefinite.
 */
export function isSnoozed(
  id: string,
  snoozed: Record<string, number | null>,
  now: number = Date.now()
): boolean {
  if (!(id in snoozed)) return false
  const until = snoozed[id]
  return until === null || until > now
}

/** Wake timestamp (ms) for a snooze preset, or `null` for an indefinite snooze. `tomorrow` and
 * `nextWeek` resolve to 09:00 local on the target day so PRs surface at the start of the day. */
export function snoozeUntil(duration: SnoozeDuration, now: number = Date.now()): number | null {
  if (duration === 'indefinitely') return null
  if (duration === 'hour') return now + 60 * 60 * 1000
  const d = new Date(now)
  d.setDate(d.getDate() + (duration === 'nextWeek' ? 7 : 1))
  d.setHours(9, 0, 0, 0)
  return d.getTime()
}

/** Short label for a snooze wake time (e.g. `2h`, `3d`), or `null` when the snooze is indefinite. */
export function timeUntil(until: number | null, now: number = Date.now()): string | null {
  if (until === null) return null
  const s = Math.max(0, Math.floor((until - now) / 1000))
  const m = Math.floor(s / 60)
  if (m < 60) return `${Math.max(1, m)}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}
