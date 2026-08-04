import { useId } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Input, Label, NativeSelect } from '@git-manager/ui'
import { CalendarClock } from 'lucide-react'
import type { BoardCardPriority } from '@git-manager/git-types'
import { isOverdue } from '../cardMeta'

interface CardMetaSectionProps {
  assignee: string
  onAssigneeChange: (assignee: string) => void
  priority: BoardCardPriority
  onPriorityChange: (priority: BoardCardPriority) => void
  dueDate: string
  onDueDateChange: (dueDate: string) => void
  /** Logins offered as autocomplete. Populated from the repo's GitHub collaborators when an account
   * is connected; empty otherwise, which leaves the field plain free text. */
  assigneeOptions?: string[]
  disabled?: boolean
}

const PRIORITIES: BoardCardPriority[] = ['high', 'normal', 'low']

/**
 * A card's who/how-urgent/by-when row.
 *
 * The assignee is a free-text input with a `datalist` rather than a picker: a local board has no
 * user directory to pick from — the repository knows about commit authors, not about who owns a
 * task — so the field has to accept any name. Where the repo *does* have a GitHub account connected,
 * its collaborators are offered as suggestions, which is what makes the value line up with the
 * issue's native assignee on a remote board.
 */
export function CardMetaSection({
  assignee,
  onAssigneeChange,
  priority,
  onPriorityChange,
  dueDate,
  onDueDateChange,
  assigneeOptions = [],
  disabled,
}: CardMetaSectionProps) {
  const { t } = useTranslation('board')
  const listId = useId()
  const overdue = isOverdue(dueDate || undefined)

  return (
    <div className="grid grid-cols-3 gap-3" data-testid="card-meta-section">
      <div className="space-y-1">
        <Label className="text-[11px] text-muted-foreground">{t('card.meta.assignee')}</Label>
        <Input
          value={assignee}
          onChange={(e) => onAssigneeChange(e.target.value)}
          placeholder={t('card.meta.assigneePlaceholder')}
          disabled={disabled}
          list={assigneeOptions.length > 0 ? listId : undefined}
          className="h-8 text-xs"
          data-testid="card-assignee-input"
        />
        {assigneeOptions.length > 0 && (
          <datalist id={listId} data-testid="card-assignee-options">
            {assigneeOptions.map((login) => (
              <option key={login} value={login} />
            ))}
          </datalist>
        )}
      </div>

      <div className="space-y-1">
        <Label className="text-[11px] text-muted-foreground">{t('card.meta.priority')}</Label>
        <NativeSelect
          value={priority}
          onChange={(e) => onPriorityChange(e.target.value as BoardCardPriority)}
          disabled={disabled}
          className="h-8 text-xs"
          data-testid="card-priority-select"
        >
          {PRIORITIES.map((value) => (
            <option key={value} value={value}>
              {t(`card.priority.${value}`)}
            </option>
          ))}
        </NativeSelect>
      </div>

      <div className="space-y-1">
        <Label className="flex items-center gap-1 text-[11px] text-muted-foreground">
          {t('card.meta.dueDate')}
          {overdue && (
            <span className="flex items-center gap-0.5 text-destructive" data-testid="card-due-overdue">
              <CalendarClock className="h-2.5 w-2.5" />
              {t('card.meta.overdue')}
            </span>
          )}
        </Label>
        <Input
          type="date"
          value={dueDate}
          onChange={(e) => onDueDateChange(e.target.value)}
          disabled={disabled}
          className={`h-8 text-xs ${overdue ? 'border-destructive' : ''}`}
          data-testid="card-due-date-input"
        />
      </div>
    </div>
  )
}
