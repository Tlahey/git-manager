import { useMemo, useRef, useState } from 'react'
import { ChevronLeft, Wand2, Check } from 'lucide-react'
import { Button, Spinner } from '@git-manager/ui'
import { useTranslation } from '@git-manager/i18n'
import { useMergeView } from '../../hooks/useMergeView'
import { apiResolveConflict, apiResolveConflictBinary } from '../../api/conflict.api'
import {
  ThreeWayMergeEditor,
  type ThreeWayMergeEditorRef,
} from '../merge-editor/ThreeWayMergeEditor'

interface ConflictDiffViewProps {
  repoPath: string
  filePath: string
  onClose: () => void
  /** Called after the file is successfully resolved (staged) or a coarse binary/delete side is kept. */
  onResolved: () => void
}

/**
 * Lightweight sibling to `DiffViewCenter`, purpose-built for conflict resolution instead of
 * working-tree diffs — kept separate rather than bolting conflict-mode branches onto
 * `DiffViewCenter`/`DiffToolbar`, which are already tightly coupled to stage/unstage/discard
 * and blame/history semantics that don't apply here. Toolbar/content styling deliberately
 * mirrors `DiffToolbar`/`DiffViewCenter` (same back-button, path-split, and bordered diff
 * container treatment) so the two feel like the same feature. Content is the 3-pane
 * `ThreeWayMergeEditor` — this component just owns the outer toolbar/back-button shell and
 * the binary/delete/rename coarse fallback.
 */
export function ConflictDiffView({
  repoPath,
  filePath,
  onClose,
  onResolved,
}: ConflictDiffViewProps) {
  const { t } = useTranslation('git')
  const mergeEditorRef = useRef<ThreeWayMergeEditorRef>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isAutoMerging, setIsAutoMerging] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const [error, setError] = useState<string | null>(null)

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
      onResolved()
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

  async function handleMarkResolved() {
    setIsSaving(true)
    setError(null)
    try {
      const content = mergeEditorRef.current?.getCenterValue() ?? ''
      await apiResolveConflict(repoPath, filePath, content)
      onResolved()
    } catch (err) {
      setError(String(err))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="animate-in fade-in zoom-in-95 flex h-full w-full select-none flex-col overflow-hidden bg-background duration-100">
      {/* TOOLBAR — mirrors DiffToolbar's back-button + path-split layout */}
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-card px-4 py-3 shadow-sm">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 hover:bg-accent"
            onClick={onClose}
            title="Back to graph"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>

          <div className="flex min-w-0 flex-col">
            {parsedPath.dir && (
              <span className="mb-0.5 select-none truncate font-mono text-[10px] leading-none text-muted-foreground/60">
                {parsedPath.dir}
              </span>
            )}
            <span className="select-all truncate font-mono text-xs leading-tight text-foreground">
              {parsedPath.name}
            </span>
          </div>
        </div>

        {view?.renderable && (
          <div className="flex shrink-0 items-center gap-2">
            {error && <span className="text-xs text-destructive">{error}</span>}
            <span className="text-[10px] font-medium text-muted-foreground">
              {t('conflictEditor.conflictsRemaining', { count: pendingCount })}
            </span>

            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1 px-2.5 text-[10px] font-bold"
              onClick={handleApplyNonConflicting}
              disabled={isAutoMerging || isSaving}
              title={t('conflictEditor.applyNonConflicting')}
            >
              {isAutoMerging ? (
                <Spinner className="h-3.5 w-3.5" />
              ) : (
                <Wand2 className="h-3.5 w-3.5" />
              )}
              {t('conflictEditor.applyNonConflicting')}
            </Button>
            <Button
              size="sm"
              className="h-7 gap-1 px-2.5 text-[10px] font-bold"
              onClick={handleMarkResolved}
              disabled={isSaving || pendingCount > 0}
            >
              {isSaving ? <Spinner className="h-3 w-3" /> : <Check className="h-3.5 w-3.5" />}
              {t('conflictEditor.markResolved')}
            </Button>
          </div>
        )}
      </div>

      {/* CONTENT AREA — mirrors DiffViewCenter's bg-card/45 wrapper + bordered diff container */}
      <div className="flex flex-1 select-text flex-col overflow-hidden bg-card/45 font-mono text-xs">
        {isLoading && (
          <div className="flex h-40 w-full items-center justify-center text-muted-foreground">
            <Spinner className="mr-2 h-5 w-5" />
            {t('common:status.loading')}
          </div>
        )}

        {!isLoading &&
          view &&
          (view.isBinary || view.conflictKind === 'delete' || view.conflictKind === 'rename') && (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-sm">
              <p className="text-foreground">
                {view.isBinary
                  ? t('conflictEditor.binaryConflict')
                  : t('conflictEditor.deleteConflict')}
              </p>
              {error && <p className="text-xs text-destructive">{error}</p>}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => handleKeepSide('ours')}
                  disabled={isSaving}
                >
                  {t('conflictEditor.keepOurs')}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleKeepSide('theirs')}
                  disabled={isSaving}
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
            <div className="flex flex-1 flex-col overflow-hidden rounded-lg border border-border/80 bg-background">
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
    </div>
  )
}
