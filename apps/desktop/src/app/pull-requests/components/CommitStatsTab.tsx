import { GitCommit, Activity, TrendingUp, Star, BarChart2 } from 'lucide-react'
import { Skeleton } from '@git-manager/ui'
import type { DayCommit } from '../types'
import { KpiCard } from './KpiCard'
import { YearHeatmap } from './YearHeatmap'

interface CommitStatsTabProps {
  commitDays: DayCommit[]
  yearDays: DayCommit[]
  loading: boolean
}

export function CommitStatsTab({ commitDays, yearDays, loading }: CommitStatsTabProps) {
  const max14 = Math.max(...commitDays.map((d) => d.commits), 1)
  const total14 = commitDays.reduce((s, d) => s + d.commits, 0)
  const avg14 = commitDays.length ? (total14 / commitDays.length).toFixed(1) : '0'
  const totalYear = yearDays.reduce((s, d) => s + d.commits, 0)
  const streak = (() => {
    let s = 0
    for (let i = yearDays.length - 1; i >= 0; i--) {
      if (yearDays[i].commits > 0) s++
      else break
    }
    return s
  })()

  function fmtDate(ds: string): string {
    return new Date(ds + 'T00:00:00').toLocaleDateString('en', { month: 'short', day: 'numeric' })
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex-1 space-y-5 overflow-y-auto p-5">
        <div className="grid grid-cols-4 gap-3">
          <KpiCard
            icon={<GitCommit className="h-3.5 w-3.5" />}
            label="Total commits"
            value={totalYear}
            sub="Last 365 days"
            loading={loading}
          />
          <KpiCard
            icon={<Activity className="h-3.5 w-3.5" />}
            label="Daily avg (14d)"
            value={avg14}
            sub="Commits / day"
            loading={loading}
          />
          <KpiCard
            icon={<TrendingUp className="h-3.5 w-3.5" />}
            label="Last 14 days"
            value={total14}
            sub="Push events"
            loading={loading}
          />
          <KpiCard
            icon={<Star className="h-3.5 w-3.5" />}
            label="Current streak"
            value={`${streak}d`}
            sub="Consecutive days"
            loading={loading}
          />
        </div>
        <div className="rounded-xl border border-border bg-card/50 p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">Contribution activity</h3>
            </div>
            {loading ? (
              <Skeleton className="h-3 w-32 rounded bg-muted/40" />
            ) : (
              <span className="text-[10px] text-muted-foreground">
                {totalYear} contributions in the last year
              </span>
            )}
          </div>
          <div className="heatmap-container relative overflow-x-auto pb-1">
            {loading ? (
              <Skeleton className="flex h-[100px] w-full items-center justify-center rounded-lg bg-muted/20 text-[10px] text-muted-foreground/40">
                Loading contribution map...
              </Skeleton>
            ) : (
              <YearHeatmap yearDays={yearDays} />
            )}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card/50 p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart2 className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">Last 14 days — daily activity</h3>
            </div>
          </div>
          {loading ? (
            <Skeleton className="h-24 w-full rounded-lg bg-muted/20" />
          ) : (
            <>
              <div className="flex items-end gap-1" style={{ height: 100 }}>
                {commitDays.map((day, i) => {
                  const pct = max14 > 0 ? (day.commits / max14) * 100 : 0
                  return (
                    <div key={i} className="group/bar flex flex-1 flex-col items-center gap-1">
                      <div
                        className="relative flex w-full items-end justify-center"
                        style={{ height: 80 }}
                      >
                        {day.commits > 0 ? (
                          <div
                            className="relative w-full rounded-t bg-primary/70 transition-all duration-200 group-hover/bar:bg-primary"
                            style={{ height: `${Math.max(pct, 4)}%` }}
                          >
                            <div className="absolute -top-5 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded border border-border bg-popover px-1 py-px text-[9px] text-foreground shadow group-hover/bar:block">
                              {day.commits}
                            </div>
                          </div>
                        ) : (
                          <div className="w-full rounded-t bg-muted/30" style={{ height: '4%' }} />
                        )}
                      </div>
                      <span className="text-[8px] text-muted-foreground/50">
                        {fmtDate(day.date).split(' ')[1]}
                      </span>
                    </div>
                  )
                })}
              </div>
              <div className="mt-1 flex justify-between">
                {commitDays.length > 0 && (
                  <>
                    <span className="text-[8px] text-muted-foreground/40">
                      {fmtDate(commitDays[0].date)}
                    </span>
                    <span className="text-[8px] text-muted-foreground/40">
                      {fmtDate(commitDays[commitDays.length - 1].date)}
                    </span>
                  </>
                )}
              </div>
            </>
          )}
        </div>
        <div className="overflow-hidden rounded-xl border border-border bg-card/50">
          <div className="flex items-center gap-2 border-b border-border bg-muted/10 px-4 py-3">
            <GitCommit className="h-3.5 w-3.5 text-primary/60" />
            <h3 className="text-xs font-semibold">Daily breakdown — last 14 days</h3>
          </div>
          {loading ? (
            <div className="space-y-3 p-4">
              <Skeleton className="h-3 w-full rounded bg-muted/40" />
              <Skeleton className="h-3 w-5/6 rounded bg-muted/40" />
              <Skeleton className="h-3 w-4/5 rounded bg-muted/40" />
            </div>
          ) : (
            <div className="divide-y divide-border/30">
              {[...commitDays].reverse().map((day, i) => (
                <div
                  key={i}
                  className="flex items-center gap-4 px-4 py-2.5 transition-colors hover:bg-accent/20"
                >
                  <span className="w-20 shrink-0 text-xs text-muted-foreground">
                    {fmtDate(day.date)}
                  </span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted/20">
                    <div
                      className="h-full rounded-full bg-primary/70 transition-all duration-500"
                      style={{ width: max14 > 0 ? `${(day.commits / max14) * 100}%` : '0%' }}
                    />
                  </div>
                  <span className="w-8 shrink-0 text-right font-mono text-xs text-foreground">
                    {day.commits}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
