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
      <span className="flex items-center gap-0.5 text-[9px] text-green-400 cursor-help">
        <CheckCircle2 className="h-3 w-3" />
        Pass
      </span>
    )
  } else if (status === 'failure') {
    badgeEl = (
      <span className="flex items-center gap-0.5 text-[9px] text-red-400 cursor-help">
        <XCircle className="h-3 w-3" />
        Fail
      </span>
    )
  } else if (status === 'running') {
    badgeEl = (
      <span className="flex items-center gap-0.5 text-[9px] text-amber-400 cursor-help">
        <Loader2 className="h-3 w-3 animate-spin" />
        Running
      </span>
    )
  } else if (status === 'skipped') {
    badgeEl = <span className="text-[9px] text-muted-foreground/40 cursor-help">Skip</span>
  }

  if (details && details.length > 0) {
    const tooltipContent = (
      <div className="flex flex-col gap-1 p-1 max-w-[280px]">
        <div className="font-bold text-[10px] text-muted-foreground/85 border-b border-border/40 pb-1 mb-1.5 flex items-center justify-between">
          <span>CI Check Steps</span>
          <span className="text-[8px] opacity-60 normal-case font-normal">hover to see status</span>
        </div>
        <div className="flex flex-col gap-1.5">
          {details.map((d, idx) => (
            <div key={idx} className="flex items-center justify-between gap-4 text-[10px]">
              <div className="flex items-center gap-1.5 min-w-0">
                {d.status === 'success' && <CheckCircle2 className="h-3 w-3 text-green-400 shrink-0" />}
                {d.status === 'failure' && <XCircle className="h-3 w-3 text-red-400 shrink-0" />}
                {d.status === 'running' && <Loader2 className="h-3 w-3 animate-spin text-amber-400 shrink-0" />}
                {d.status === 'skipped' && <Circle className="h-3 w-3 text-muted-foreground/30 shrink-0" />}
                {d.status === 'unknown' && <Circle className="h-3 w-3 text-muted-foreground/50 shrink-0" />}
                <span className="truncate text-foreground/90 font-medium">{d.name}</span>
              </div>
              <span className="text-[9px] uppercase font-semibold text-muted-foreground/60 shrink-0">
                {d.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    )

    return (
      <Tooltip content={tooltipContent} className="whitespace-normal min-w-[220px]">
        {badgeEl}
      </Tooltip>
    )
  }

  return badgeEl
}
