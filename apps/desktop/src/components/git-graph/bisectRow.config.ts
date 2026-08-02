import type { BisectRowStatus } from './bisectStatus'

/** How one bisect status paints its graph row. */
export interface BisectRowStyle {
  /** Left-stripe color. */
  stripe: string
  /** Full-row background tint, so a marked commit reads at a glance. */
  rowBg: string
  /** i18n key (git namespace) used as the stripe's accessible label. */
  labelKey: string
}

/**
 * The three things a bisect status decides about its row, in one table. They used to be three
 * parallel `Record<BisectRowStatus, string>` maps in `GraphRow.tsx`, which meant adding a status
 * was three edits in three places and a missed one only showed up on screen — keyed together, the
 * type makes an incomplete status a compile error instead. Declarative counterpart to
 * `columns.config.ts`, per the CLAUDE.md "Frontend organization rules" entry on this pattern.
 */
export const BISECT_ROW_STYLES: Record<BisectRowStatus, BisectRowStyle> = {
  firstBad: {
    stripe: 'bg-red-600',
    rowBg: 'bg-red-500/15',
    labelKey: 'bisect.status.firstBad',
  },
  current: {
    stripe: 'bg-amber-500',
    rowBg: 'bg-amber-500/15',
    labelKey: 'bisect.status.current',
  },
  bad: {
    stripe: 'bg-red-500',
    rowBg: 'bg-red-500/10',
    labelKey: 'bisect.status.bad',
  },
  good: {
    stripe: 'bg-green-500',
    rowBg: 'bg-green-500/10',
    labelKey: 'bisect.status.good',
  },
  skip: {
    stripe: 'bg-muted-foreground',
    rowBg: 'bg-muted-foreground/10',
    labelKey: 'bisect.status.skip',
  },
}
