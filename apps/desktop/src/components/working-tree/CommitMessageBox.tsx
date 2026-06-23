import { useRef, useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Button, Spinner, Textarea } from '@git-manager/ui'
import { Sparkles, Square, ChevronDown, History } from 'lucide-react'
import { useOllamaGeneration } from '../../hooks/useOllamaGeneration'
import { useCommitMessageHistory } from '../../hooks/useCommitMessageHistory'

interface CommitMessageBoxProps {
  repoPath: string
  message: string
  onChange: (msg: string) => void
  onCommit: () => void
  isCommitting: boolean
  hasStagedFiles: boolean
}

export function CommitMessageBox({
  repoPath,
  message,
  onChange,
  onCommit,
  isCommitting,
  hasStagedFiles,
}: CommitMessageBoxProps) {
  const { t } = useTranslation('git')
  const { generate, cancel, status: genStatus } = useOllamaGeneration(repoPath)
  const { history, addMessage } = useCommitMessageHistory()
  const accumulatedRef = useRef('')
  const [historyOpen, setHistoryOpen] = useState(false)

  const isGenerating = genStatus === 'connecting' || genStatus === 'streaming'
  const canCommit = hasStagedFiles && message.trim().length > 0 && !isCommitting

  function handleGenerate() {
    if (isGenerating) {
      cancel()
      return
    }

    accumulatedRef.current = ''
    onChange('')
    generate(
      (token: string) => {
        accumulatedRef.current += token
        onChange(accumulatedRef.current)
      },
      (full: string) => {
        addMessage(full)
      },
    )
  }

  return (
    <div className="flex flex-col gap-2 border-t border-border p-2">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {t('commit.title')}
      </p>

      <Textarea
        value={message}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t('commit.placeholder')}
        rows={3}
        className="resize-none font-mono text-xs"
        disabled={isGenerating}
      />

      <div className="flex gap-2">
        {/* Generate button + history dropdown */}
        <div className="relative flex flex-1">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 gap-1.5 rounded-r-none text-xs border-r-0"
            onClick={handleGenerate}
            disabled={!hasStagedFiles && !isGenerating}
          >
            {isGenerating ? (
              <>
                <Square className="h-3 w-3" />
                {t('commit.stop')}
              </>
            ) : (
              <>
                <Sparkles className="h-3 w-3" />
                {t('commit.generate')}
              </>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-7 rounded-l-none px-0 text-xs"
            onClick={() => setHistoryOpen((v) => !v)}
            disabled={isGenerating}
            title={t('commit.history')}
          >
            <ChevronDown className="h-3 w-3" />
          </Button>

          {/* History dropdown */}
          {historyOpen && (
            <div className="absolute bottom-full left-0 z-50 mb-1 w-full min-w-[220px] rounded border border-border bg-background shadow-lg">
              <div className="flex items-center gap-1.5 border-b border-border px-2 py-1.5">
                <History className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">
                  {t('commit.history')}
                </span>
              </div>
              {history.length === 0 ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">
                  {t('commit.historyEmpty')}
                </p>
              ) : (
                history.map((msg, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      onChange(msg)
                      setHistoryOpen(false)
                    }}
                    className="w-full truncate px-3 py-1.5 text-left text-xs text-foreground hover:bg-accent transition-colors"
                  >
                    {msg}
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        <Button
          size="sm"
          className="flex-1 text-xs"
          onClick={onCommit}
          disabled={!canCommit}
        >
          {isCommitting ? <Spinner className="mr-1 h-3 w-3" /> : null}
          {t('commit.commit')}
        </Button>
      </div>
    </div>
  )
}
