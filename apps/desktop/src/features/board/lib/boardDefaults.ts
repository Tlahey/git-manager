import type { BoardColumn } from '@git-manager/git-types'

/** Starter columns for a newly created board — editable afterward via `ColumnEditorDialog`. Ids are
 * plain lowercase-hyphen strings so they're safe unmodified inside a remote board's
 * `board:<id>:status:<columnId>` label. */
export function defaultColumns(): BoardColumn[] {
  return [
    { id: 'todo', name: 'To do', order: 0 },
    // Flagged so a brand-new board already produces a meaningful sprint report and carry-over. A
    // board where nothing counts as finished is valid (see `sprintStats.doneColumnIds`) but a poor
    // default.
    { id: 'in-progress', name: 'In progress', order: 1 },
    { id: 'done', name: 'Done', order: 2, isDone: true },
  ]
}

/**
 * Colours handed to new tags, in order, cycling once exhausted.
 *
 * Six hues far enough apart to stay distinguishable as bands in a card's 3px stripe — which is what
 * the palette is for. Plain hex rather than a theme token: the value is stored on the board and, on
 * a GitHub board, becomes the label's colour on github.com, where the app's theme doesn't exist.
 */
const TAG_COLORS = ['#e5484d', '#f76b15', '#f5d90a', '#30a46c', '#3b82f6', '#8b5cf6']

export function nextTagColor(existingCount: number): string {
  return TAG_COLORS[existingCount % TAG_COLORS.length]
}

/**
 * The name proposed for the sprint that follows `name`.
 *
 * Bumps a trailing number when there is one ("Sprint 12" → "Sprint 13"), which is how sprints are
 * usually named, and otherwise appends one rather than inventing a scheme — the field is editable,
 * so a wrong guess costs a keystroke and a right one costs none.
 */
export function nextSprintName(name: string): string {
  const match = name.match(/^(.*?)(\d+)(\D*)$/)
  if (!match) return `${name} 2`
  const [, prefix, digits, suffix] = match
  return `${prefix}${String(Number(digits) + 1).padStart(digits.length, '0')}${suffix}`
}

/** A stable, label-safe id for a tag. On a remote board the tag's *name* is the GitHub label, so this
 * id only has to be unique within the board. */
export function tagIdFromName(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || `tag-${Date.now().toString(36)}`
}

/** Default branch name suggested by a card's "create/checkout branch" action — a `card/` prefix
 * (distinguishing it from a `feature/`/`fix/` branch made by hand) plus a slug of the title. */
export function branchNameForCard(title: string): string {
  const slug = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `card/${slug || 'untitled'}`
}
