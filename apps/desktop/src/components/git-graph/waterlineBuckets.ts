type TranslateFn = (key: string, opts?: Record<string, unknown>) => string

export interface WaterlineBucket {
  /** Rang croissant vers le passé (0 = aujourd'hui). Sert à garantir l'ordre. */
  rank: number
  key: string
  labelKey: string
}

/**
 * Paliers temporels « logiques » et grossiers, ordonnés du plus récent au plus
 * ancien. On évite les paliers fins (heures, X semaines) qui partent en
 * désordre quand les commits ne sont pas strictement triés par date.
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

/** Détermine le palier temporel logique d'un commit. */
export function getWaterlineBucket(timestamp: number, now = Date.now() / 1000): WaterlineBucket {
  const days = Math.max(0, now - timestamp) / 86400
  const rank = BUCKETS.findIndex((b) => days < b.maxDays)
  const bucket = BUCKETS[rank]
  return { rank, key: bucket.key, labelKey: `gitTree.waterline.${bucket.key}` }
}

/** Libellé traduit d'un palier temporel. */
export function bucketLabel(b: WaterlineBucket, t: TranslateFn): string {
  return t(b.labelKey)
}
