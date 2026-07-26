import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Button, Spinner, Tooltip } from '@git-manager/ui'
import { Sparkles, Square, RefreshCw, Copy, Check as CheckIcon, X } from 'lucide-react'
import type { GitDiffFile } from '@git-manager/git-types'
import { useChangeExplanation } from '../../../hooks/useChangeExplanation'
import { formatUnifiedPatch } from '../../../lib/formatUnifiedPatch'
import { aiErrorMessage } from '../../../lib/aiErrorMessage'
import { Markdown } from '../../Markdown'

interface ChangeExplanationPanelProps {
  repoPath: string
  /** The diff being explained — its hunks are rendered back to patch text for the prompt. */
  diffData: GitDiffFile
  /** Current content of the file, from the diff viewer's raw-contents fetch (the "after" side). */
  fileContent?: string
}

/** Repository name for the prompt: the last segment of its path, which is what the user calls the
 * project. Cheaper than an `AiContext` round-trip that would re-fetch a diff we already hold. */
function repoNameOf(repoPath: string): string {
  const segments = repoPath.split('/').filter(Boolean)
  return segments[segments.length - 1] ?? repoPath
}

/**
 * "Explain these changes" — an on-demand, local-AI reading of the file's pending diff, shown above
 * the diff editor.
 *
 * The explanation is grounded in the file's own content, not just the patch: the model is asked what
 * the change does to *this* file, which is the part the +/- lines on screen do not answer. Nothing
 * runs until the user asks — a diff view that fires a generation on every file it opens would keep
 * a local model busy for changes nobody wanted explained.
 */
export function ChangeExplanationPanel({
  repoPath,
  diffData,
  fileContent,
}: ChangeExplanationPanelProps) {
  const { t } = useTranslation('git')
  const { t: tErrors } = useTranslation('errors')
  const { explain, cancel, reset, status, error, text } = useChangeExplanation()
  const [copied, setCopied] = useState(false)

  const patch = useMemo(() => formatUnifiedPatch(diffData), [diffData])
  const fileKey = `${diffData.newPath}:${diffData.oldPath}`

  // An explanation belongs to one file's diff. When the viewer swaps in another file the previous
  // answer would otherwise stay on screen, described against the wrong patch.
  useEffect(() => {
    reset()
    setCopied(false)
  }, [fileKey, reset])

  const isGenerating = status === 'connecting' || status === 'streaming'
  const isExpanded = isGenerating || text.length > 0 || status === 'error'

  async function handleExplain() {
    await explain({
      repoName: repoNameOf(repoPath),
      file: {
        path: diffData.newPath || diffData.oldPath,
        status: diffData.status,
        patch,
        additions: diffData.additions,
        deletions: diffData.deletions,
      },
      fileContent,
    })
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div
      data-testid="change-explanation-panel"
      className="shrink-0 border-b border-border/60 bg-muted/20"
    >
      <div className="flex items-center justify-between gap-2 px-3 py-1.5">
        <div className="flex min-w-0 items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span className="truncate">{t('diffView.explain.title')}</span>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {isGenerating ? (
            <Button
              data-testid="change-explanation-cancel"
              variant="outline"
              size="sm"
              className="h-6 gap-1 px-2 text-[10px] font-bold"
              onClick={cancel}
            >
              <Square className="h-3 w-3" />
              {t('diffView.explain.stop')}
            </Button>
          ) : (
            <Button
              data-testid="change-explanation-run"
              variant={text ? 'ghost' : 'default'}
              size="sm"
              className="h-6 gap-1 px-2 text-[10px] font-bold"
              onClick={handleExplain}
            >
              {text ? <RefreshCw className="h-3 w-3" /> : <Sparkles className="h-3 w-3" />}
              {text ? t('diffView.explain.regenerate') : t('diffView.explain.action')}
            </Button>
          )}

          {text && !isGenerating && (
            <>
              <Tooltip content={t('diffView.explain.copy')}>
                <Button
                  data-testid="change-explanation-copy"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={handleCopy}
                  aria-label={t('diffView.explain.copy')}
                >
                  {copied ? (
                    <CheckIcon className="h-3 w-3 text-tone-success" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </Button>
              </Tooltip>
              <Tooltip content={t('diffView.explain.dismiss')}>
                <Button
                  data-testid="change-explanation-dismiss"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={reset}
                  aria-label={t('diffView.explain.dismiss')}
                >
                  <X className="h-3 w-3" />
                </Button>
              </Tooltip>
            </>
          )}
        </div>
      </div>

      {isExpanded && (
        <div
          data-testid="change-explanation-body"
          className="max-h-56 overflow-y-auto border-t border-border/60 px-3 py-2 font-sans"
        >
          {status === 'error' ? (
            <p data-testid="change-explanation-error" className="text-xs text-tone-danger">
              {aiErrorMessage(error ?? '', tErrors)}
            </p>
          ) : text ? (
            <Markdown content={text} repoPath={repoPath} className="text-xs" />
          ) : (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Spinner className="h-3.5 w-3.5" />
              {t('diffView.explain.generating')}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
