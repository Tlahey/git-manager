import { Play, ChevronDown, Star } from 'lucide-react'
import type { RunTask } from '@git-manager/git-types'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@git-manager/ui'
import { useTranslation } from '@git-manager/i18n'

interface RunButtonProps {
  tasks: RunTask[]
  defaultTask: RunTask | undefined
  onRun: (task: RunTask) => void
}

/**
 * Split "Lancer" button: the primary action runs the default task; the dropdown lists every task.
 * Only mounted when the active workspace has at least one task (like the terminal/editor buttons),
 * so there's no empty/disabled state. Mirrors `FetchButton`.
 */
export function RunButton({ tasks, defaultTask, onRun }: RunButtonProps) {
  const { t } = useTranslation('git')

  return (
    <div className="flex shrink-0 items-stretch" data-testid="toolbar-run-button">
      <button
        type="button"
        onClick={() => defaultTask && onRun(defaultTask)}
        title={defaultTask ? t('toolbar.runTask', { name: defaultTask.name }) : t('toolbar.run')}
        data-testid="toolbar-run-button-primary"
        className="group flex min-w-[40px] flex-col items-center justify-center gap-0.5 rounded-l px-2 py-1 transition-colors hover:bg-accent"
      >
        <Play className="h-4 w-4 text-orange-400" />
        <span className="hidden text-[10px] leading-none text-muted-foreground transition-colors group-hover:text-foreground lg:inline">
          {t('toolbar.run')}
        </span>
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={t('toolbar.run')}
            data-testid="toolbar-run-button-menu"
            className="flex items-center rounded-r px-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          {tasks.map((task) => {
            const isDefault = task.id === defaultTask?.id
            return (
              <DropdownMenuItem
                key={task.id}
                onSelect={() => onRun(task)}
                data-testid={`toolbar-run-task-${task.id}`}
                className="flex items-center gap-2 text-xs"
              >
                <Play className="h-3.5 w-3.5 shrink-0 text-orange-400" />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-medium text-foreground">{task.name}</span>
                  <span className="truncate font-mono text-[10px] text-muted-foreground">
                    {task.command}
                  </span>
                </span>
                {isDefault && (
                  <Star className="ml-auto h-3 w-3 shrink-0 fill-amber-400 text-amber-400" />
                )}
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
