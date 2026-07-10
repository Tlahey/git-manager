import { useMemo, useRef, useState } from 'react'
import { useQuery, QueryClientProvider } from '@tanstack/react-query'
import { useTranslation } from '@git-manager/i18n'
import { createPortal } from 'react-dom'
import { ChevronDown, Pencil, Combine, Trash2, Undo2 } from 'lucide-react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { emit } from '@tauri-apps/api/event'
import { Button, Spinner, Textarea, cn, type BadgeProps } from '@git-manager/ui'
import { useAnchoredMenu, useHorizontalResize, StepRailRow, type StepRailVariant } from '@git-manager/components'
import { apiListRebaseCommits, apiRunInteractiveRebase } from '../../api/git.api'
import { useTheme } from '../../hooks/useTheme'
import { useMonacoTheme } from '../../hooks/useMonacoTheme'
import { queryClient } from '../../lib/queryClient'
import {
  type RebasePlanStep,
  initPlan,
  moveStep,
  setAction,
  rewordStep,
  combineInto,
  validatePlan,
  toTodoSteps,
} from './rebasePlan'
import { RebaseCommitDetails } from './components/RebaseCommitDetails'

/** Badge color per rebase action — git-rebase-specific vocabulary, so it stays
 * app-side rather than living in the generic `StepRailRow` package component. */
const ACTION_BADGE_VARIANTS: Record<RebasePlanStep['action'], BadgeProps['variant']> = {
  pick: 'secondary',
  reword: 'warning',
  squash: 'success',
  fixup: 'success',
  drop: 'destructive',
}

function railVariantForAction(action: RebasePlanStep['action']): StepRailVariant {
  if (action === 'drop') return 'dropped'
  if (action === 'squash' || action === 'fixup') return 'combined'
  return 'normal'
}

interface RebasingCommitWindowProps {
  repoPath: string
  baseOid: string
}

/**
 * Dedicated "Rebasing Commit" window: the interactive-rebase editor. Left, the
 * ordered plan (target commit on top, newest — e.g. the fixup — at the bottom)
 * with drag-reorder, a mini graph rail, and Reword / Squash-Fixup / Drop
 * actions; right, the selected commit's changes and metadata. "Start Rebasing"
 * runs the plan via `run_interactive_rebase`.
 */
