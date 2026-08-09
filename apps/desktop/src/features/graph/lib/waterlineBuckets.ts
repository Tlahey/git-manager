type TranslateFn = (key: string, opts?: Record<string, unknown>) => string

export interface WaterlineBucket {
  /** Rank increasing towards the past (0 = today). Used to keep the ordering. */
  rank: number
  key: string
  labelKey: string
}

/**
 * Coarse, "logical" time buckets, ordered from most recent to oldest. Fine-grained buckets
 * (hours, X weeks) are deliberately avoided: they fall out of order whenever the commits aren't
 * strictly sorted by date.
 */
const BUCKETS: { maxDays: number; key: string }[] = [
  { maxDays: 1, key: 'today' },
  { maxDays: 2, key: 'yesterday' },
  { maxDays: 7, key: 'thisWeek' },
  { maxDays: 14, key: 'lastWeek' },
  { maxDays: 30, key: 'thisMonth' },
  { maxDays: 60, key: 'lastMonth' },
  { maxDays: 365, key: 'thisYear' },
  { maxDays: Infinity, key: 'older' },
]

/** Resolves a commit's logical time bucket. */
export function getWaterlineBucket(timestamp: number, now = Date.now() / 1000): WaterlineBucket {
  const days = Math.max(0, now - timestamp) / 86400
  const rank = BUCKETS.findIndex((b) => days < b.maxDays)
  const bucket = BUCKETS[rank]
  return { rank, key: bucket.key, labelKey: `gitTree.waterline.${bucket.key}` }
}

/** Translated label of a time bucket. */
export function bucketLabel(b: WaterlineBucket, t: TranslateFn): string {
  return t(b.labelKey)
}
