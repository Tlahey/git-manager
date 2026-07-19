import type { GitGraphNode } from '@git-manager/git-types'
import { isWipRow } from './components/GraphCell'

/** One selectable author in the AUTHOR column filter popover. */
export interface AuthorOption {
  /** Lowercased email — the stable identity used for selection and row matching. */
  email: string
  /** Display name (from the most-seen spelling for this email). */
  name: string
  /** How many loaded commits this author wrote — drives the default sort order. */
  count: number
}

/**
 * Unique authors of the loaded commits, ready for the filter autocomplete. Keyed by lowercased
 * email (names change or collide, emails are stable), skipping synthetic rows (WIP/CONFLICT/
 * `WIP:<path>`) and entries with no email. Sorted by commit count desc, then name (A→Z, locale).
 */
export function collectGraphAuthors(nodes: GitGraphNode[]): AuthorOption[] {
  const byEmail = new Map<string, { name: string; count: number }>()

  for (const node of nodes) {
    const { oid } = node.commit
    if (isWipRow(oid) || oid === 'CONFLICT') continue
    const email = (node.commit.author?.email ?? '').trim().toLowerCase()
    const name = (node.commit.author?.name ?? '').trim()
    if (!email) continue

    const existing = byEmail.get(email)
    if (existing) {
      existing.count += 1
      // Prefer a non-empty name if an earlier sighting had none.
      if (!existing.name && name) existing.name = name
    } else {
      // Keep the raw (possibly empty) name so a later commit can backfill it; the email fallback
      // is applied only at output below.
      byEmail.set(email, { name, count: 1 })
    }
  }

  return Array.from(byEmail, ([email, { name, count }]) => ({
    email,
    name: name || email,
    count,
  })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}
