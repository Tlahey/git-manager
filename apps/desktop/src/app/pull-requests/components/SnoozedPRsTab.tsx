import { BellOff } from 'lucide-react'
import { useTranslation } from '@git-manager/i18n'
import { TableHeader } from './ListHelpers'
import { PRRowSkeleton } from './RowSkeletons'
import { PRRow } from './PRRow'
import { useLaunchpadStore } from '../../../stores/launchpad.store'
import { timeUntil } from '../utils'
import type { MockPR } from '../types'

interface SnoozedPRsTabProps {
  snoozedPRs: MockPR[]
  pinnedIds: Set<string>
  onTogglePin: (id: string) => void
  loading: boolean
}

/** The Snoozed tab: PRs hidden from the other lists until their wake time (or an explicit unsnooze).
 * Each row shows how long it stays snoozed and an inline control to bring it back now. */
export function SnoozedPRsTab({ snoozedPRs, pinnedIds, onTogglePin, loading }: SnoozedPRsTabProps) {
  const { t } = useTranslation('launchpad')
  const snoozed = useLaunchpadStore((s) => s.snoozed)
  const unsnoozePr = useLaunchpadStore((s) => s.unsnoozePr)

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <TableHeader />
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <>
            <PRRowSkeleton />
            <PRRowSkeleton />
          </>
        ) : snoozedPRs.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/10 bg-primary/5">
              <BellOff className="h-6 w-6 text-primary" />
            </div>
            <h3 className="mb-1 text-sm font-semibold text-foreground">{t('snooze.emptyTitle')}</h3>
            <p className="max-w-[280px] text-xs text-muted-foreground">{t('snooze.emptyDesc')}</p>
          </div>
        ) : (
          snoozedPRs.map((pr) => {
            const until = snoozed[pr.id] ?? null
            const remaining = timeUntil(until)
            return (
              <div key={pr.id} className="group/snoozed relative">
                <PRRow pr={pr} pinned={pinnedIds.has(pr.id)} onTogglePin={onTogglePin} />
                <div className="absolute right-[150px] top-1/2 flex -translate-y-1/2 items-center gap-1.5">
                  <span
                    className="rounded border border-border/50 bg-muted/60 px-1.5 py-px text-[10px] text-muted-foreground"
                    data-testid={`snoozed-until-${pr.id}`}
                  >
                    {remaining
                      ? t('snooze.snoozedFor', { time: remaining })
                      : t('snooze.snoozedIndefinitely')}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      unsnoozePr(pr.id)
                    }}
                    className="flex h-6 items-center gap-1 rounded-md border border-border bg-card/85 px-1.5 text-[10px] text-muted-foreground opacity-0 shadow-sm backdrop-blur-sm transition-all duration-150 hover:text-foreground group-hover/snoozed:opacity-100"
                    title={t('snooze.unsnooze')}
                  >
                    <BellOff className="h-3 w-3" /> {t('snooze.unsnooze')}
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
