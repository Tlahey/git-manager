import { useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { AlertTriangle, X } from 'lucide-react'
import { Button, Input, Alert, Spinner, Tooltip, LlmIcon } from '@git-manager/ui'
import type { SummarySearchAnswer } from '@git-manager/ai'

interface SummaryAskPanelProps {
  onAsk: (question: string) => void
  onClear: () => void
  answer: SummarySearchAnswer | null
  isAsking: boolean
  error: string | null
  /** False when the AI provider is disabled — the box explains itself instead of failing on submit. */
  aiEnabled: boolean
  /** Jumps the timeline to a cited day. */
  onSelectMatch: (repo: string, date: string) => void
}

/**
 * "Ask the archive": a question answered by the model over the days the local scorer shortlisted.
 *
 * Separate from the filter box on purpose. Typing in the filter narrows a list and costs nothing;
 * asking a question spends a model run, so it is an explicit submit rather than a keystroke — and
 * the two take different input ("merge editor" vs "when did I finish the merge editor?").
 */
export function SummaryAskPanel({
  onAsk,
  onClear,
  answer,
  isAsking,
  error,
  aiEnabled,
  onSelectMatch,
}: SummaryAskPanelProps) {
  const { t } = useTranslation('dashboard')
  const [question, setQuestion] = useState('')

  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!isAsking) onAsk(question)
  }

  return (
    <div className="border-b border-border bg-card/20 px-6 py-3" data-testid="summary-ask-panel">
      <form onSubmit={submit} className="flex items-center gap-2">
        <LlmIcon className="h-4 w-4 shrink-0 text-primary" />
        <Input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={t('summaries.askPlaceholder')}
          aria-label={t('summaries.askLabel')}
          disabled={!aiEnabled}
          className="h-8 flex-1 text-xs"
          data-testid="summary-ask-input"
        />
        <Button
          type="submit"
          size="sm"
          variant="outline"
          className="h-8 text-xs"
          disabled={!aiEnabled || isAsking || question.trim() === ''}
          data-testid="summary-ask-submit"
        >
          {isAsking ? <Spinner className="mr-1.5 h-3.5 w-3.5" /> : null}
          {t('summaries.ask')}
        </Button>
        {(answer || error) && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => {
              setQuestion('')
              onClear()
            }}
            aria-label={t('summaries.clearAnswer')}
            data-testid="summary-ask-clear"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </form>

      {!aiEnabled && (
        <p className="mt-2 text-[11px] text-muted-foreground">{t('summaries.askDisabled')}</p>
      )}

      {error && (
        <Alert variant="destructive" className="mt-2 flex-col items-start gap-1 rounded-lg">
          <div className="flex items-center gap-2 text-xs font-medium">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            {t('summaries.askError')}
          </div>
          <p className="break-words font-mono text-[10px] opacity-80">{error}</p>
        </Alert>
      )}

      {answer && (
        <div
          className="mt-2 rounded-lg border border-border bg-card/60 p-3"
          data-testid="summary-answer"
        >
          <p className="select-text text-xs leading-relaxed text-foreground">{answer.answer}</p>
          {answer.matches.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {answer.matches.map((match) => (
                <li key={`${match.repo}-${match.date}`}>
                  <Tooltip content={match.reason}>
                    <button
                      type="button"
                      onClick={() => onSelectMatch(match.repo, match.date)}
                      className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      data-testid="summary-answer-match"
                    >
                      {match.repo} · {match.date}
                    </button>
                  </Tooltip>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
