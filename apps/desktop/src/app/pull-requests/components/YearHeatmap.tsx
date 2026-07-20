import { useImperativeTooltip } from '@git-manager/ui'
import { useTranslation } from '@git-manager/i18n'
import type { DayCommit } from '../types'

function heatColor(count: number, max: number): string {
  if (count === 0) return 'bg-muted/40'
  const r = count / max
  if (r < 0.15) return 'bg-green-900/60'
  if (r < 0.35) return 'bg-green-700/70'
  if (r < 0.6) return 'bg-green-600/80'
  if (r < 0.8) return 'bg-green-500/90'
  return 'bg-green-400'
}

interface YearHeatmapProps {
  yearDays: DayCommit[]
}

export function YearHeatmap({ yearDays }: YearHeatmapProps) {
  const { t, i18n } = useTranslation('launchpad')
  const lang = i18n.language
  const daysLabels = ['', t('heatmap.mon'), '', t('heatmap.wed'), '', t('heatmap.fri'), '']
  const max = Math.max(...yearDays.map((d) => d.commits), 1)
  const firstDay = yearDays[0] ? new Date(yearDays[0].date + 'T00:00:00') : new Date()
  const startDow = (firstDay.getDay() + 6) % 7
  const padded: (DayCommit | null)[] = [...Array(startDow).fill(null), ...yearDays]
  const weeks: (DayCommit | null)[][] = []
  for (let i = 0; i < padded.length; i += 7) weeks.push(padded.slice(i, i + 7))
  const monthLabels: { week: number; label: string }[] = []
  let lastMonth = -1
  weeks.forEach((week, wi) => {
    const first = week.find((c) => c !== null)
    if (!first) return
    const monthDate = new Date(first.date + 'T00:00:00')
    const m = monthDate.getMonth()
    if (m !== lastMonth) {
      monthLabels.push({
        week: wi,
        label: monthDate.toLocaleDateString(lang, { month: 'short' }),
      })
      lastMonth = m
    }
  })

  // Portal-based tooltip — never clipped by parent overflow
  const { show: showTip, hide: hideTip, portal: tooltipPortal } = useImperativeTooltip()

  return (
    <div className="relative select-none">
      {/* Month labels row */}
      <div className="flex gap-0.5" style={{ paddingLeft: 28 }}>
        {weeks.map((_, wi) => {
          const lbl = monthLabels.find((m) => m.week === wi)
          return (
            <div
              key={wi}
              style={{ width: 11, fontSize: 9, flexShrink: 0, color: 'var(--muted-foreground)' }}
            >
              {lbl ? lbl.label : ''}
            </div>
          )
        })}
      </div>

      <div className="flex">
        {/* Day-of-week labels */}
        <div className="mr-1 flex flex-col gap-0.5" style={{ width: 24 }}>
          {daysLabels.map((d, i) => (
            <div
              key={i}
              style={{
                height: 11,
                fontSize: 8,
                lineHeight: '11px',
                color: 'var(--muted-foreground)',
                textAlign: 'right',
                paddingRight: 2,
              }}
            >
              {d}
            </div>
          ))}
        </div>

        {/* Grid cells */}
        <div className="flex gap-0.5">
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-0.5">
              {Array.from({ length: 7 }).map((_, di) => {
                const cell = week[di] ?? null
                if (!cell) {
                  return (
                    <div
                      key={di}
                      style={{ width: 11, height: 11 }}
                      className="rounded-sm bg-transparent"
                    />
                  )
                }
                const fmtDate = new Date(cell.date + 'T00:00:00').toLocaleDateString(lang, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })
                const label = t('heatmap.contributions', { count: cell.commits, date: fmtDate })
                return (
                  <div
                    key={di}
                    style={{ width: 11, height: 11 }}
                    className={`cursor-pointer rounded-sm transition-opacity hover:opacity-80 ${heatColor(
                      cell.commits,
                      max
                    )}`}
                    onMouseEnter={(e) => showTip(label, e.currentTarget as HTMLElement)}
                    onMouseLeave={hideTip}
                  />
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Tooltip portal */}
      {tooltipPortal}

      {/* Legend */}
      <div className="mt-2 flex items-center justify-end gap-1">
        <span className="text-[9px] text-muted-foreground">{t('heatmap.less')}</span>
        {[
          'bg-muted/40',
          'bg-green-900/60',
          'bg-green-700/70',
          'bg-green-600/80',
          'bg-green-500/90',
          'bg-green-400',
        ].map((c, i) => (
          <div key={i} style={{ width: 11, height: 11 }} className={`rounded-sm ${c}`} />
        ))}
        <span className="text-[9px] text-muted-foreground">{t('heatmap.more')}</span>
      </div>
    </div>
  )
}
