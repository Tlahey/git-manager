import { useState, useRef } from 'react'
import { AlarmClock, BellOff, Clock } from 'lucide-react'
import { useTranslation } from '@git-manager/i18n'
import { useLaunchpadStore } from '../../../stores/launchpad.store'
import { isSnoozed, snoozeUntil, timeUntil, type SnoozeDuration } from '../utils'

const PRESETS: SnoozeDuration[] = ['hour', 'tomorrow', 'nextWeek', 'indefinitely']

interface SnoozeControlProps {
  prId: string
}

/**
 * The snooze icon that lives on a PR row's left edge (next to the pin). Hovering it (or clicking)
 * opens a small menu: the four snooze durations when the PR is awake, or the wake time + Unsnooze
 * when it is already snoozed. A short close delay lets the pointer travel from the icon to the menu
 * without it collapsing.
 */
export function SnoozeControl({ prId }: SnoozeControlProps) {
  const { t } = useTranslation('launchpad')
  const snoozed = useLaunchpadStore((s) => s.snoozed)
  const snoozePr = useLaunchpadStore((s) => s.snoozePr)
  const unsnoozePr = useLaunchpadStore((s) => s.unsnoozePr)

  const [open, setOpen] = useState(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const active = isSnoozed(prId, snoozed)
  const remaining = active ? timeUntil(snoozed[prId] ?? null) : null

  const openMenu = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    setOpen(true)
  }
  const scheduleClose = () => {
    closeTimer.current = setTimeout(() => setOpen(false), 120)
  }

  const menuItem =
    'flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-accent'

  return (
    <div
      className={`relative transition-opacity ${active ? '' : 'opacity-0 group-hover/pr:opacity-100'}`}
      onMouseEnter={openMenu}
      onMouseLeave={scheduleClose}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={active ? t('snooze.unsnooze') : t('snooze.snooze')}
        aria-label={active ? t('snooze.unsnooze') : t('snooze.snooze')}
        data-testid={`snooze-trigger-${prId}`}
        className={`shrink-0 transition-colors ${
          active ? 'text-amber-400' : 'text-muted-foreground/30 hover:text-amber-400'
        }`}
      >
        {active ? <BellOff className="h-3 w-3" /> : <AlarmClock className="h-3 w-3" />}
      </button>
      {open && (
        <div
          className="absolute left-0 top-full z-popover mt-1 w-44 overflow-hidden rounded-lg border border-border bg-popover py-1 shadow-xl"
          onMouseEnter={openMenu}
          onMouseLeave={scheduleClose}
          data-testid={`snooze-menu-${prId}`}
        >
          {active ? (
            <>
              {remaining && (
                <div className="px-3 py-1 text-[10px] text-muted-foreground/60">
                  {t('snooze.snoozedFor', { time: remaining })}
                </div>
              )}
              <button
                type="button"
                className={menuItem}
                onClick={() => {
                  unsnoozePr(prId)
                  setOpen(false)
                }}
              >
                <BellOff className="h-3 w-3 shrink-0 text-muted-foreground" />
                <span>{t('snooze.unsnooze')}</span>
              </button>
            </>
          ) : (
            PRESETS.map((d) => (
              <button
                key={d}
                type="button"
                className={menuItem}
                onClick={() => {
                  snoozePr(prId, snoozeUntil(d))
                  setOpen(false)
                }}
              >
                <Clock className="h-3 w-3 shrink-0 text-muted-foreground" />
                <span>{t(`snooze.${d}`)}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
