import type { BoardColumn, BoardTag, CardFieldChange } from '@git-manager/git-types'

type Translate = (key: string, options?: Record<string, unknown>) => string

export interface CardHistoryFormatContext {
  t: Translate
  columns: BoardColumn[]
  tags: BoardTag[]
}

function columnName(columns: BoardColumn[], id: string | undefined): string {
  if (!id) return id ?? ''
  return columns.find((c) => c.id === id)?.name ?? id
}

function tagNames(tags: BoardTag[], joined: string | undefined): string {
  if (!joined) return ''
  return joined
    .split(',')
    .filter(Boolean)
    .map((id) => tags.find((tag) => tag.id === id)?.name ?? id)
    .join(', ')
}

/**
 * Turns one field-level change from `card_history`/`apiGetCardHistory` into a single readable
 * sentence for `CardHistorySection`. Kept as pure logic (no React) so every field's phrasing is
 * unit-testable without mounting a component — see `cardHistoryChange.test.ts`.
 *
 * `priority`/`kind` route through the same `card.priority.*`/`card.kind.*` keys the rest of the
 * card dialog already uses, so a value's label never drifts between "what it says today" and
 * "what it said when it changed". `columnId`/`tagIds` resolve ids against the board's own
 * `columns`/`tags` since neither name is knowable from the backend, which only ever sees ids.
 */
export function formatCardHistoryChange(
  change: CardFieldChange,
  { t, columns, tags }: CardHistoryFormatContext
): string {
  switch (change.field) {
    case 'title':
      return t('card.history.change.title', { value: change.newValue ?? '' })
    case 'columnId':
      return t('card.history.change.column', { value: columnName(columns, change.newValue) })
    case 'priority':
      return t('card.history.change.priority', {
        value: t(`card.priority.${change.newValue}`, { defaultValue: change.newValue }),
      })
    case 'kind':
      return t('card.history.change.kind', {
        value: t(`card.kind.${change.newValue}`, { defaultValue: change.newValue }),
      })
    case 'assignee':
      return change.newValue
        ? t('card.history.change.assignee', { value: change.newValue })
        : t('card.history.change.unassigned')
    case 'dueDate':
      return change.newValue
        ? t('card.history.change.dueDate', { value: change.newValue })
        : t('card.history.change.dueDateCleared')
    case 'blockedReason':
      return change.newValue
        ? t('card.history.change.blocked', { value: change.newValue })
        : t('card.history.change.unblocked')
    case 'linkedBranch':
      return change.newValue
        ? t('card.history.change.linkedBranch', { value: change.newValue })
        : t('card.history.change.unlinkedBranch')
    case 'archived':
      return change.newValue === 'true'
        ? t('card.history.change.archived')
        : t('card.history.change.unarchived')
    case 'description':
      return t('card.history.change.description')
    case 'dod':
      return t('card.history.change.dod')
    case 'tagIds':
      return t('card.history.change.tagIds', { value: tagNames(tags, change.newValue) })
    case 'comment':
      return t('card.history.change.comment', { value: change.newValue ?? '' })
    default:
      return t('card.history.change.generic', { field: change.field })
  }
}
