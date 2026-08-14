import { useEffect, useRef, useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Button, ScrollArea, Spinner, Tooltip, LlmIcon } from '@git-manager/ui'
import { Check as CheckIcon, Copy, RefreshCw, Settings, Square, Trash2, X } from 'lucide-react'
import type { PooledAction } from '../../../lib/actionPool'
import { aiErrorMessage, appErrorMessage } from '../../../lib/aiErrorMessage'
import { formatActivityDateTime } from '../../../lib/formatActivityLog'
import { formatRelativeTime } from '../../../lib/relativeDate'
import { Markdown } from '../../../components/Markdown'
import { useActionExplanation } from '../../../hooks/useActionExplanation'
import { ActionFamilyIcon } from './actionFamilyIcon'

interface ActionDetailPanelProps {
  action: PooledAction
  /**
   * Whether a model can be asked at all. `false` hides every generate affordance and shows how to
   * turn it on instead — the window still does its main job (see {@link ActionRow}), so this is a
   * missing bonus, not a broken panel.
   */
  aiAvailable: boolean
  onClose: () => void
}

/**
 * One action, in full: every command it ran, and — when a model is configured — what those commands
 * are for.
 *
 * Deliberately not built on `ExplanationPanelShell`. That shell is shaped around a *subject with a
 * comparison* (a branch against its base, a commit against its parent) and auto-generates on mount
 * because picking its menu item **was** the request. Neither holds here: an action has no comparison,
 * and selecting a row is a request to *read the commands*, which are already on screen. Generating
 * unasked would fire a model call on every arrow-key press down the list.
 */
export function ActionDetailPanel({ action, aiAvailable, onClose }: ActionDetailPanelProps) {
  const { t, i18n } = useTranslation('common')
  const { t: tErrors } = useTranslation('errors')
  const { explain, cancel, clear, status, isGenerating, error, text, generatedAt } =
    useActionExplanation(action)
  const [copied, setCopied] = useState(false)

  // A live generation belongs to the action that started it. Switching rows mid-stream would
  // otherwise pour one action's tokens into another's panel, since the hook's text is keyed by
  // nothing — the ref makes the cancel fire once, on the action that is leaving.
  const generatingRef = useRef(isGenerating)
  generatingRef.current = isGenerating
  useEffect(() => {
    return () => {
      if (generatingRef.current) void cancel()
    }
  }, [action.id, cancel])

  async function handleCopy() {
    await navigator.clipboard.writeText(
      action.commands.flatMap((command) => command.lines).join('\n')
    )
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div
      data-testid="action-detail-panel"
      className="flex h-full w-full min-w-0 flex-col overflow-hidden border-l border-border bg-card"
    >
      <div className="flex flex-col gap-2 border-b border-border bg-muted/20 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex min-w-0 items-center gap-1.5 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            <ActionFamilyIcon family={action.family} />
            <span className="truncate">{t(action.titleKey)}</span>
          </h2>
          <button
            onClick={onClose}
            className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label={t('actionJournal.closeDetail')}
            data-testid="action-detail-close"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <p className="text-[10px] text-muted-foreground">
          {formatActivityDateTime(action.startTimestamp)} · {action.totalDurationMs}ms
          {action.repoPath ? ` · ${action.repoPath}` : ''}
        </p>
      </div>

      <ScrollArea className="w-full min-w-0 flex-1">
        <div className="flex flex-col gap-4 px-4 py-3">
          {/* WHAT RAN — always present, model or no model. */}
          <section>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <h3 className="text-[10px] font-semibold tracking-wide text-muted-foreground/70 uppercase">
                {t('actionJournal.commandsRan')}
              </h3>
              <Tooltip content={t('actionJournal.copyCommands')}>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={handleCopy}
                  aria-label={t('actionJournal.copyCommands')}
                  data-testid="action-copy-commands"
                >
                  {copied ? (
                    <CheckIcon className="h-3 w-3 text-tone-success" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </Button>
              </Tooltip>
            </div>
            <ol className="space-y-1.5">
              {action.commands.map((command) => (
                <li
                  key={command.entryId}
                  className="rounded border border-border/60 bg-muted/30 p-2"
                >
                  {command.lines.map((line, i) => (
                    <code
                      key={i}
                      className="block font-mono text-[11px] break-all text-foreground/90"
                    >
                      {line}
                    </code>
                  ))}
                  <p className="mt-1 text-[10px] text-muted-foreground/70">
                    {t(command.titleKey)} · {command.durationMs}ms
                  </p>
                  {command.status === 'error' && (
                    <p
                      className="mt-1 text-[10px] wrap-break-word text-tone-danger"
                      data-testid="action-command-error"
                    >
                      {appErrorMessage(command.error ?? '')}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          </section>

          {/* WHAT IT MEANS — the model's part. */}
          <section>
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <h3 className="flex items-center gap-1.5 text-[10px] font-semibold tracking-wide text-muted-foreground/70 uppercase">
                <LlmIcon className="h-3 w-3 text-primary" />
                {t('actionJournal.explanation')}
              </h3>
              {aiAvailable &&
                (isGenerating ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 gap-1 px-2 text-[10px] font-bold"
                    onClick={() => void cancel()}
                    data-testid="action-explain-stop"
                  >
                    <Square className="h-3 w-3" />
                    {t('actionJournal.stop')}
                  </Button>
                ) : (
                  <Button
                    variant={text ? 'outline' : 'default'}
                    size="sm"
                    className="h-6 gap-1 px-2 text-[10px] font-bold"
                    onClick={() => void explain()}
                    data-testid="action-explain"
                  >
                    {text ? <RefreshCw className="h-3 w-3" /> : <LlmIcon className="h-3 w-3" />}
                    {text ? t('actionJournal.regenerate') : t('actionJournal.explain')}
                  </Button>
                ))}
              {aiAvailable && text && !isGenerating && (
                <Tooltip content={t('actionJournal.forget')}>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={clear}
                    aria-label={t('actionJournal.forget')}
                    data-testid="action-explain-forget"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </Tooltip>
              )}
              {generatedAt !== null && !isGenerating && (
                <span
                  className="text-[10px] text-muted-foreground"
                  data-testid="action-explain-age"
                >
                  {t('actionJournal.generatedAt', {
                    // The helper works in epoch seconds; the store records milliseconds.
                    when: formatRelativeTime(generatedAt / 1000, i18n.language),
                  })}
                </span>
              )}
            </div>

            {!aiAvailable ? (
              <p
                className="flex items-start gap-1.5 text-xs text-muted-foreground"
                data-testid="action-explain-unavailable"
              >
                <Settings className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {t('actionJournal.aiUnavailable')}
              </p>
            ) : status === 'error' ? (
              <p
                className="text-xs wrap-break-word text-tone-danger"
                data-testid="action-explain-error"
              >
                {aiErrorMessage(error ?? '', tErrors)}
              </p>
            ) : text ? (
              <Markdown content={text} repoPath={action.repoPath} className="text-xs" />
            ) : isGenerating ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Spinner className="h-3.5 w-3.5" />
                {t('actionJournal.generating')}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground" data-testid="action-explain-empty">
                {t('actionJournal.explainHint')}
              </p>
            )}
          </section>
        </div>
      </ScrollArea>
    </div>
  )
}
