import type { BoardColumn, BoardTag, CardFieldChange } from '@git-manager/git-types'

type Translate = (key: string, options?: Record<string, unknown>) => string

export interface CardHistoryFormatContext {
  t: Translate
  columns: BoardColumn[]
  tags: BoardTag[]
}

/** One field's change, ready to render as a "before → after" row (Jira's own history layout) — or,
 * for a field whose values aren't carried over the wire (see `note` below), as a plain sentence. */
export interface CardFieldChangeDisplay {
  label: string
  from?: string
  to?: string
  /** Set instead of `from`/`to` for fields the backend reports as "changed" without a value —
   * long free text (description, DOD), where echoing the whole field would bloat every entry. */
  note?: string
}

function columnName(columns: BoardColumn[], id: string | undefined): string | undefined {
  if (!id) return undefined
  return columns.find((c) => c.id === id)?.name ?? id
}

function tagNames(tags: BoardTag[], joined: string | undefined): string | undefined {
  if (!joined) return undefined
  return joined
    .split(',')
    .filter(Boolean)
    .map((id) => tags.find((tag) => tag.id === id)?.name ?? id)
    .join(', ')
}

/** `undefined`/`''` render as the translated "None" placeholder, matching how an unset value reads
 * in Jira's own before/after history rows. */
function displayValue(raw: string | undefined, none: string): string {
  return raw && raw.length > 0 ? raw : none
}

/**
 * Turns one field-level change from `card_history`/`apiGetCardHistory` into a label + before/after
 * pair for `CardActivityHistoryRow`. Kept as pure logic (no React) so every field's phrasing is
 * unit-testable without mounting a component — see `cardHistoryChange.test.ts`.
 *
 * `priority`/`kind` route through the same `card.priority.*`/`card.kind.*` keys the rest of the
 * card dialog already uses, so a value's label never drifts between "what it says today" and
 * "what it said when it changed". `columnId`/`tagIds` resolve ids against the board's own
 * `columns`/`tags` since neither name is knowable from the backend, which only ever sees ids.
 */
export function describeCardFieldChange(
  change: CardFieldChange,
  { t, columns, tags }: CardHistoryFormatContext
): CardFieldChangeDisplay {
  const none = t('card.history.none')
  switch (change.field) {
    case 'title':
      return {
        label: t('card.history.field.title'),
        from: displayValue(change.oldValue, none),
        to: displayValue(change.newValue, none),
      }
    case 'columnId':
      return {
        label: t('card.history.field.column'),
        from: displayValue(columnName(columns, change.oldValue), none),
        to: displayValue(columnName(columns, change.newValue), none),
      }
    case 'priority':
      return {
        label: t('card.history.field.priority'),
        from: change.oldValue
          ? t(`card.priority.${change.oldValue}`, { defaultValue: change.oldValue })
          : none,
        to: change.newValue
          ? t(`card.priority.${change.newValue}`, { defaultValue: change.newValue })
          : none,
      }
    case 'kind':
      return {
        label: t('card.history.field.kind'),
        from: change.oldValue
          ? t(`card.kind.${change.oldValue}`, { defaultValue: change.oldValue })
          : none,
        to: change.newValue
          ? t(`card.kind.${change.newValue}`, { defaultValue: change.newValue })
          : none,
      }
    case 'assignee':
      return {
        label: t('card.history.field.assignee'),
        from: displayValue(change.oldValue, none),
        to: displayValue(change.newValue, none),
      }
    case 'dueDate':
      return {
        label: t('card.history.field.dueDate'),
        from: displayValue(change.oldValue, none),
        to: displayValue(change.newValue, none),
      }
    case 'blockedReason':
      return {
        label: t('card.history.field.blockedReason'),
        from: displayValue(change.oldValue, none),
        to: displayValue(change.newValue, none),
      }
    case 'linkedBranch':
      return {
        label: t('card.history.field.linkedBranch'),
        from: displayValue(change.oldValue, none),
        to: displayValue(change.newValue, none),
      }
    case 'archived':
      return {
        label: t('card.history.field.archived'),
        from: change.oldValue === 'true' ? t('card.history.value.yes') : t('card.history.value.no'),
        to: change.newValue === 'true' ? t('card.history.value.yes') : t('card.history.value.no'),
      }
    case 'tagIds':
      return {
        label: t('card.history.field.tagIds'),
        from: displayValue(tagNames(tags, change.oldValue), none),
        to: displayValue(tagNames(tags, change.newValue), none),
      }
    case 'description':
      return {
        label: t('card.history.field.description'),
        note: t('card.history.change.description'),
      }
    case 'dod':
      return { label: t('card.history.field.dod'), note: t('card.history.change.dod') }
    case 'comment':
      // Defensive only: a comment-adding commit is rendered as its own timeline item by
      // `CardActivitySection`, never reaching a history row through this path.
      return { label: t('card.comments.label'), note: change.newValue ?? '' }
    default:
      return {
        label: change.field,
        from: displayValue(change.oldValue, none),
        to: displayValue(change.newValue, none),
      }
  }
}
