import { useState, type ReactNode } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { CalendarClock } from 'lucide-react'
import type { BoardCard, BoardCardPatch, BoardCardPriority } from '@git-manager/git-types'
import { useAssignableUsers } from '../../../hooks/usePrEditCandidates'
import { isOverdue } from '../lib/cardMeta'
import { CardAssigneeField } from './CardAssigneeField'
import { CardChoiceList } from './CardChoiceList'
import { CardDueDatePicker } from './CardDueDatePicker'
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
 *
 * All three answer a click the same way: the values themselves, listed against the row, one more
 * click away from being set — see `CardFieldRow`.
 */
export function CardPinnedPanel({ card, repoPath, onPatch, readOnly }: CardPinnedPanelProps) {
  const { t } = useTranslation('board')
  const [editing, setEditing] = useState<EditTarget>(null)
  // Only fetched once the assignee block is actually opened — see `useAssignableUsers`'s `enabled`.
  const { users } = useAssignableUsers(repoPath, true)

  const overdue = isOverdue(card.dueDate)
  // The stored value is just a string; it renders as a GitHub user only when one goes by that name.
  const githubUser = users.find((u) => u.login === card.assignee)

  /** Wires one field's choices to the panel's single open slot — one field open at a time. On a
   * closed sprint it hands back no editor at all, which is what leaves the row as plain text. */
  const editorFor = (target: Exclude<EditTarget, null>, editor: ReactNode) =>
    readOnly
      ? {}
      : {
          editor,
          open: editing === target,
          onOpenChange: (next: boolean) => setEditing(next ? target : null),
        }

  return (
  <CardSidebarPanel
    title={t('card.panel.pinned')}
    sectionKey="card-pinned"
    testId="card-panel-pinned"
  >
    <CardFieldRow
      label={t('card.meta.assignee')}
      testId="card-meta-assignee"
      editTitle={t('card.meta.editAssignee')}
      addLabel={t('card.meta.addAssignee')}
      filled={Boolean(card.assignee)}
      {...editorFor(
        'assignee',
        <CardAssigneeField
          assignee={card.assignee}
          repoPath={repoPath}
          onChange={(next) => onPatch({ assignee: next })}
          onClose={() => setEditing(null)}
        />
      )}
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

    {/* Clearing lives in the picker with the dates, rather than beside the row: a native date input
        doesn't reliably fire a change when it is emptied, so "no deadline" has to be a row one can
        pick like any other — it just isn't a row the input can produce. */}
    <CardFieldRow
      label={t('card.meta.dueDate')}
      testId="card-meta-due-date"
      editTitle={t('card.meta.editDueDate')}
      addLabel={t('card.meta.addDueDate')}
      filled={Boolean(card.dueDate)}
      {...editorFor(
        'dueDate',
        <CardDueDatePicker
          dueDate={card.dueDate}
          onSelect={(next) => {
            void onPatch({ dueDate: next })
            setEditing(null)
          }}
        />
      )}
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

    <CardFieldRow
      label={t('card.meta.priority')}
      testId="card-meta-priority"
      editTitle={t('card.meta.editPriority')}
      {...editorFor(
        'priority',
        <CardChoiceList
          ariaLabel={t('card.meta.priority')}
          value={card.priority}
          options={PRIORITIES.map((value) => ({
            value,
            label: t(`card.priority.${value}`),
            icon: <CardPriorityIcon priority={value} />,
          }))}
          onSelect={(next) => {
            void onPatch({ priority: next })
            setEditing(null)
          }}
          testIdPrefix="card-priority-option"
        />
      )}
    >
      <CardPriorityIcon priority={card.priority} withLabel />
    </CardFieldRow>
  </CardSidebarPanel>
  )
}
