import useSWR from 'swr'
import { useTranslation } from '@git-manager/i18n'
import { Button } from '@git-manager/ui'
import { Bug, CircleX, CircleCheck, ArrowRight, AlertTriangle } from 'lucide-react'
import { useBisectUIStore, type BisectSlot } from '../../stores/bisectUI.store'
import { useBisectActions } from '../../hooks/useBisectActions'
import { apiBisectCheckRange } from '../../api/git.api'

interface BisectSetupBannerProps {
  repoPath: string
}

interface SlotButtonProps {
  kind: BisectSlot
  oid: string | null
  active: boolean
  label: string
  placeholder: string
  onClick: () => void
}

/** One of the two commit slots — reflects its chosen commit and highlights when it's the target. */
function SlotButton({ kind, oid, active, label, placeholder, onClick }: SlotButtonProps) {
  const isBad = kind === 'bad'
  const Icon = isBad ? CircleX : CircleCheck
  const tint = isBad
    ? 'bg-red-500/10 text-red-600 dark:text-red-400'
    : 'bg-green-500/10 text-green-600 dark:text-green-400'
  const ring = active
    ? isBad
      ? 'ring-2 ring-red-500/60'
      : 'ring-2 ring-green-500/60'
    : 'ring-1 ring-border'
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`bisect-slot-${kind}`}
      className={`flex min-w-[128px] items-center gap-2 rounded-full px-3 py-1.5 text-left transition-shadow ${tint} ${ring}`}
    >
      <Icon className={`h-4 w-4 shrink-0 ${isBad ? 'text-red-500' : 'text-green-500'}`} />
      <span className="min-w-0">
        <span className="block text-[10px] font-medium uppercase leading-none tracking-wide opacity-70">
          {label}
        </span>
        <span className="block truncate font-mono text-xs leading-tight">
          {oid ? oid.slice(0, 7) : <span className="opacity-60">{placeholder}</span>}
        </span>
      </span>
    </button>
  )
}

/**
 * Floating setup card (styled after the Chronologie bar) for starting a bisect by picking commits
 * in the graph. Shows the bad and good slots side by side; either can be (re-)focused and picked.
 * The worktree is already clean by this point (any dirty changes were stashed up front, before this
 * card appears — see the tools-menu → stash dialog flow), so validate just checks the orientation
 * (good must be an ancestor of bad) and starts. Cancelling restores an up-front stash if there was
 * one. Picking happens in the graph — see GitGraph's row-select interception.
 */
export function BisectSetupBanner({ repoPath }: BisectSetupBannerProps) {
  const { t } = useTranslation('git')
  const setupActive = useBisectUIStore((s) => s.setupActive)
  const activeSlot = useBisectUIStore((s) => s.activeSlot)
  const pendingBadOid = useBisectUIStore((s) => s.pendingBadOid)
  const pendingGoodOid = useBisectUIStore((s) => s.pendingGoodOid)
  const autoStashed = useBisectUIStore((s) => s.autoStashed)
  const setActiveSlot = useBisectUIStore((s) => s.setActiveSlot)
  const cancelSetup = useBisectUIStore((s) => s.cancelSetup)
  const { start, restoreStash, pending } = useBisectActions(repoPath)

  const bothPicked = !!pendingBadOid && !!pendingGoodOid

  // Validate the orientation (good must be an ancestor of bad) once both commits are chosen.
  const { data: rangeValid, isLoading: checkingRange } = useSWR(
    setupActive && bothPicked ? ['bisect-range', repoPath, pendingBadOid, pendingGoodOid] : null,
    () => apiBisectCheckRange(repoPath, pendingBadOid as string, pendingGoodOid as string)
  )

  if (!setupActive) return null

  const invalidRange = bothPicked && rangeValid === false
  const canValidate = bothPicked && rangeValid === true && !pending && !checkingRange

  const hint = invalidRange
    ? null
    : !bothPicked
      ? activeSlot === 'bad'
        ? t('bisect.setup.pickBadHint')
        : t('bisect.setup.pickGoodHint')
      : t('bisect.setup.readyHint')

  async function handleValidate() {
    if (!canValidate) return
    const ok = await start(pendingBadOid!, pendingGoodOid!)
    if (ok) cancelSetup()
  }

  // Abandoning the setup pops back any up-front stash before clearing state, so refusing to bisect
  // never leaves the user's changes stashed away.
  async function handleCancel() {
    if (autoStashed) await restoreStash()
    cancelSetup()
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-overlay flex justify-center">
      <div
        data-testid="bisect-setup-banner"
        className="pointer-events-auto flex flex-col items-center gap-1.5 rounded-2xl border border-border bg-card/95 px-3 py-2 shadow-[0_20px_52px_-10px_rgba(0,0,0,0.55)] backdrop-blur"
      >
        <div className="flex items-center gap-2.5">
          <Bug className="h-4 w-4 shrink-0 text-amber-500" />

          <SlotButton
            kind="bad"
            oid={pendingBadOid}
            active={activeSlot === 'bad'}
            label={t('bisect.setup.badSlot')}
            placeholder={t('bisect.setup.pickPlaceholder')}
            onClick={() => setActiveSlot('bad')}
          />
          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
          <SlotButton
            kind="good"
            oid={pendingGoodOid}
            active={activeSlot === 'good'}
            label={t('bisect.setup.goodSlot')}
            placeholder={t('bisect.setup.pickPlaceholder')}
            onClick={() => setActiveSlot('good')}
          />

          <div className="mx-1 h-6 w-px bg-border" />

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-full"
            onClick={handleCancel}
            data-testid="bisect-setup-cancel"
          >
            {t('bisect.setup.cancel')}
          </Button>
          <Button
            type="button"
            size="sm"
            className="rounded-full"
            disabled={!canValidate}
            onClick={handleValidate}
            data-testid="bisect-setup-validate"
          >
            {t('bisect.setup.validate')}
          </Button>
        </div>

        {invalidRange ? (
          <p
            className="flex items-center gap-1.5 text-center text-[11px] text-destructive"
            data-testid="bisect-setup-invalid-range"
          >
            <AlertTriangle className="h-3 w-3 shrink-0" />
            {t('bisect.setup.invalidRange')}
          </p>
        ) : (
          <p className="min-h-4 text-center text-[11px] text-muted-foreground">{hint}</p>
        )}
      </div>
    </div>
  )
}
