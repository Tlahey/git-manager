import { Terminal as TerminalIcon } from 'lucide-react'
import { Tag, cn } from '@git-manager/ui'

interface TerminalStateIconProps {
  /** A command holds the PTY's foreground — see `useTerminalActivity`. */
  busy: boolean
  /** Text shown inside the chip beside the glyph (the running command's name, typically). */
  label?: string | null
  /** Glyph size in Tailwind units — `3` (12px) by default, `2.5` for the narrow sidebar rows. */
  size?: 2.5 | 3 | 3.5
  className?: string
  'data-testid'?: string
}

const GLYPH_SIZE: Record<NonNullable<TerminalStateIconProps['size']>, string> = {
  2.5: 'h-2.5 w-2.5',
  3: 'h-3 w-3',
  3.5: 'h-3.5 w-3.5',
}

/**
 * The one glyph that says what a terminal session is doing, wherever a session is shown — the
 * panel's tab strip, the sidebar's Terminals rows, a worktree row's badge, the collapsed status bar.
 *
 * Two states, told apart by colour *and* by motion, because either one alone fails someone: amber
 * and breathing while a command runs, green and still once the prompt is back. It rides `Tag`'s
 * tones rather than a hand-picked `text-emerald-400`, which is what makes it legible on every theme
 * — the raw shade was washed out on the light ones, and a bare icon at 60% opacity on top of that
 * was barely there at all.
 *
 * The pulse is `animate-pulse`'s own two-second breath (the same cue `AgentStatusTag` uses for a
 * working agent), deliberately slow: this sits in a list a user reads, not in a progress dialog.
 */
export function TerminalStateIcon({
  busy,
  label,
  size = 3,
  className,
  'data-testid': testId,
}: TerminalStateIconProps) {
  return (
    <Tag
      tone={busy ? 'warning' : 'success'}
      className={cn('shrink-0 gap-1 px-1 py-0.5', busy && 'animate-pulse', className)}
      data-testid={testId}
      data-state={busy ? 'busy' : 'idle'}
    >
      <TerminalIcon className={cn('shrink-0', GLYPH_SIZE[size])} />
      {label && <span className="max-w-[80px] truncate font-mono">{label}</span>}
    </Tag>
  )
}
