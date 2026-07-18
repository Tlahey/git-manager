import axe from 'axe-core'
import type { ViolationNodeRecord } from './apca-report-types'

// Turns axe violations into structured per-node records (fed into task.meta by the
// matrix, and from there into the apca-report artifacts) and deduped one-line
// summaries (the assertion diff), so a red run is fully analyzable: rule id, the
// contrast data (WCAG fg/bg/ratio, or whatever the APCA rule attaches), the element
// selector, and an html snippet. Defensive about the data shape because the APCA
// rule's `data` differs from WCAG color-contrast's.

/** One structured record per failing node of every violation. */
export function collectViolationRecords(violations: axe.Result[]): ViolationNodeRecord[] {
  return violations.flatMap((v) =>
    v.nodes.map((n) => {
      // The APCA rule reports through axe's `all` array, WCAG color-contrast through
      // `any` — take the first check that carries data or a message.
      const check = [...(n.any ?? []), ...(n.all ?? []), ...(n.none ?? [])].find(
        (c) => c.data != null || c.message,
      )
      const data =
        check?.data != null && typeof check.data === 'object'
          ? (check.data as Record<string, unknown>)
          : undefined
      const record: ViolationNodeRecord = {
        rule: v.id,
        target: n.target?.join(' ') ?? '',
        // Kept long enough (300) that the trailing className survives — the matrix's
        // exempt matcher looks for role classes like `text-muted-foreground` here.
        html: n.html ? n.html.replace(/\s+/g, ' ').trim().slice(0, 300) : '',
        message: check?.message ? check.message.replace(/\s+/g, ' ').trim() : v.help,
      }
      if (data) record.data = data
      return record
    }),
  )
}

/** Deduped one-line-per-node summaries from structured records (the assertion diff). */
export function summarizeRecords(records: ViolationNodeRecord[]): string[] {
  const lines = records.map((r) => {
    const bits: string[] = []
    if (r.message) bits.push(r.message)
    if (r.data) bits.push(JSON.stringify(r.data))
    const detail = bits.length ? ` [${bits.join(' ')}]` : ''
    const html = r.html ? ` « ${r.html} »` : ''
    return `${r.rule}${detail} — ${r.target}${html}`
  })
  return [...new Set(lines)]
}
