import { useRef, useState } from 'react'
import { AlertCircle } from 'lucide-react'
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
  const [pendingCount, setPendingCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [confirmSide, setConfirmSide] = useState<'left' | 'right' | null>(null)

  const { data: view, isLoading } = useMergeView(repoPath, filePath)

  // The pane a discard would accept, named rather than interpolated raw: 'left'/'right' are
  // internal identifiers, and dropping them into a sentence would leave the English word in
  // every locale.
  const confirmSideLabel = confirmSide
    ? t(confirmSide === 'left' ? 'conflictEditor.sideLeft' : 'conflictEditor.sideRight')
    : ''

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

  async function handleCancel() {
    await getCurrentWindow().close()
  }

  async function handleApply() {
    // Never derive a write to disk from an absent editor. `resolve_conflict` (services/
    // git_conflict.rs) truncates the working-tree file to whatever it is handed and stages the
    // result, so applying the `?? ''` fallback of an unmounted resolver resolves the conflict by
    // destroying the file. The merge editor is deliberately not rendered in four states — while
    // the view loads, and for binary / delete-rename / unparseable conflicts — and the Apply
    // button is disabled in all of them (see its `disabled` below); this is the same rule
    // enforced where the write actually happens, since a button state is not a guarantee.
    //
    // The guard is on the ref, never on the value: an empty string from a *mounted* editor is a
    // legitimate resolution (both sides deleted the content) and must still be written.
    const mergeEditor = mergeEditorRef.current
    if (!mergeEditor) return

    setIsSaving(true)
    setError(null)
    try {
      const content = mergeEditor.getCenterValue()
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
      className="animate-fadeIn flex h-full w-full flex-col overflow-hidden bg-background select-none"
    >
      {/* CONTENT AREA */}
      <div className="flex flex-1 flex-col overflow-hidden bg-card/45 font-mono text-xs select-text">
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
          <div className="flex min-h-0 flex-1 animate-in flex-col overflow-hidden border border-border/80 bg-background zoom-in-95 animate-duration-100 fade-in">
            <ThreeWayMergeEditor
              ref={mergeEditorRef}
              repoPath={repoPath}
              filePath={filePath}
              view={view}
              onPendingCountChange={setPendingCount}
            />
          </div>
        )}
      </div>

      {error && (
        <div
          className="flex shrink-0 items-center gap-1.5 border-t border-border bg-destructive/10 px-4 py-2 text-xs font-medium text-destructive"
          data-testid="merge-error-banner"
        >
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{error}</span>
        </div>
      )}

      {/* FOOTER */}
      <div className="flex shrink-0 items-center justify-between border-t border-border bg-card px-4 py-3 shadow-md select-none">
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
                {t('conflictEditor.acceptLeft')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmSide('right')}
                disabled={isSaving}
                className="h-8 text-[11px] font-semibold"
                data-testid="merge-accept-right"
              >
                {t('conflictEditor.acceptRight')}
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
            {t('common:actions.cancel')}
          </Button>
          <Button
            variant="success"
            size="sm"
            onClick={handleApply}
            // Applying means writing the result pane's content over the conflicted file, so this
            // is enabled only when there IS a result pane: `renderable` is exactly the condition
            // under which the merge editor is rendered above. The previous `view?.renderable ?
            // pendingCount > 0 : false` had it backwards — it left Apply enabled in every state
            // that renders no editor (loading, binary, delete/rename, unparseable), where it
            // applied an empty result and emptied the file.
            disabled={isSaving || !view?.renderable || pendingCount > 0}
            className="h-8 px-4 text-[11px] font-semibold"
            data-testid="merge-apply"
          >
            {isSaving ? <Spinner className="mr-1.5 h-3.5 w-3.5" /> : null}
            {t('conflictEditor.apply')}
          </Button>
        </div>
      </div>

      <Dialog open={confirmSide !== null} onOpenChange={(open) => !open && setConfirmSide(null)}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>{t('conflictEditor.discardTitle')}</DialogTitle>
            <DialogDescription className="pt-2 text-sm leading-relaxed text-foreground">
              {t('conflictEditor.discardDescription', { side: confirmSideLabel })}
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
              {t('conflictEditor.continueMerge')}
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
              {t('conflictEditor.discardAndApply', { side: confirmSideLabel })}
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
  useTheme(repoPath)
  useMonacoTheme()

  return (
    <QueryClientProvider client={queryClient}>
      <ConflictMergeWindowContent repoPath={repoPath} filePath={filePath} />
    </QueryClientProvider>
  )
}
