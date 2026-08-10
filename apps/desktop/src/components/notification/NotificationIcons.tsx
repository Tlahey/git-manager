// ─── Constants & Styles ───────────────────────────────────────────────────────
// One colour-tinted box per notification type, wrapping a real lucide-react glyph — the same one
// each concept already uses elsewhere in the app (`CheckCircle2`/`XCircle` for CI in
// `features/launchpad/components/Badges.tsx`, `GitMerge` for a merge in `PrMergeButton.tsx`, `Eye`
// for a review in `PrQuickActions.tsx`), so the notch/bell icon for an event and the in-app icon
// for the same event are never two different pictures.

import {
  Bell,
  CheckCircle2,
  Clock,
  Eye,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  XCircle,
} from 'lucide-react'

export function ReviewRequestedIcon() {
  return (
    <div className="flex h-8 w-8 animate-pulse items-center justify-center rounded-lg bg-amber-500/10 shadow-[0_0_8px_rgba(245,158,11,0.15)] ring-1 ring-amber-500/20">
      <Eye className="h-5 w-5 text-amber-400" strokeWidth={2} />
    </div>
  )
}

export function PrGreenIcon() {
  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 shadow-[0_0_8px_rgba(16,185,129,0.15)] ring-1 ring-emerald-500/20">
      <CheckCircle2 className="h-5 w-5 text-emerald-400" strokeWidth={2} />
    </div>
  )
}

export function PrRedIcon() {
  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500/10 shadow-[0_0_8px_rgba(244,63,94,0.15)] ring-1 ring-rose-500/20">
      <XCircle className="h-5 w-5 text-rose-400" strokeWidth={2} />
    </div>
  )
}

export function PrMergedIcon() {
  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10 shadow-[0_0_8px_rgba(168,85,247,0.15)] ring-1 ring-purple-500/20">
      <GitMerge className="h-5 w-5 text-purple-400" strokeWidth={2} />
    </div>
  )
}

/**
 * Closed *without* merging. Red, like GitHub's own closed-PR glyph and the launchpad row's
 * `XCircle` — deliberately never purple, which is reserved for `PrMergedIcon`.
 */
export function PrClosedIcon() {
  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/10 shadow-[0_0_8px_rgba(239,68,68,0.15)] ring-1 ring-red-500/20">
      <GitPullRequestClosed className="h-5 w-5 text-red-400" strokeWidth={2} />
    </div>
  )
}

/**
 * Queued to merge (auto-merge armed / merge queue). Indigo — the waiting room between the green of
 * a passing CI and the purple of a merge.
 */
export function PrQueuedIcon() {
  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/10 shadow-[0_0_8px_rgba(99,102,241,0.15)] ring-1 ring-indigo-500/20">
      <Clock className="h-5 w-5 text-indigo-400" strokeWidth={2} />
    </div>
  )
}

export function NewPrIcon() {
  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/10 shadow-[0_0_8px_rgba(6,182,212,0.15)] ring-1 ring-cyan-500/20">
      <GitPullRequest className="h-5 w-5 text-cyan-400" strokeWidth={2} />
    </div>
  )
}

export function DefaultIcon() {
  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/10 shadow-[0_0_8px_rgba(14,165,233,0.15)] ring-1 ring-sky-500/20">
      <Bell className="h-5 w-5 text-sky-400" strokeWidth={2} />
    </div>
  )
}
