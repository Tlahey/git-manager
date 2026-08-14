import { useTranslation } from '@git-manager/i18n'
import { AlertTriangle, ChevronRight } from 'lucide-react'
import { Tag } from '@git-manager/ui'
import type { PooledAction } from '../../../lib/actionPool'
import { formatActivityTimestamp } from '../../../lib/formatActivityLog'
import { ActionFamilyIcon } from './actionFamilyIcon'

interface ActionRowProps {
  action: PooledAction
  selected: boolean
  /** Whether an explanation is already remembered for this action — an affordance, not a status: it
   * tells the reader which rows they have already had explained. */
  explained: boolean
  onSelect: () => void
}

/**
 * One action in the journal: when it happened, what it was, and the git command(s) it ran.
 *
 * The commands are on the row itself, not hidden behind the click. That is the requirement the whole
 * window turns on — with no model configured this list *is* the feature, so it has to be readable
 * without ever opening the detail panel. The click adds the explanation; it does not reveal the facts.
 *
 * A button rather than a div with a handler: the list is keyboard-navigable, and this is the one
 * element in the row the user activates.
 */
export function ActionRow({ action, selected, explained, onSelect }: ActionRowProps) {
  const { t } = useTranslation('common')

  return (
    <button
      type="button"
      onClick={onSelect}
      data-testid={`action-row-${action.id}`}
      aria-current={selected ? 'true' : undefined}
      className={`flex w-full cursor-pointer items-start gap-2.5 border-b border-border/40 px-3 py-2 text-left transition-colors ${
        selected ? 'bg-accent' : 'hover:bg-accent/50'
      }`}
    >
      <ActionFamilyIcon family={action.family} className="mt-0.5 h-3.5 w-3.5" />

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-xs font-semibold text-foreground">
            {t(action.titleKey)}
          </span>
          {action.commands.length > 1 && (
            <span className="shrink-0 rounded bg-muted/70 px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">
              {t('actionJournal.commandCount', { count: action.commands.length })}
            </span>
          )}
          {action.status === 'error' && (
            <Tag tone="danger" className="shrink-0 font-normal">
              <AlertTriangle className="h-2.5 w-2.5" />
              {t('actionJournal.failed')}
            </Tag>
          )}
          {explained && (
            <span
              className="shrink-0 text-[9px] tracking-wide text-primary/70 uppercase"
              data-testid="action-row-explained"
            >
              {t('actionJournal.explained')}
            </span>
          )}
        </div>

        {/* The commands themselves — the part that must work with no model configured. */}
        <ul className="mt-1 space-y-0.5">
          {action.commands.flatMap((command) =>
            command.lines.map((line, i) => (
              <li
                key={`${command.entryId}-${i}`}
                className={`truncate font-mono text-[11px] ${
                  command.status === 'error' ? 'text-tone-danger' : 'text-muted-foreground'
                }`}
              >
                {line}
              </li>
            ))
          )}
        </ul>

        <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground/70">
          <span>{formatActivityTimestamp(action.startTimestamp)}</span>
          <span>{action.totalDurationMs}ms</span>
          {action.repoPath && (
            <span className="truncate">{action.repoPath.split('/').filter(Boolean).pop()}</span>
          )}
        </div>
      </div>

      <ChevronRight
        className={`mt-0.5 h-3.5 w-3.5 shrink-0 transition-colors ${
          selected ? 'text-foreground' : 'text-muted-foreground/40'
        }`}
        aria-hidden="true"
      />
    </button>
  )
}
