import { Terminal as TerminalIcon } from 'lucide-react'
import { Tag, cn, type TagTone } from '@git-manager/ui'
import type { TerminalSessionState } from '../../lib/terminalState'

interface TerminalStateIconProps {
  /** What the session is doing — see {@link TerminalSessionState}. */
  state: TerminalSessionState
  /** Text shown inside the chip beside the glyph (the command's name, typically). */
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
 * Quiet grey by default, grey and breathing while a command runs, blue once one has finished and
 * nobody has looked yet. Blue is the only state that asks for attention, and it is the only one that
 * goes away by itself — looking at the session is what clears it (see `terminal.store.ts`). A
 * running command gets motion rather than a colour of its own on purpose: "still going" is not news,
 * and a list of amber chips would compete with the one chip that is.
 *
 * The tones come from `Tag` rather than hand-picked shades, which is what makes them legible on
 * every theme — they are APCA-gated per surface, where a raw `text-emerald-400` was washed out on
 * the light ones.
 *
 * The pulse is `animate-pulse`'s own two-second breath (the same cue `AgentStatusTag` uses for a
 * working agent), deliberately slow: this sits in a list a user reads, not in a progress dialog.
 */
export function TerminalStateIcon({
  state,
  label,
  size = 3,
  className,
  'data-testid': testId,
}: TerminalStateIconProps) {
  const tone: TagTone = state === 'done' ? 'info' : 'neutral'
  return (
    <Tag
      tone={tone}
      className={cn('shrink-0 gap-1 px-1 py-0.5', state === 'busy' && 'animate-pulse', className)}
      data-testid={testId}
      data-state={state}
    >
      <TerminalIcon className={cn('shrink-0', GLYPH_SIZE[size])} />
      {label && <span className="max-w-[80px] truncate font-mono">{label}</span>}
    </Tag>
  )
}
