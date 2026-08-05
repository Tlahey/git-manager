import type { BoardCardLink } from '@git-manager/git-types'

/**
 * The GitHub-backed board's issue-body format.
 *
 * A remote card *is* an issue, and the app's richer card model has to survive a round trip through
 * one. Everything GitHub has a native home for lives there instead (assignee, labels, comments) —
 * see `remote-board.api.ts`. What is left over lands here, in the issue body:
 *
 * - the **Definition of Done** as a `## Definition of Done` markdown task list, which is GitHub's
 *   own checklist format: readable and tickable on github.com, not an app-private encoding;
 * - a single hidden `<!-- git-manager:meta {…} -->` block for the two fields GitHub genuinely has
 *   nowhere to put — a due date (a milestone is a repo-wide grouping, the wrong granularity) and the
 *   text of a blocking reason — plus the linked branch, which used to have its own marker.
 *
 * The pre-existing standalone `<!-- git-manager:linkedBranch=… -->` marker is still *read*, so cards
 * written before this format keep their branch link; it is never written again.
 */

export interface CardBodyMeta {
  dueDate?: string
  blockedReason?: string
  linkedBranch?: string
  /**
   * The card's identifier **prefix**, and only the prefix.
   *
   * A remote card's *number* is the issue number by design (see `remoteCardMapping.cardFromIssue`),
   * which GitHub allocates and guarantees unique — so a `GM-7` moved onto a GitHub board becomes
   * `GM-123`. The prefix travels, the sequence does not. Storing the old number here instead would
   * make a card's identifier disagree with the issue everyone else refers to it by, which is worse
   * than a renumbering.
   */
  prefix?: string
  /** Declared relationships to other cards — GitHub's own issue references can't express the kind. */
  links?: BoardCardLink[]
}

export interface ParsedCardBody {
  /** The prose the user sees in the description field — markers and DOD section removed. */
  description: string
  /** Markdown task list, or `''` when the issue has no Definition-of-Done section. */
  dod: string
  meta: CardBodyMeta
}

const META_MARKER = /\n*<!-- git-manager:meta ([\s\S]*?) -->[ \t]*\n?/
/** The format's predecessor: read for backward compatibility, never written. */
const LEGACY_LINKED_BRANCH_MARKER = /\n*<!-- git-manager:linkedBranch=(.*?) -->[ \t]*\n?/
const DOD_HEADING = /^##[ \t]+Definition of Done[ \t]*$/m

export function parseCardBody(body: string): ParsedCardBody {
  let rest = body ?? ''

  let meta: CardBodyMeta = {}
  const metaMatch = rest.match(META_MARKER)
  if (metaMatch) {
    try {
      const parsed: unknown = JSON.parse(metaMatch[1])
      if (parsed && typeof parsed === 'object') meta = parsed as CardBodyMeta
    } catch {
      // A hand-mangled marker must not take the whole card down with it: the fields it carried are
      // lost, the description and checklist are not.
    }
    rest = rest.replace(META_MARKER, '\n')
  }

  const legacyMatch = rest.match(LEGACY_LINKED_BRANCH_MARKER)
  if (legacyMatch) {
    if (!meta.linkedBranch) meta.linkedBranch = legacyMatch[1]
    rest = rest.replace(LEGACY_LINKED_BRANCH_MARKER, '\n')
  }

  let dod = ''
  const dodMatch = rest.match(DOD_HEADING)
  if (dodMatch?.index !== undefined) {
    dod = rest.slice(dodMatch.index + dodMatch[0].length).trim()
    rest = rest.slice(0, dodMatch.index)
  }

  return { description: rest.trim(), dod, meta }
}

export function composeCardBody({ description, dod, meta }: ParsedCardBody): string {
  const sections = [description.trim()]
  if (dod.trim()) sections.push(`## Definition of Done\n\n${dod.trim()}`)

  // Only non-empty entries reach the marker, so a card with nothing extra to store carries no
  // marker at all rather than an empty one.
  const entries = Object.entries(meta).filter(
    ([, value]) => value !== undefined && value !== '' && !(Array.isArray(value) && value.length === 0)
  )
  if (entries.length > 0) {
    sections.push(`<!-- git-manager:meta ${JSON.stringify(Object.fromEntries(entries))} -->`)
  }

  return sections.filter(Boolean).join('\n\n')
}
