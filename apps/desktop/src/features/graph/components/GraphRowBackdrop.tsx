import { cn } from '@git-manager/ui'
import { useTranslation } from '@git-manager/i18n'
import type { BisectRowStatus } from '../lib/bisectStatus'
import { BISECT_ROW_STYLES } from '../lib/bisectRow.config'
import { BAND_ALPHA_HEX, BAND_ALPHA_SELECTED_HEX } from '../lib/graphLayout'

interface GraphRowBackdropProps {
  /** The lane's colour — the band's tint and its right border both come from it. */
  color: string
  /** Where the coloured band starts and ends, in row coordinates (see {@link GraphRow}). */
  startX: number
  endX: number
  /** True when the marker was pulled into the overflow zone: its band would sit entirely under the
   *  fade, so the tint is dropped — unless the row is active, whose tint stays visible regardless. */
  isOverflowed: boolean
  isActive: boolean
  isPrimary: boolean
  isConflictRow: boolean
  /** Bisect annotation for this commit, shown as a left-edge stripe over a tinted row. */
  bisectStatus?: BisectRowStatus
}

/**
 * Every layer painted *behind* a graph row: the bisect tint and stripe, the lane's coloured band,
 * the selection and hover fills, and the conflict row's red.
 *
 * They are grouped because they are the same kind of thing — absolutely positioned, all
 * `pointer-events-none`, all keyed off the same two x coordinates — and because none of them has
 * anything to do with what the row's cells contain. Reading the row's structure meant scrolling
 * past seventy lines of them first.
 */
export function GraphRowBackdrop({
  color,
  startX,
  endX,
  isOverflowed,
  isActive,
  isPrimary,
  isConflictRow,
  bisectStatus,
}: GraphRowBackdropProps) {
  const { t } = useTranslation('git')

  return (
    <>
      {bisectStatus && (
        <>
          <span
            aria-hidden
            className={cn(
              'pointer-events-none absolute inset-0',
              BISECT_ROW_STYLES[bisectStatus].rowBg
            )}
          />
          <span
            data-testid="bisect-row-marker"
            aria-label={t(BISECT_ROW_STYLES[bisectStatus].labelKey)}
            className={cn(
              'pointer-events-none absolute inset-y-0 left-0 z-graph-row-hover w-[3px] rounded-r',
              BISECT_ROW_STYLES[bisectStatus].stripe
            )}
          />
        </>
      )}

      {/* Background colored band starting from the avatar to the right boundary of the graph column, with border-right */}
      <div
        data-testid="graph-row-band"
        className="pointer-events-none absolute inset-y-0 border-r-[3px] transition-colors"
        style={{
          left: startX,
          width: Math.max(0, endX - startX),
          backgroundColor:
            isOverflowed && !isActive
              ? 'transparent'
              : `${color}${isActive ? BAND_ALPHA_SELECTED_HEX : BAND_ALPHA_HEX}`,
          borderRightColor: color,
        }}
      />

      {/* Selection background starting from the end of the graph column to the right end of the row.
          A light tint of the theme's primary (purple in the default theme) reads more clearly as a
          selection than the neutral accent, while staying theme-aware and contrast-safe. */}
      {isActive && (
        <div
          className={cn(
            'pointer-events-none absolute inset-y-0 transition-colors',
            isPrimary ? 'bg-primary/20' : 'bg-primary/10'
          )}
          style={{ left: endX, right: 0 }}
        />
      )}

      {/* Hover background starting from the end of the graph column to the right end of the row */}
      <div
        className="pointer-events-none absolute inset-y-0 bg-accent/50 opacity-0 transition-opacity group-hover:opacity-100"
        style={{ left: endX, right: 0 }}
      />

      {/* Conflict background starting from the end of the graph column to the right end of the row */}
      {isConflictRow && (
        <div
          className="pointer-events-none absolute inset-y-0"
          style={{ left: endX, right: 0, backgroundColor: '#904538' }}
        />
      )}
    </>
  )
}
