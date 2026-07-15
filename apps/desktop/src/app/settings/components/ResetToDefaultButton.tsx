import { useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Button } from '@git-manager/ui'
import { RotateCcw } from 'lucide-react'

interface ResetToDefaultButtonProps {
  /** Performs the actual reset for the current page. */
  onReset: () => void
}

/**
 * Per-page "reset to default" affordance shared by every settings section. Requires a confirming
 * second click (no destructive action on a single click) and returns to its idle label on cancel.
 */
export function ResetToDefaultButton({ onReset }: ResetToDefaultButtonProps) {
  const { t } = useTranslation('settings')
  const [confirming, setConfirming] = useState(false)

  if (confirming) {
    return (
      <div className="flex items-center gap-2" data-testid="reset-to-default">
        <span className="text-[11px] text-muted-foreground">{t('settings.reset.confirm')}</span>
        <Button
          size="sm"
          variant="destructive"
          className="h-7 text-xs"
          data-testid="reset-to-default-confirm"
          onClick={() => {
            onReset()
            setConfirming(false)
          }}
        >
          {t('settings.reset.confirmAction')}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs text-muted-foreground hover:text-foreground"
          data-testid="reset-to-default-cancel"
          onClick={() => setConfirming(false)}
        >
          {t('settings.reset.cancel')}
        </Button>
      </div>
    )
  }

  return (
    <Button
      size="sm"
      variant="ghost"
      className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      data-testid="reset-to-default"
      onClick={() => setConfirming(true)}
    >
      <RotateCcw className="h-3 w-3" />
      {t('settings.reset.button')}
    </Button>
  )
}
