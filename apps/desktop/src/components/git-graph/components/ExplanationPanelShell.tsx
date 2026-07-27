import { useEffect, useRef, useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Button, ScrollArea, Spinner, Tooltip, LlmIcon } from '@git-manager/ui'
import { X, RefreshCw, Square, Copy, Check as CheckIcon, Trash2 } from 'lucide-react'
import { aiErrorMessage } from '../../../lib/aiErrorMessage'
import { formatRelativeTime } from '../../../lib/relativeDate'
import { Markdown } from '../../Markdown'

export interface ExplanationPanelShellProps {
  repoPath: string
  /** Panel heading — "Branch summary" / "Commit summary". */
  title: string
  /** What is being explained: a branch name, or a short sha + subject. */
  subject: React.ReactNode
  /** One line naming what it was read against ("compared to origin/main", "vs abc1234^"). */
  comparison: string
  /** Shown in the body before anything has been generated. */
  emptyHint: string
  text: string
  status: string
  isGenerating: boolean
  error: string | null
  /** Epoch ms of the remembered explanation, or `null`. */
  generatedAt: number | null
  /** Set when the remembered explanation used a different comparison than the current one. */
  staleComparison: string | null
  /**
   * Optional line under the header, for something the reader needs to know about *this run* rather
   * than about its subject — the code review uses it to report prompt size. Left as a node, not a
   * string, so a panel can style its own severity without this shell learning what the notice means.
   */
  notice?: React.ReactNode
  onGenerate: () => void
  onCancel: () => void
  onForget: () => void
  onClose: () => void
  testId: string
}

/**
 * The right-panel chrome shared by the branch and commit explanations: header, actions, markdown
 * body, and the "remembered from …" affordances.
 *
 * Purely presentational — it takes no store and runs no generation, so the two containers stay thin
 * and their hooks (which fetch entirely different git data) are called unconditionally at the top of
 * each. Extracted rather than duplicated because everything the user touches here is identical
 * between the two, and a second copy would drift.
 */
export function ExplanationPanelShell({
  repoPath,
  title,
  subject,
  comparison,
  emptyHint,
  text,
  status,
  isGenerating,
  error,
  generatedAt,
  staleComparison,
  notice,
  onGenerate,
  onCancel,
  onForget,
  onClose,
  testId,
}: ExplanationPanelShellProps) {
  const { t, i18n } = useTranslation('git')
  const { t: tErrors } = useTranslation('errors')
  const [copied, setCopied] = useState(false)
  const autoStarted = useRef(false)

  // Picking the menu item IS the request, so generation starts with the panel — no second click on
  // a button inside the thing you just asked for.
  //
  // Except when a summary is already remembered: showing it instantly is the whole point of keeping
  // it, and auto-regenerating over it would spend a minute of local model time to replace an answer
  // the user can already read. They regenerate when they judge it stale.
  //
  // The panels are keyed by subject upstream, so "on mount" means "on a new subject". The ref guards
  // against a second run if React remounts the effect.
  useEffect(() => {
    if (autoStarted.current || text) return
    autoStarted.current = true
    onGenerate()
    // Deliberately mount-only: re-running on `onGenerate`'s identity would restart the generation
    // on every settings tick, and on `text` would restart it the moment the user clears one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleCopy() {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div
      data-testid={testId}
      className="flex h-full w-full min-w-0 flex-col overflow-hidden border-l border-border bg-card shadow-2xl"
    >
      {/* PANEL HEADER — matches ConflictResolutionPanel / CommitHeaderInfo */}
      <div className="flex flex-col gap-2.5 border-b border-border bg-muted/20 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="flex min-w-0 items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <LlmIcon className="h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="truncate">{title}</span>
          </h3>
          <button
            onClick={onClose}
            className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title={t('actions.close')}
            data-testid="explanation-close"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex min-w-0 flex-col gap-1">
          <div className="min-w-0" data-testid="explanation-subject">
            {subject}
          </div>
          <span className="truncate text-[10px] text-muted-foreground">{comparison}</span>
          {generatedAt !== null && !isGenerating && (
            <span className="text-[10px] text-muted-foreground" data-testid="explanation-age">
              {t('gitTree.explanation.generatedAt', {
                // The helper works in epoch *seconds*; the store records milliseconds.
                when: formatRelativeTime(generatedAt / 1000, i18n.language),
              })}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {isGenerating ? (
            <Button
              data-testid="explanation-stop"
              variant="outline"
              size="sm"
              className="h-6 gap-1 px-2 text-[10px] font-bold"
              onClick={onCancel}
            >
              <Square className="h-3 w-3" />
              {t('gitTree.explanation.stop')}
            </Button>
          ) : (
            <Button
              data-testid="explanation-generate"
              variant={text ? 'outline' : 'default'}
              size="sm"
              className="h-6 gap-1 px-2 text-[10px] font-bold"
              onClick={onGenerate}
            >
              {text ? <RefreshCw className="h-3 w-3" /> : <LlmIcon className="h-3 w-3" />}
              {text ? t('gitTree.explanation.regenerate') : t('gitTree.explanation.generate')}
            </Button>
          )}

          {text && !isGenerating && (
            <>
              <Tooltip content={t('gitTree.explanation.copy')}>
                <Button
                  data-testid="explanation-copy"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={handleCopy}
                  aria-label={t('gitTree.explanation.copy')}
                >
                  {copied ? (
                    <CheckIcon className="h-3 w-3 text-tone-success" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </Button>
              </Tooltip>
              <Tooltip content={t('gitTree.explanation.forget')}>
                <Button
                  data-testid="explanation-forget"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={onForget}
                  aria-label={t('gitTree.explanation.forget')}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </Tooltip>
            </>
          )}
        </div>

        {staleComparison && (
          <p data-testid="explanation-stale-base" className="text-[10px] text-tone-warning">
            {t('gitTree.explanation.staleComparison', { comparison: staleComparison })}
          </p>
        )}

        {notice}
      </div>

      <ScrollArea className="w-full min-w-0 flex-1">
        <div className="w-full min-w-0 px-4 py-4">
          {status === 'error' ? (
            // `break-words`: an undecoded error is a raw provider payload — a JSON blob or a URL
            // with no space in it, which would otherwise run off the panel's right edge. The
            // markdown body below sets this for itself; this paragraph is outside it.
            <p data-testid="explanation-error" className="break-words text-xs text-tone-danger">
              {aiErrorMessage(error ?? '', tErrors)}
            </p>
          ) : text ? (
            <Markdown content={text} repoPath={repoPath} className="text-xs" />
          ) : isGenerating ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Spinner className="h-3.5 w-3.5" />
              {t('gitTree.explanation.generating')}
            </div>
          ) : (
            <p data-testid="explanation-empty" className="text-xs text-muted-foreground">
              {emptyHint}
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
