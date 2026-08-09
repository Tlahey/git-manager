import type { PrCheck, PrCheckCategory } from '../../../api/github.api'

export type ChecksSummaryKind = 'failure' | 'in_progress' | 'success' | 'none'

export interface ChecksSummary {
  kind: ChecksSummaryKind
  total: number
  counts: Record<PrCheckCategory, number>
}

/** GitHub's merge-box verdict over a PR's checks: any failure → not successful, else any pending →
 * not completed, else all good. Skipped/neutral don't block. */
export function summarizeChecks(checks: PrCheck[]): ChecksSummary {
  const counts: Record<PrCheckCategory, number> = {
    failure: 0,
    in_progress: 0,
    skipped: 0,
    success: 0,
    neutral: 0,
  }
  for (const c of checks) counts[c.category]++

  let kind: ChecksSummaryKind
  if (checks.length === 0) kind = 'none'
  else if (counts.failure > 0) kind = 'failure'
  else if (counts.in_progress > 0) kind = 'in_progress'
  else kind = 'success'

  return { kind, total: checks.length, counts }
}

/** Display order for the collapsible check groups (most-attention-worthy first). */
const GROUP_ORDER: PrCheckCategory[] = ['failure', 'in_progress', 'skipped', 'success', 'neutral']

export interface ChecksGroup {
  category: PrCheckCategory
  checks: PrCheck[]
}

/** Bucket checks into ordered, non-empty groups by category (failing → in progress → skipped → …). */
export function groupChecks(checks: PrCheck[]): ChecksGroup[] {
  return GROUP_ORDER.map((category) => ({
    category,
    checks: checks.filter((c) => c.category === category),
  })).filter((g) => g.checks.length > 0)
}
