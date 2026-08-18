import type { BoardColumn, BoardTag, CardFieldChange } from '@git-manager/git-types'

type Translate = (key: string, options?: Record<string, unknown>) => string

export interface CardHistoryFormatContext {
  t: Translate
  columns: BoardColumn[]
  tags: BoardTag[]
}

/** One field's change, ready for `CardActivityHistoryRow` to render.
 *
 * - `'value'` — a short field: `from`/`to` are the already-translated display strings (empty
 *   values shown as the "None" placeholder), rendered as an inline "before → after" pair.
 * - `'longText'` — description/DOD: `from`/`to` are the **raw, untranslated** text, empty string
 *   included, so a copy button can put the exact previous value back on the clipboard. The row
 *   component decides the "None" placeholder and truncation; this layer must not paper over an
 *   empty string, or "copy the old value" would copy the word "None".
 * - `'note'` — no before/after to show at all (defensive fallback for a `"comment"` change, which
 *   `CardActivitySection` always renders as its own timeline item instead of reaching this path).
 */
export type CardFieldChangeDisplay =
  | { label: string; kind: 'value'; from: string; to: string }
  | { label: string; kind: 'longText'; from: string; to: string }
  | { label: string; kind: 'note'; note: string }

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
 * in Jira's own before/after history rows. Only for `'value'` fields — see the type doc above. */
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
        kind: 'value',
        from: displayValue(change.oldValue, none),
        to: displayValue(change.newValue, none),
      }
    case 'columnId':
      return {
        label: t('card.history.field.column'),
        kind: 'value',
        from: displayValue(columnName(columns, change.oldValue), none),
        to: displayValue(columnName(columns, change.newValue), none),
      }
    case 'priority':
      return {
        label: t('card.history.field.priority'),
        kind: 'value',
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
        kind: 'value',
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
        kind: 'value',
        from: displayValue(change.oldValue, none),
        to: displayValue(change.newValue, none),
      }
    case 'dueDate':
      return {
        label: t('card.history.field.dueDate'),
        kind: 'value',
        from: displayValue(change.oldValue, none),
        to: displayValue(change.newValue, none),
      }
    case 'blockedReason':
      return {
        label: t('card.history.field.blockedReason'),
        kind: 'value',
        from: displayValue(change.oldValue, none),
        to: displayValue(change.newValue, none),
      }
    case 'linkedBranch':
      return {
        label: t('card.history.field.linkedBranch'),
        kind: 'value',
        from: displayValue(change.oldValue, none),
        to: displayValue(change.newValue, none),
      }
    case 'archived':
      return {
        label: t('card.history.field.archived'),
        kind: 'value',
        from: change.oldValue === 'true' ? t('card.history.value.yes') : t('card.history.value.no'),
        to: change.newValue === 'true' ? t('card.history.value.yes') : t('card.history.value.no'),
      }
    case 'tagIds':
      return {
        label: t('card.history.field.tagIds'),
        kind: 'value',
        from: displayValue(tagNames(tags, change.oldValue), none),
        to: displayValue(tagNames(tags, change.newValue), none),
      }
    case 'description':
      return {
        label: t('card.history.field.description'),
        kind: 'longText',
        from: change.oldValue ?? '',
        to: change.newValue ?? '',
      }
    case 'dod':
      return {
        label: t('card.history.field.dod'),
        kind: 'longText',
        from: change.oldValue ?? '',
        to: change.newValue ?? '',
      }
    case 'comment':
      // Defensive only: a comment-adding commit is rendered as its own timeline item by
      // `CardActivitySection`, never reaching a history row through this path.
      return { label: t('card.comments.label'), kind: 'note', note: change.newValue ?? '' }
    default:
      return {
        label: change.field,
        kind: 'value',
        from: displayValue(change.oldValue, none),
        to: displayValue(change.newValue, none),
      }
  }
}
