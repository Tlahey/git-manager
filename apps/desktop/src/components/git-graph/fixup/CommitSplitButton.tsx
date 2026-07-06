import { createPortal } from 'react-dom'
import { ChevronDown, GitBranch, ArrowUp, Check } from 'lucide-react'
import { Button, cn } from '@git-manager/ui'
import { useAnchoredMenu } from '../../../hooks/useAnchoredMenu'

export type CommitMode = 'commit' | 'push' | 'rebase'

interface CommitSplitButtonProps {
  disabled?: boolean
  busy?: boolean
  labels: { commit: string; commitAndPush: string; commitAndRebase: string }
  onCommit: (mode: CommitMode) => void
}

/**
 * Primary "Commit" action with a dropdown for the two chained variants
 * (commit & push, commit & rebase). Menu is rendered via portal and anchored
 * to the caret button (`useAnchoredMenu`).
 */
export function CommitSplitButton({ disabled, busy, labels, onCommit }: CommitSplitButtonProps) {
  const { open, setOpen, pos, containerRef, triggerRef, menuRef } = useAnchoredMenu({ align: 'right' })

  const choose = (mode: CommitMode) => {
    setOpen(false)
    onCommit(mode)
  }

  return (
    <div ref={containerRef} className="flex items-stretch">
      <Button
        data-testid="fixup-commit-btn"
        disabled={disabled || busy}
        className="rounded-r-none gap-1.5"
        onClick={() => onCommit('commit')}
      >
        <Check className="h-3.5 w-3.5" />
        {labels.commit}
      </Button>
      <Button
        ref={triggerRef}
        data-testid="fixup-commit-menu-btn"
        disabled={disabled || busy}
        className="rounded-l-none border-l border-primary-foreground/20 px-1.5"
        onClick={() => setOpen((v) => !v)}
        aria-label="More commit options"
      >
        <ChevronDown className="h-3.5 w-3.5" />
      </Button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            style={{ position: 'fixed', top: pos.top, left: pos.left, transform: 'translateX(-100%)' }}
            className="z-50 min-w-[200px] rounded-md border border-border bg-popover py-1 text-popover-foreground shadow-lg"
          >
            <MenuRow icon={<ArrowUp className="h-3.5 w-3.5" />} label={labels.commitAndPush} onClick={() => choose('push')} />
            <MenuRow icon={<GitBranch className="h-3.5 w-3.5" />} label={labels.commitAndRebase} onClick={() => choose('rebase')} />
          </div>,
          document.body,
        )}
    </div>
  )
}

function MenuRow({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn('flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-accent')}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}
