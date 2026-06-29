

// ─── Constants & Styles ───────────────────────────────────────────────────────
// We define beautiful inline SVGs with rich colors and gradients.
// These icons are designed with a modern flat/fantasy aesthetic to wows the user.

export function ReviewRequestedIcon() {
  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 ring-1 ring-amber-500/20 shadow-[0_0_8px_rgba(245,158,11,0.15)] animate-pulse">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        className="h-5 w-5 text-amber-400"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* Fantasy design: A cosmic eye observing a Git node */}
        <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
        <circle cx="12" cy="12" r="3" fill="currentColor" fillOpacity="0.2" />
        <circle cx="12" cy="12" r="1.5" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41" />
      </svg>
    </div>
  )
}

export function PrGreenIcon() {
  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 ring-1 ring-emerald-500/20 shadow-[0_0_8px_rgba(16,185,129,0.15)]">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        className="h-5 w-5 text-emerald-400"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* Fantasy design: Rocket launching upwards with checkmark exhaust trail */}
        <path d="M4.5 16.5c-1.5 1.5-2.5 3.5-2.5 5.5h6.5c0-2-1-4-2.5-5.5Z" fill="currentColor" fillOpacity="0.1" />
        <path d="M12 2s-5 4-5 10c0 3 2.5 4.5 5 4.5s5-1.5 5-4.5c0-6-5-10-5-10Z" />
        <path d="M9 12h6M12 9v6" />
        <path d="m19.5 7.5 1.5 1.5 3-3" className="stroke-emerald-300 stroke-[2.5]" />
      </svg>
    </div>
  )
}

export function PrRedIcon() {
  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500/10 ring-1 ring-rose-500/20 shadow-[0_0_8px_rgba(244,63,94,0.15)]">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        className="h-5 w-5 text-rose-400"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* Fantasy design: Black hole / cosmic anomaly swallowing a git line */}
        <circle cx="12" cy="12" r="7" strokeDasharray="3 3" />
        <circle cx="12" cy="12" r="4" fill="currentColor" fillOpacity="0.2" className="animate-ping" style={{ animationDuration: '3s' }} />
        <path d="m15 9-6 6M9 9l6 6" className="stroke-[2.5] stroke-rose-300" />
        <path d="M12 2a10 10 0 0 1 10 10" />
      </svg>
    </div>
  )
}

export function PrMergedIcon() {
  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10 ring-1 ring-purple-500/20 shadow-[0_0_8px_rgba(168,85,247,0.15)]">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        className="h-5 w-5 text-purple-400"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* Fantasy design: Sleek cosmic fusion of two nodes with stardust trail */}
        <circle cx="18" cy="18" r="3" fill="currentColor" fillOpacity="0.2" />
        <circle cx="6" cy="6" r="3" />
        <path d="M6 9v7a3 3 0 0 0 3 3h6" />
        <path d="M18 15V9" strokeDasharray="2 2" />
        <path d="m15 12 3 3 3-3" />
        <circle cx="12" cy="12" r="1" className="fill-purple-300" />
        <circle cx="9" cy="15" r="1" className="fill-purple-300" />
      </svg>
    </div>
  )
}

export function PrClosedIcon() {
  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-500/10 ring-1 ring-zinc-500/20 shadow-[0_0_8px_rgba(113,113,122,0.15)]">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        className="h-5 w-5 text-zinc-400"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* Fantasy design: Celestial node blocked with planetary rings */}
        <circle cx="12" cy="12" r="5" fill="currentColor" fillOpacity="0.1" />
        <path d="M4 12h16M12 4v16" strokeDasharray="3 3" />
        <path d="m7.5 7.5 9 9" />
      </svg>
    </div>
  )
}

export function NewPrIcon() {
  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/10 ring-1 ring-cyan-500/20 shadow-[0_0_8px_rgba(6,182,212,0.15)]">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        className="h-5 w-5 text-cyan-400"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* Fantasy design: Star birth or blue comet with sparkles */}
        <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
        <path d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z" fill="currentColor" fillOpacity="0.2" />
        <circle cx="12" cy="12" r="2" />
        <path d="m19 5-3 3M5 19l3-3" />
      </svg>
    </div>
  )
}

export function DefaultIcon() {
  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/10 ring-1 ring-sky-500/20 shadow-[0_0_8px_rgba(14,165,233,0.15)]">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        className="h-5 w-5 text-sky-400"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* Fantasy design: A starry floating notifications bell */}
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9ZM10.3 21a1.94 1.94 0 0 0 3.4 0" />
        <circle cx="18" cy="4" r="1.5" className="fill-sky-300" />
      </svg>
    </div>
  )
}
