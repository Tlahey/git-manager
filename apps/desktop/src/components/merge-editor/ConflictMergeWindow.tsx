import { useMemo, useRef, useState } from 'react'
import { Wand2, AlertCircle } from 'lucide-react'
import {
  Button,
  Spinner,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@git-manager/ui'
import { useTranslation } from '@git-manager/i18n'
import { QueryClientProvider } from '@tanstack/react-query'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { emit } from '@tauri-apps/api/event'
import { useMergeView } from '../../hooks/useMergeView'
import { apiResolveConflict, apiResolveConflictBinary } from '../../api/conflict.api'
import { ThreeWayMergeEditor, type ThreeWayMergeEditorRef } from './ThreeWayMergeEditor'
import { queryClient } from '../../lib/queryClient'
import { useTheme } from '../../hooks/useTheme'
import { useMonacoTheme } from '../../hooks/useMonacoTheme'

interface ConflictMergeWindowContentProps {
  repoPath: string
  filePath: string
}

export function ConflictMergeWindowContent({
  repoPath,
  filePath,
}: ConflictMergeWindowContentProps) {
  const { t } = useTranslation('git')
  const mergeEditorRef = useRef<ThreeWayMergeEditorRef>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isAutoMerging, setIsAutoMerging] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [confirmSide, setConfirmSide] = useState<'left' | 'right' | null>(null)

  const { data: view, isLoading } = useMergeView(repoPath, filePath)

  const parsedPath = useMemo(() => {
    const lastSlash = filePath.lastIndexOf('/')
    if (lastSlash === -1) return { dir: '', name: filePath }
    return { dir: filePath.substring(0, lastSlash + 1), name: filePath.substring(lastSlash + 1) }
  }, [filePath])

  async function handleKeepSide(side: 'ours' | 'theirs') {
    setIsSaving(true)
    setError(null)
    try {
      await apiResolveConflictBinary(repoPath, filePath, side)
      await emit('conflict-resolved', { repoPath, filePath })
      await getCurrentWindow().close()
    } catch (err) {
      setError(String(err))
    } finally {
      setIsSaving(false)
    }
  }

  async function handleApplyNonConflicting() {
    setIsAutoMerging(true)
    try {
      await mergeEditorRef.current?.applyAutoMerge()
    } finally {
      setIsAutoMerging(false)
    }
  }

  async function handleCancel() {
    await getCurrentWindow().close()
  }

  async function handleApply() {
    setIsSaving(true)
    setError(null)
    try {
      const content = mergeEditorRef.current?.getCenterValue() ?? ''
      await apiResolveConflict(repoPath, filePath, content)
      await emit('conflict-resolved', { repoPath, filePath })
      await getCurrentWindow().close()
    } catch (err) {
      setError(String(err))
    } finally {
      setIsSaving(false)
    }
  }

  async function handleConfirmDiscardAndApply() {
    if (!confirmSide) return
    setIsSaving(true)
    setError(null)
    try {
      const content = confirmSide === 'left' ? (view?.theirsText ?? '') : (view?.oursText ?? '')
      await apiResolveConflict(repoPath, filePath, content)
      await emit('conflict-resolved', { repoPath, filePath })
      await getCurrentWindow().close()
    } catch (err) {
      setError(String(err))
      setConfirmSide(null)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div
      data-testid="merge-editor-window"
      className="animate-fadeIn flex h-full w-full select-none flex-col overflow-hidden bg-background"
    >
      {/* HEADER / TOOLBAR */}
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-card px-4 py-3 shadow-sm">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex min-w-0 flex-col">
            {parsedPath.dir && (
              <span className="mb-0.5 truncate font-mono text-[10px] leading-none text-muted-foreground/60">
                {parsedPath.dir}
              </span>
            )}
            <span className="select-all truncate font-mono text-xs font-semibold leading-tight text-foreground">
              {parsedPath.name}
            </span>
          </div>
        </div>

        {view?.renderable && (
          <div className="flex shrink-0 items-center gap-3">
            {error && (
              <span className="flex items-center gap-1 text-xs font-medium text-destructive">
                <AlertCircle className="h-3.5 w-3.5" />
                {error}
              </span>
            )}
            <span className="rounded border border-border/40 bg-muted/65 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {t('conflictEditor.conflictsRemaining', { count: pendingCount })}
            </span>

            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1 px-2.5 text-[10px] font-bold"
              onClick={handleApplyNonConflicting}
              disabled={isAutoMerging || isSaving}
              title={t('conflictEditor.applyNonConflicting')}
              data-testid="merge-auto-merge-button"
            >
              {isAutoMerging ? (
                <Spinner className="h-3.5 w-3.5" />
              ) : (
                <Wand2 className="h-3.5 w-3.5" />
              )}
              {t('conflictEditor.applyNonConflicting')}
            </Button>
          </div>
        )}
      </div>

      {/* CONTENT AREA */}
      <div className="flex flex-1 select-text flex-col overflow-hidden bg-card/45 font-mono text-xs">
        {isLoading && (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <Spinner className="mr-2 h-5 w-5" />
            {t('common:status.loading')}
          </div>
        )}

        {!isLoading &&
          view &&
          (view.isBinary || view.conflictKind === 'delete' || view.conflictKind === 'rename') && (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-sm">
              <p className="font-medium text-foreground">
                {view.isBinary
                  ? t('conflictEditor.binaryConflict')
                  : t('conflictEditor.deleteConflict')}
              </p>
              {error && <p className="text-xs font-medium text-destructive">{error}</p>}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => handleKeepSide('ours')}
                  disabled={isSaving}
                  data-testid="keep-ours-button"
                >
                  {t('conflictEditor.keepOurs')}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleKeepSide('theirs')}
                  disabled={isSaving}
                  data-testid="keep-theirs-button"
                >
                  {t('conflictEditor.keepTheirs')}
                </Button>
              </div>
            </div>
          )}

        {!isLoading && view && !view.renderable && !view.isBinary && !view.conflictKind && (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {t('conflictEditor.unparseable')}
          </div>
        )}

        {!isLoading && view && view.renderable && (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4">
            <div className="animate-in fade-in zoom-in-95 flex flex-1 flex-col overflow-hidden rounded-lg border border-border/80 bg-background duration-100">
              <ThreeWayMergeEditor
                ref={mergeEditorRef}
                repoPath={repoPath}
                filePath={filePath}
                view={view}
                onPendingCountChange={setPendingCount}
              />
            </div>
          </div>
        )}
      </div>

      {/* FOOTER */}
      <div className="flex shrink-0 select-none items-center justify-between border-t border-border bg-card px-4 py-3 shadow-md">
        {/* Bottom Left: Accept Left + Accept Right */}
        <div className="flex items-center gap-2">
          {view?.renderable && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmSide('left')}
                disabled={isSaving}
                className="h-8 text-[11px] font-semibold"
                data-testid="merge-accept-left"
              >
                Accept Left
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmSide('right')}
                disabled={isSaving}
                className="h-8 text-[11px] font-semibold"
                data-testid="merge-accept-right"
              >
                Accept Right
              </Button>
            </>
          )}
        </div>

        {/* Bottom Right: Cancel + Apply */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCancel}
            disabled={isSaving}
            className="h-8 text-[11px] font-semibold"
            data-testid="merge-cancel"
          >
            Cancel
          </Button>
          <Button
            variant="success"
            size="sm"
            onClick={handleApply}
            disabled={isSaving || (view?.renderable ? pendingCount > 0 : false)}
            className="h-8 px-4 text-[11px] font-semibold"
            data-testid="merge-apply"
          >
            {isSaving ? <Spinner className="mr-1.5 h-3.5 w-3.5" /> : null}
            Apply
          </Button>
        </div>
      </div>

      <Dialog open={confirmSide !== null} onOpenChange={(open) => !open && setConfirmSide(null)}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Discard changes?</DialogTitle>
            <DialogDescription className="pt-2 text-sm leading-relaxed text-foreground">
              There are unsaved changes in the result file. Discard changes and accept {confirmSide}{' '}
              anyway?
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="mt-4 gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmSide(null)}
              disabled={isSaving}
              data-testid="dialog-continue-merge"
            >
              Continue merge
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleConfirmDiscardAndApply}
              disabled={isSaving}
              className="h-8 text-xs"
              data-testid="dialog-discard-and-apply"
            >
              {isSaving && <Spinner className="mr-1.5 h-3.5 w-3.5" />}
              discard changes and apply {confirmSide}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export function ConflictMergeWindow({
  repoPath,
  filePath,
}: {
  repoPath: string
  filePath: string
}) {
  useTheme()
  useMonacoTheme()

  return (
    <QueryClientProvider client={queryClient}>
      <ConflictMergeWindowContent repoPath={repoPath} filePath={filePath} />
    </QueryClientProvider>
  )
}
