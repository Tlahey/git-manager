import type { ReactNode, ReactElement } from 'react'
import { CheckCircle2, XCircle, Loader2, Circle, ExternalLink } from 'lucide-react'
import { Tooltip } from '@git-manager/ui'
import { useTranslation } from '@git-manager/i18n'
import type { PRStatus, CiStatus, CiDetail } from '../types'
import { ciActionUrl, openUrl } from '../utils'

const STATUS_CONFIG: Record<PRStatus, { labelKey: string; className: string }> = {
  // Text colours ride the graded --tone-*-foreground tokens (the same pair the shared
  // Tag/Alert use) so they retint per theme and clear APCA, instead of the fixed
  // palette shades (text-green-400…) that washed out on light themes. `merged` keeps
  // GitHub's conventional purple — there's no purple tone token.
  open: {
    labelKey: 'status.open',
    className: 'bg-success/15 text-tone-success border-success/30',
  },
  draft: {
    labelKey: 'status.draft',
    className: 'bg-muted text-muted-foreground border-border',
  },
  approved: {
    labelKey: 'status.approved',
    className: 'bg-success/15 text-tone-success border-success/30',
  },
  changes_requested: {
    labelKey: 'status.changes',
    className: 'bg-amber-500/15 text-tone-warning border-amber-500/30',
  },
  merged: {
    labelKey: 'status.merged',
    className: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  },
  closed: {
    labelKey: 'status.closed',
    className: 'bg-destructive/15 text-tone-danger border-destructive/30',
  },
}

export function StatusBadge({ status }: { status: PRStatus }) {
  const { t } = useTranslation('launchpad')
  const cfg = STATUS_CONFIG[status]
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${cfg.className}`}
    >
      {t(cfg.labelKey)}
    </span>
  )
}

export function CiBadge({
  status,
  details,
  prUrl,
}: {
  status: CiStatus
  details?: CiDetail[]
  /** The PR URL, used to fall back to its Checks tab when no per-check link exists. */
  prUrl?: string
}) {
  const { t } = useTranslation('launchpad')
  const actionUrl = ciActionUrl(status, details, prUrl)

  // The icon + label for the current status; the em-dash is the "no CI" default.
  let inner: ReactNode = <span className="text-[9px] text-muted-foreground/40">—</span>
  let toneClass = ''

  if (status === 'success') {
    toneClass = 'text-tone-success'
    inner = (
      <>
        <CheckCircle2 className="h-3 w-3" />
        {t('ci.pass')}
      </>
    )
  } else if (status === 'failure') {
    toneClass = 'text-tone-danger'
    inner = (
      <>
        <XCircle className="h-3 w-3" />
        {t('ci.fail')}
      </>
    )
  } else if (status === 'running') {
    toneClass = 'text-tone-warning'
    inner = (
      <>
        <Loader2 className="h-3 w-3 animate-spin" />
        {t('ci.running')}
      </>
    )
  } else if (status === 'skipped') {
    toneClass = 'text-muted-foreground/40'
    inner = t('ci.skip')
  }

  const baseClass = `flex items-center gap-0.5 text-[9px] ${toneClass}`

  // When there's a run to open, the badge becomes a real link to the CI action so
  // the state and its "why" are one click away; stop propagation so it doesn't also
  // trigger the row's open-PR handler.
  let badgeEl: ReactElement = actionUrl ? (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        openUrl(actionUrl)
      }}
      title={t('ci.viewAction')}
      aria-label={t('ci.viewAction')}
      className={`${baseClass} cursor-pointer rounded px-0.5 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring`}
    >
      {inner}
      <ExternalLink className="h-2.5 w-2.5 opacity-50" />
    </button>
  ) : (
    <span className={`${baseClass} ${status ? 'cursor-help' : ''}`}>{inner}</span>
  )

  if (details && details.length > 0) {
    const tooltipContent = (
      <div className="flex max-w-[280px] flex-col gap-1 p-1">
        <div className="mb-1.5 flex items-center justify-between border-b border-border/40 pb-1 text-[10px] font-bold text-muted-foreground/85">
          <span>{t('ci.checkSteps')}</span>
          <span className="text-[8px] font-normal normal-case opacity-60">
            {actionUrl ? t('ci.clickHint') : t('ci.hoverHint')}
          </span>
        </div>
        <div className="flex flex-col gap-1.5">
          {details.map((d, idx) => (
            <div key={idx} className="flex items-center justify-between gap-4 text-[10px]">
              <div className="flex min-w-0 items-center gap-1.5">
                {d.status === 'success' && (
                  <CheckCircle2 className="h-3 w-3 shrink-0 text-green-400" />
                )}
                {d.status === 'failure' && <XCircle className="h-3 w-3 shrink-0 text-red-400" />}
                {d.status === 'running' && (
                  <Loader2 className="h-3 w-3 shrink-0 animate-spin text-amber-400" />
                )}
                {d.status === 'skipped' && (
                  <Circle className="h-3 w-3 shrink-0 text-muted-foreground/30" />
                )}
                {d.status === 'unknown' && (
                  <Circle className="h-3 w-3 shrink-0 text-muted-foreground/50" />
                )}
                <span className="truncate font-medium text-foreground/90">{d.name}</span>
              </div>
              <span className="shrink-0 text-[9px] font-semibold uppercase text-muted-foreground/60">
                {d.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    )

    return (
      <Tooltip content={tooltipContent} className="min-w-[220px] whitespace-normal">
        {badgeEl}
      </Tooltip>
    )
  }

  return badgeEl
}