function RebasingCommitWindowContent({ repoPath, baseOid }: RebasingCommitWindowProps) {
  const { t } = useTranslation('git')

  const { data: commits, isLoading } = useQuery({
    queryKey: ['rebase-commits', repoPath, baseOid],
    queryFn: () => apiListRebaseCommits(repoPath, baseOid),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  })

  const [steps, setSteps] = useState<RebasePlanStep[] | null>(null)
  const plan = useMemo(() => steps ?? (commits ? initPlan(commits) : []), [steps, commits])

  const [selected, setSelected] = useState<string[]>([])
  const [rewordingOid, setRewordingOid] = useState<string | null>(null)
  const [rewordDraft, setRewordDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const dragFrom = useRef<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)

  const { width: detailsWidth, resizeProps } = useHorizontalResize(420)
  const squashMenu = useAnchoredMenu({ align: 'left' })

  const selectedSteps = plan.filter((s) => selected.includes(s.commit.oid))
  const focusedStep = selectedSteps.length > 0 ? selectedSteps[selectedSteps.length - 1] : null
  const planError = validatePlan(plan)

  function handleRowClick(index: number, e: React.MouseEvent) {
    const oid = plan[index].commit.oid
    if (e.metaKey || e.ctrlKey) {
      setSelected((prev) => (prev.includes(oid) ? prev.filter((o) => o !== oid) : [...prev, oid]))
    } else {
      setSelected([oid])
    }
  }

  function handleDrop() {
    if (dragFrom.current !== null && dragOver !== null) {
      setSteps(moveStep(plan, dragFrom.current, dragOver))
    }
    dragFrom.current = null
    setDragOver(null)
  }

  function handleReword() {
    if (!focusedStep) return
    setRewordingOid(focusedStep.commit.oid)
    setRewordDraft(focusedStep.message ?? focusedStep.commit.message)
  }

  function handleRewordSave() {
    if (!rewordingOid || !rewordDraft.trim()) return
    setSteps(rewordStep(plan, rewordingOid, rewordDraft))
    setRewordingOid(null)
  }

  function handleCombine(mode: 'squash' | 'fixup') {
    squashMenu.setOpen(false)
    if (selected.length < 2) return
    // The oldest selected row (lowest index) is the combine target.
    const ordered = plan.filter((s) => selected.includes(s.commit.oid)).map((s) => s.commit.oid)
    const [target, ...others] = ordered
    setSteps(combineInto(plan, target, others, mode))
    setSelected([target])
  }

  function handleDropToggle() {
    if (selectedSteps.length === 0) return
    const allDropped = selectedSteps.every((s) => s.action === 'drop')
    setSteps(setAction(plan, selected, allDropped ? 'pick' : 'drop'))
  }

  async function handleCancel() {
    await getCurrentWindow().close()
  }

  async function handleStartRebasing() {
    if (planError) return
    setBusy(true)
    setError(null)
    try {
      await apiRunInteractiveRebase(repoPath, baseOid, toTodoSteps(plan))
      await emit('fixup-committed', { repoPath })
      await getCurrentWindow().close()
    } catch (err) {
      setError(String(err))
      setBusy(false)
    }
  }

  const allSelectedDropped = selectedSteps.length > 0 && selectedSteps.every((s) => s.action === 'drop')

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-background select-none animate-fadeIn">
      {/* Header: plan actions */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-card px-4 py-2.5 shadow-sm">
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1 px-2.5 text-[10px] font-bold"
          disabled={selectedSteps.length !== 1 || busy}
          onClick={handleReword}
          data-testid="rebase-reword"
        >
          <Pencil className="h-3.5 w-3.5" />
          {t('rebaseEditor.reword')}
        </Button>

        <div ref={squashMenu.containerRef}>
          <Button
            ref={squashMenu.triggerRef}
            variant="outline"
            size="sm"
            className="h-7 gap-1 px-2.5 text-[10px] font-bold"
            disabled={selectedSteps.length < 2 || busy}
            onClick={() => squashMenu.setOpen((v) => !v)}
            data-testid="rebase-squash"
          >
            <Combine className="h-3.5 w-3.5" />
            {t('rebaseEditor.squash')}
            <ChevronDown className="h-3 w-3" />
          </Button>
          {squashMenu.open &&
            createPortal(
              <div
                ref={squashMenu.menuRef}
                style={{ position: 'fixed', top: squashMenu.pos.top, bottom: squashMenu.pos.bottom, left: squashMenu.pos.left }}
                className="z-50 min-w-[220px] rounded-md border border-border bg-popover py-1 text-popover-foreground shadow-lg"
              >
                <button
                  type="button"
                  className="flex w-full items-center px-3 py-1.5 text-left text-xs hover:bg-accent"
                  onClick={() => handleCombine('squash')}
                >
                  {t('rebaseEditor.squashKeepMessages')}
                </button>
                <button
                  type="button"
                  className="flex w-full items-center px-3 py-1.5 text-left text-xs hover:bg-accent"
                  onClick={() => handleCombine('fixup')}
                >
                  {t('rebaseEditor.fixupDiscardMessage')}
                </button>
              </div>,
              document.body,
            )}
        </div>

        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1 px-2.5 text-[10px] font-bold"
          disabled={selectedSteps.length === 0 || busy}
          onClick={handleDropToggle}
          data-testid="rebase-drop"
        >
          {allSelectedDropped ? <Undo2 className="h-3.5 w-3.5" /> : <Trash2 className="h-3.5 w-3.5" />}
          {allSelectedDropped ? t('rebaseEditor.restore') : t('rebaseEditor.drop')}
        </Button>

        <span className="ml-auto text-[11px] text-muted-foreground">
          {t('rebaseEditor.commitCount', { count: plan.length })}
        </span>
      </div>

      {/* Body: plan list (left) + commit details (right) */}
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
          {isLoading ? (
            <div className="flex flex-1 items-center justify-center">
              <Spinner className="h-5 w-5" />
            </div>
          ) : (
            plan.map((step, index) => (
              <div key={step.commit.oid} className={cn(dragOver === index && 'border-t-2 border-primary')}>
                <StepRailRow
                  index={index}
                  isLast={index === plan.length - 1}
                  isSelected={selected.includes(step.commit.oid)}
                  variant={railVariantForAction(step.action)}
                  title={step.action === 'reword' && step.message ? step.message.split('\n')[0] : step.commit.subject}
                  subtitle={`${step.commit.author.name} · ${new Date(step.commit.author.timestamp * 1000).toLocaleDateString()}`}
                  badgeLabel={step.action}
                  badgeVariant={ACTION_BADGE_VARIANTS[step.action]}
                  trailingCaption={step.commit.shortOid}
                  testId={`rebase-step-${step.commit.shortOid}`}
                  onRowClick={handleRowClick}
                  onDragStart={(i) => (dragFrom.current = i)}
                  onDragOverRow={setDragOver}
                  onDrop={handleDrop}
                />
                {rewordingOid === step.commit.oid && (
                  <div className="space-y-2 border-b border-border bg-card/60 p-3">
                    <Textarea
                      autoFocus
                      value={rewordDraft}
                      onChange={(e) => setRewordDraft(e.target.value)}
                      rows={3}
                      className="resize-none font-mono text-xs"
                      data-testid="rebase-reword-input"
                    />
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => setRewordingOid(null)}>
                        {t('rebaseEditor.cancelEdit')}
                      </Button>
                      <Button size="sm" className="h-6 text-[10px]" onClick={handleRewordSave} disabled={!rewordDraft.trim()}>
                        {t('rebaseEditor.saveMessage')}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Resize handle + details */}
        <div
          {...resizeProps}
          className="w-1 shrink-0 cursor-col-resize border-x border-border/60 bg-card hover:bg-primary/30"
          data-testid="rebase-resize-details"
        />
        <div style={{ width: detailsWidth }} className="shrink-0 border-l border-border bg-card/30">
          {focusedStep ? (
            <RebaseCommitDetails key={focusedStep.commit.oid} repoPath={repoPath} commit={focusedStep.commit} />
          ) : (
            <div className="flex h-full items-center justify-center px-6 text-center text-xs text-muted-foreground">
              {t('rebaseEditor.selectHint')}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border bg-card px-4 py-3 shadow-md">
        {(error || planError) && (
          <span className="mr-auto truncate text-xs text-destructive">{error ?? t(planError!)}</span>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-[11px] font-semibold"
          onClick={handleCancel}
          disabled={busy}
          data-testid="rebase-cancel"
        >
          {t('rebaseEditor.cancel')}
        </Button>
        <Button
          variant="success"
          size="sm"
          className="h-8 px-4 text-[11px] font-semibold"
          onClick={handleStartRebasing}
          disabled={busy || isLoading || !!planError}
          data-testid="rebase-start"
        >
          {busy && <Spinner className="mr-1.5 h-3.5 w-3.5" />}
          {t('rebaseEditor.startRebasing')}
        </Button>
      </div>
    </div>
  )
}

export function RebasingCommitWindow(props: RebasingCommitWindowProps) {
  useTheme()
  useMonacoTheme()

  return (
    <QueryClientProvider client={queryClient}>
      <RebasingCommitWindowContent {...props} />
    </QueryClientProvider>
  )
}
