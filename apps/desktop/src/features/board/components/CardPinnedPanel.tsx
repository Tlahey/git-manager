import { useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Input, NativeSelect } from '@git-manager/ui'
import { CalendarClock, X } from 'lucide-react'
import type { BoardCard, BoardCardPatch, BoardCardPriority } from '@git-manager/git-types'
import { useAssignableUsers } from '../../../hooks/usePrEditCandidates'
import { isOverdue } from '../lib/cardMeta'
import { CardAssigneeField } from './CardAssigneeField'
import { CardPriorityIcon } from './CardPriorityIcon'
import { CardSidebarPanel } from './CardSidebarPanel'
import { CardFieldRow } from './CardFieldRow'

interface CardPinnedPanelProps {
  card: BoardCard
  repoPath: string
  onPatch: (patch: BoardCardPatch) => Promise<unknown>
  readOnly?: boolean
}

type EditTarget = 'assignee' | 'priority' | 'dueDate' | null

const PRIORITIES: BoardCardPriority[] = ['high', 'normal', 'low']

/**
 * The three fields touched on nearly every card — who has it, when it is due, how urgent.
 *
 * Their own panel, above everything else, so that as the card model grows the new fields land in
 * `CardDetailsPanel` and these three stay exactly where the hand already goes.
 */
export function CardPinnedPanel({ card, repoPath, onPatch, readOnly }: CardPinnedPanelProps) {
  const { t } = useTranslation('board')
  const [editing, setEditing] = useState<EditTarget>(null)
  // Only fetched once the assignee block is actually opened — see `useAssignableUsers`'s `enabled`.
  const { users } = useAssignableUsers(repoPath, true)

  const overdue = isOverdue(card.dueDate)
  // The stored value is just a string; it renders as a GitHub user only when one goes by that name.
  const githubUser = users.find((u) => u.login === card.assignee)

  const openEditor = (target: Exclude<EditTarget, null>) =>
    readOnly ? undefined : () => setEditing((c) => (c === target ? null : target))

  return (
  <CardSidebarPanel
    title={t('card.panel.pinned')}
    sectionKey="card-pinned"
    testId="card-panel-pinned"
  >
    <CardFieldRow
      label={t('card.meta.assignee')}
      testId="card-meta-assignee"
      onEdit={openEditor('assignee')}
      editTitle={t('card.meta.editAssignee')}
      addLabel={t('card.meta.addAssignee')}
      filled={Boolean(card.assignee)}
      editor={
        editing === 'assignee' && (
          <CardAssigneeField
            assignee={card.assignee}
            repoPath={repoPath}
            onChange={(next) => onPatch({ assignee: next })}
            onClose={() => setEditing(null)}
          />
        )
      }
    >
      <span className="flex items-center gap-1.5 text-[11px] text-foreground">
        {githubUser ? (
          <img src={githubUser.avatar_url} alt="" className="h-4 w-4 shrink-0 rounded-full" />
        ) : (
          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-muted text-[8px] font-semibold uppercase text-muted-foreground">
            {card.assignee?.slice(0, 1)}
          </span>
        )}
        <span className="min-w-0 truncate">{card.assignee}</span>
      </span>
    </CardFieldRow>

    <CardFieldRow
      label={t('card.meta.dueDate')}
      testId="card-meta-due-date"
      onEdit={openEditor('dueDate')}
      editTitle={t('card.meta.editDueDate')}
      addLabel={t('card.meta.addDueDate')}
      filled={Boolean(card.dueDate)}
      editor={
        editing === 'dueDate' && (
          <Input
            type="date"
            autoFocus
            defaultValue={card.dueDate ?? ''}
            onChange={(e) => {
              void onPatch({ dueDate: e.target.value || null })
              setEditing(null)
            }}
            className="mt-1 h-7 text-xs"
            data-testid="card-due-date-input"
          />
        )
      }
    >
      <span
        data-testid={overdue ? 'card-due-overdue' : 'card-due'}
        className={`flex items-center gap-1 text-[11px] ${
          overdue ? 'font-medium text-destructive' : 'text-foreground'
        }`}
      >
        <CalendarClock className="h-3 w-3 shrink-0" />
        {card.dueDate}
        {overdue && <span>({t('card.meta.overdue')})</span>}
      </span>
    </CardFieldRow>

    {/* Clearing lives beside the date rather than inside the editor: a native date input doesn't
        reliably fire a change when it is emptied, so a clear button that only existed while
        editing was a clear button that mostly didn't work. Outside `CardFieldRow`'s own button,
        since a button cannot nest inside another. */}
    {card.dueDate && !readOnly && (
      <div className="px-3">
        <button
          type="button"
          title={t('card.meta.clearDueDate')}
          aria-label={t('card.meta.clearDueDate')}
          onClick={() => void onPatch({ dueDate: null })}
          data-testid="card-due-date-clear"
          className="ml-22 flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="h-3 w-3" />
          {t('card.meta.clearDueDate')}
        </button>
      </div>
    )}

    <CardFieldRow
      label={t('card.meta.priority')}
      testId="card-meta-priority"
      onEdit={openEditor('priority')}
      editTitle={t('card.meta.editPriority')}
      editor={
        editing === 'priority' && (
          <NativeSelect
            value={card.priority}
            autoFocus
            onChange={(e) => {
              void onPatch({ priority: e.target.value as BoardCardPriority })
              setEditing(null)
            }}
            className="mt-1 h-7 text-xs"
            data-testid="card-priority-select"
          >
            {PRIORITIES.map((value) => (
              <option key={value} value={value}>
                {t(`card.priority.${value}`)}
              </option>
            ))}
          </NativeSelect>
        )
      }
    >
      <CardPriorityIcon priority={card.priority} withLabel />
    </CardFieldRow>
  </CardSidebarPanel>
  )
}
