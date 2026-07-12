import { CheckCircle2, XCircle, Loader2, Circle } from 'lucide-react'
import { Tooltip } from '../../../components/ui/Tooltip'
import type { PRStatus, CiStatus, CiDetail } from '../types'

const STATUS_CONFIG: Record<PRStatus, { label: string; className: string }> = {
  open: {
    label: 'Open',
    className: 'bg-green-500/15 text-green-400 border-green-500/30',
  },
  draft: {
    label: 'Draft',
    className: 'bg-muted text-muted-foreground border-border',
  },
  approved: {
    label: 'Approved',
    className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  },
  changes_requested: {
    label: 'Changes',
    className: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  },
  merged: {
    label: 'Merged',
    className: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  },
  closed: {
    label: 'Closed',
    className: 'bg-destructive/15 text-destructive border-destructive/30',
  },
}

export function StatusBadge({ status }: { status: PRStatus }) {
  const cfg = STATUS_CONFIG[status]
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${cfg.className}`}
    >
      {cfg.label}
    </span>
  )
}

export function CiBadge({ status, details }: { status: CiStatus; details?: CiDetail[] }) {
  let badgeEl = <span className="text-[9px] text-muted-foreground/40">—</span>

  if (status === 'success') {
    badgeEl = (
      <span className="flex cursor-help items-center gap-0.5 text-[9px] text-green-400">
        <CheckCircle2 className="h-3 w-3" />
        Pass
      </span>
    )
  } else if (status === 'failure') {
    badgeEl = (
      <span className="flex cursor-help items-center gap-0.5 text-[9px] text-red-400">
        <XCircle className="h-3 w-3" />
        Fail
      </span>
    )
  } else if (status === 'running') {
    badgeEl = (
      <span className="flex cursor-help items-center gap-0.5 text-[9px] text-amber-400">
        <Loader2 className="h-3 w-3 animate-spin" />
        Running
      </span>
    )
  } else if (status === 'skipped') {
    badgeEl = <span className="cursor-help text-[9px] text-muted-foreground/40">Skip</span>
  }

  if (details && details.length > 0) {
    const tooltipContent = (
      <div className="flex max-w-[280px] flex-col gap-1 p-1">
        <div className="mb-1.5 flex items-center justify-between border-b border-border/40 pb-1 text-[10px] font-bold text-muted-foreground/85">
          <span>CI Check Steps</span>
          <span className="text-[8px] font-normal normal-case opacity-60">hover to see status</span>
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
