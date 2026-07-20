import { useEffect, useMemo, useState } from 'react'
import { X, AlertTriangle, Check } from 'lucide-react'
import { ScrollArea, Button, Spinner, Textarea, cn } from '@git-manager/ui'
import { useTranslation } from '@git-manager/i18n'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { mutate } from 'swr'
import { useConflictedFiles } from '../../hooks/useConflictedFiles'
import { useGitStatus } from '../../hooks/useGitStatus'
import {
  apiRebaseAbort,
  apiRebaseContinue,
  apiRebaseSkip,
  apiGetRebaseState,
} from '../../api/git.api'
import { CommitFileList, type ProcessedFileItem } from './components/CommitFileList'

interface ConflictResolutionPanelProps {
  repoPath: string
  activeFile: string | null
  onSelectFile: (path: string) => void
  onClose: () => void
}

/**
 * Right-panel view swapped in for `CommitDetailsPanel` while a rebase is paused — modeled
 * on the working-tree panel (`CommitFileList` + `WipStagingPanel`): conflicted files on top,
 * resolved (staged) files below, then a commit message box and the Skip/Continue/Abort
 * actions for the paused rebase step.
 */
export function ConflictResolutionPanel({
  repoPath,
  onSelectFile,
  onClose,
}: ConflictResolutionPanelProps) {
  const { t } = useTranslation('git')
  const queryClient = useQueryClient()

  const { data: conflictedFiles = [] } = useConflictedFiles(repoPath)
  const { data: gitStatus } = useGitStatus(repoPath)
  const { data: rebaseState } = useQuery({
    queryKey: ['rebase-state', repoPath],
    queryFn: () => apiGetRebaseState(repoPath),
    enabled: !!repoPath,
    refetchInterval: 4000,
  })

  const resolvedFiles = useMemo(() => gitStatus?.staged ?? [], [gitStatus?.staged])

  const conflictedItems = useMemo<ProcessedFileItem[]>(
    () => conflictedFiles.map((path) => ({ path, status: 'modified', staged: false })),
    [conflictedFiles]
  )
  const resolvedItems = useMemo<ProcessedFileItem[]>(
    () =>
      resolvedFiles.map((f) => ({
        path: f.path,
        status: (['added', 'modified', 'deleted', 'renamed'].includes(f.status)
          ? f.status
          : 'modified') as ProcessedFileItem['status'],
        staged: true,
      })),
    [resolvedFiles]
  )

  const [amend, setAmend] = useState(false)
  const [message, setMessage] = useState('')
  const [isLoading, setIsLoading] = useState<'continue' | 'abort' | 'skip' | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Reset the editable message whenever the step being replayed changes. Deliberately keyed
  // only on currentOid — currentMessage must NOT be a dep, or the operator's in-progress edits
  // would get clobbered every time the polling refetch (see `refetchInterval` above) returns a
  // new object with the same message.
  useEffect(() => {
    setMessage(rebaseState?.currentMessage?.trim() ?? '')
    setAmend(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rebaseState?.currentOid])

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['rebase-state', repoPath] })
    queryClient.invalidateQueries({ queryKey: ['git-status', repoPath] })
    queryClient.invalidateQueries({ queryKey: ['git-log', repoPath] })
    mutate(['conflicted-files', repoPath])
  }

  async function handleAbort() {
    setIsLoading('abort')
    setError(null)
    try {
      await apiRebaseAbort(repoPath)
      onClose()
      refresh()
    } catch (err) {
      setError(String(err))
    } finally {
      setIsLoading(null)
    }
  }

  async function handleSkip() {
    setIsLoading('skip')
    setError(null)
    try {
      await apiRebaseSkip(repoPath)
      refresh()
    } catch (err) {
      setError(String(err))
    } finally {
      setIsLoading(null)
    }
  }

  async function handleContinue() {
    setIsLoading('continue')
    setError(null)
    try {
      await apiRebaseContinue(repoPath, amend ? message : undefined)
      onClose()
      refresh()
    } catch (err) {
      setError(String(err))
    } finally {
      setIsLoading(null)
    }
  }

  const allResolved = conflictedFiles.length === 0
  const noneResolved = resolvedFiles.length === 0 && conflictedFiles.length > 0

  return (
    <div
      data-testid="conflict-resolution-panel"
      className="flex h-full w-full min-w-0 flex-col overflow-hidden border-l border-border bg-card shadow-2xl"
    >
      {/* PANEL HEADER — matches CommitHeaderInfo's header bar */}
      <div className="flex flex-col gap-2.5 border-b border-border bg-muted/20 px-4 py-3">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <AlertTriangle className="h-3.5 w-3.5 text-orange-400" />
            {t('conflictEditor.resolvePanelTitle')}
          </h3>
          <div className="flex shrink-0 items-center gap-1.5">
            {rebaseState?.currentStep && rebaseState?.totalSteps && (
              <span className="rounded border border-border/40 bg-muted/65 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-muted-foreground">
                {t('conflictEditor.stepProgress', {
                  current: rebaseState.currentStep,
                  total: rebaseState.totalSteps,
                })}
              </span>
            )}
            <button
              onClick={onClose}
              className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              title={t('actions.close')}
              data-testid="conflict-panel-close-button"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Same scroll/viewport override as CommitDetailsPanel, so CommitFileList (tree/list
          toggle, search, grey "Modifications" card) renders identically to the working-tree panel. */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        .conflict-scroll-area [data-radix-scroll-area-viewport] > div {
          display: block !important;
          width: 100% !important;
        }
      `,
        }}
      />
      <ScrollArea className="conflict-scroll-area w-full min-w-0 flex-1">
        <div className="w-full min-w-0 space-y-4 overflow-hidden px-4 py-4">
          <CommitFileList
            repoPath={repoPath}
            isWip={false}
            commitOid="CONFLICTED"
            cacheKey={`${repoPath}:conflicted`}
            processedFiles={conflictedItems}
            title={t('conflictEditor.conflictedFilesTitle')}
            emptyMessage={t('conflictEditor.allResolved')}
            hideStats
            hideSearch
            onSelectFileDiff={(file) => onSelectFile(file.path)}
          />

          <CommitFileList
            repoPath={repoPath}
            isWip={false}
            commitOid="RESOLVED"
            cacheKey={`${repoPath}:resolved`}
            processedFiles={resolvedItems}
            title={t('conflictEditor.resolvedFilesTitle')}
            emptyMessage={t('conflictEditor.noResolvedFiles')}
            hideStats
            hideSearch
          />
        </div>
      </ScrollArea>

      {/* Commit message + amend previous commit */}
      <div className="shrink-0 space-y-1.5 border-t border-border/55 px-4 py-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {t('commit.title')}
          </span>
          <button
            type="button"
            onClick={() => setAmend((v) => !v)}
            data-testid="conflict-amend-toggle"
            className="flex select-none items-center gap-1.5 text-[10px] font-medium text-muted-foreground"
          >
            <span
              className={cn(
                'flex h-3.5 w-3.5 items-center justify-center rounded border transition-colors',
                amend ? 'border-primary bg-primary text-white' : 'border-border text-transparent'
              )}
            >
              <Check className="h-2.5 w-2.5" />
            </span>
            {t('conflictEditor.amendPreviousCommit')}
          </button>
        </div>
        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          disabled={!amend}
          placeholder={t('commit.placeholder')}
          className="resize-none font-mono text-xs"
        />
      </div>

      {error && <p className="shrink-0 px-3 py-1 text-xs text-destructive">{error}</p>}

      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border px-3 py-2">
        <div className="flex items-center gap-2">
          {noneResolved && (
            <Button
              variant="success"
              size="sm"
              onClick={handleSkip}
              disabled={!!isLoading}
              data-testid="conflict-panel-skip-button"
            >
              {isLoading === 'skip' && <Spinner className="mr-1 h-3 w-3" />}
              {t('conflictEditor.skipCommit')}
            </Button>
          )}
          {allResolved && (
            <Button
              variant="success"
              size="sm"
              onClick={handleContinue}
              disabled={!!isLoading}
              data-testid="conflict-panel-continue-button"
            >
              {isLoading === 'continue' && <Spinner className="mr-1 h-3 w-3" />}
              {t('conflictEditor.continueRebase')}
            </Button>
          )}
        </div>
        <Button
          variant="destructive"
          size="sm"
          onClick={handleAbort}
          disabled={!!isLoading}
          data-testid="conflict-panel-abort-button"
        >
          {isLoading === 'abort' && <Spinner className="mr-1 h-3 w-3" />}
          {t('conflictEditor.abortRebase')}
        </Button>
      </div>
    </div>
  )
}
