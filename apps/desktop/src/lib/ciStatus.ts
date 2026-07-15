import type { CiStatus, CiDetail } from '../app/pull-requests/types'
import type {
  GhCheckRun,
  GhCommitStatus,
  GhCheckRunsResponse,
  GhCommitStatusResponse,
} from '../api/github.api'

export interface ResolvedCi {
  /** Aggregated status across every check-run and commit-status for the ref. */
  overall: CiStatus
  /** One entry per individual check-run / commit-status, in that order. */
  details: CiDetail[]
}

/**
 * Collapse GitHub's two separate CI surfaces (Checks API `check-runs` and the
 * legacy commit-`status` API) into a single overall verdict plus a flat,
 * per-check detail list.
 *
 * Precedence for the overall status mirrors GitHub's own PR merge box:
 * any failure wins, else anything still running, else any success, else
 * (only if everything was skipped/neutral) `skipped`, else `null` (= no CI).
 *
 * This logic previously lived inline in `useGitHubData.ts`; it is extracted here
 * so the in-app PR view and the dashboard share one source of truth.
 */
export function resolveCiStatus(
  checkRunsRes: GhCheckRunsResponse | null,
  statusRes: GhCommitStatusResponse | null
): ResolvedCi {
  const checkRuns = checkRunsRes?.check_runs ?? []
  const totalCheckRuns = checkRunsRes?.total_count ?? 0
  const statuses = statusRes?.statuses ?? []
  const commitStatusState = statusRes?.state
  const totalStatuses = statusRes?.total_count ?? 0

  const hasCheckRuns = totalCheckRuns > 0
  const hasStatuses = totalStatuses > 0

  if (!hasCheckRuns && !hasStatuses) {
    return { overall: null, details: [] }
  }

  let overall: CiStatus = null

  const hasFailure =
    (hasCheckRuns &&
      checkRuns.some((run: GhCheckRun) =>
        ['failure', 'timed_out', 'cancelled'].includes(run.conclusion ?? '')
      )) ||
    (hasStatuses && ['failure', 'error'].includes(commitStatusState ?? ''))

  if (hasFailure) {
    overall = 'failure'
  } else {
    const hasRunning =
      (hasCheckRuns &&
        checkRuns.some((run: GhCheckRun) => ['in_progress', 'queued'].includes(run.status))) ||
      (hasStatuses && commitStatusState === 'pending')

    if (hasRunning) {
      overall = 'running'
    } else {
      const hasSuccess =
        (hasCheckRuns && checkRuns.some((run: GhCheckRun) => run.conclusion === 'success')) ||
        (hasStatuses && commitStatusState === 'success')

      if (hasSuccess) {
        overall = 'success'
      } else {
        const allSkipped =
          hasCheckRuns &&
          checkRuns.every((run: GhCheckRun) => ['skipped', 'neutral'].includes(run.conclusion ?? ''))
        overall = allSkipped ? 'skipped' : null
      }
    }
  }

  const checkRunsDetails: CiDetail[] = checkRuns.map((run: GhCheckRun) => {
    let s: CiDetail['status'] = 'unknown'
    if (run.status === 'in_progress' || run.status === 'queued') {
      s = 'running'
    } else if (run.status === 'completed') {
      if (run.conclusion === 'success') s = 'success'
      else if (['failure', 'timed_out', 'cancelled'].includes(run.conclusion ?? '')) s = 'failure'
      else if (['skipped', 'neutral'].includes(run.conclusion ?? '')) s = 'skipped'
    }
    return {
      name: run.name ?? 'Check run',
      status: s,
      url: run.html_url,
    }
  })

  const statusesDetails: CiDetail[] = statuses.map((status: GhCommitStatus) => {
    let s: CiDetail['status'] = 'unknown'
    if (status.state === 'success') s = 'success'
    else if (['failure', 'error'].includes(status.state)) s = 'failure'
    else if (status.state === 'pending') s = 'running'
    return {
      name: status.context ?? 'Status check',
      status: s,
      url: status.target_url,
    }
  })

  return { overall, details: [...checkRunsDetails, ...statusesDetails] }
}
