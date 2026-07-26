import type { DiffCoverage } from '@git-manager/ai'
import { useTranslation } from '@git-manager/i18n'

interface CoverageNoticeProps {
  /** What the last run read. `null` before anything has been generated — renders nothing. */
  coverage: DiffCoverage | null
  /** Prefix for the two `data-testid`s, so a panel's tests can target its own notice. */
  testIdPrefix: string
}

/**
 * One line saying how much of a change the model actually read, for any panel whose prompt carries a
 * budgeted diff.
 *
 * **Information, not a warning** — and that distinction is the whole design. It replaced an overflow
 * warning, which stopped being true once the diff budget started following the model's context
 * window: the prompt no longer overflows, it *shrinks*. "6 of 40 files read" is not a failure to
 * alarm someone about, it is a fact with an action attached (raise the window, read the rest), so it
 * is phrased and coloured as such — and stays silent entirely on the common case where everything
 * was read.
 *
 * The one genuinely broken state is kept apart and coloured as a warning: a declared window with no
 * room for a diff at all. Trimming cannot fix that one, only Settings can.
 *
 * Shared by the code review and the commit explanation rather than copied: both budget their diff
 * the same way, so a second copy would drift the moment one of the two learns something.
 */
export function CoverageNotice({ coverage, testIdPrefix }: CoverageNoticeProps) {
  const { t } = useTranslation('git')
  if (!coverage) return null

  return (
    <>
      {coverage.windowTooSmall && (
        <p
          data-testid={`${testIdPrefix}-window-too-small`}
          className="text-[10px] text-tone-danger"
        >
          {t('gitTree.explanation.windowTooSmall')}
        </p>
      )}
      {!coverage.complete && (
        <p data-testid={`${testIdPrefix}-coverage`} className="text-[10px] text-muted-foreground">
          {t('gitTree.explanation.coverage', {
            read: coverage.filesRead,
            total: coverage.filesTotal,
            window: Math.round(coverage.requiredContextTokens / 1024),
          })}
        </p>
      )}
    </>
  )
}
