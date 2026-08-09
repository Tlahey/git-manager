import { useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Button, Spinner } from '@git-manager/ui'
import { Hash } from 'lucide-react'

interface AssignIdentifiersRowProps {
  /** How many cards on the board carry no identifier. The row renders nothing at zero. */
  count: number
  /** The sequence the missing numbers are drawn from — shown in the button, so the user sees what
   * their tickets are about to be called before they press it. */
  prefix: string
  /** Resolves with how many cards were actually numbered. */
  onAssign: (prefix: string) => Promise<number>
  disabled?: boolean
}

/**
 * The offer to number the cards that have none — a board created before it had a prefix.
 *
 * Its own component rather than another block inside `BoardSettingsDialog`, which is already at the
 * size where one more section is one too many (architecture-guardian R1), and because this is the one
 * control in that dialog that is **not** part of the draft: it writes to the cards the moment it is
 * pressed, where everything around it waits for Save. Keeping it separate is what lets the button say
 * so on its own line instead of hiding among fields that behave differently.
 *
 * Shown only when there is something to repair, so the ordinary board never carries an explanation of
 * a problem it doesn't have.
 */
export function AssignIdentifiersRow({
  count,
  prefix,
  onAssign,
  disabled,
}: AssignIdentifiersRowProps) {
  const { t } = useTranslation('board')
  const [pending, setPending] = useState(false)

  if (count === 0) return null

  async function assign() {
    setPending(true)
    try {
      await onAssign(prefix)
    } catch {
      // Reported by the action layer (`reportWriteFailures`); swallowed here so the rejection isn't
      // an unhandled one, and so the dialog stays open.
    } finally {
      setPending(false)
    }
  }

  return (
    <div
      className="flex items-center justify-between gap-2 rounded border border-border bg-muted/40 px-2 py-1.5"
      data-testid="board-settings-assign-identifiers"
    >
      <p className="text-[10px] leading-snug text-muted-foreground">
        {t('boardSettings.unnumberedCards', { count })}
      </p>
      <Button
        variant="outline"
        size="sm"
        className="h-7 shrink-0 gap-1.5"
        disabled={disabled || pending}
        onClick={() => void assign()}
        data-testid="board-settings-assign-identifiers-run"
      >
        {pending ? <Spinner className="h-3 w-3" /> : <Hash className="h-3 w-3" />}
        {t('boardSettings.assignIdentifiers', { prefix })}
      </Button>
    </div>
  )
}
