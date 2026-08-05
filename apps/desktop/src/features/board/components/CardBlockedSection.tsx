import { useTranslation } from '@git-manager/i18n'
import { Label, Switch, Textarea } from '@git-manager/ui'
import { AlertTriangle } from 'lucide-react'

interface CardBlockedSectionProps {
  /** The blocking reason, or `''` for a card that isn't blocked — **presence is the flag**. */
  reason: string
  onChange: (reason: string) => void
  /** Whether the switch is on. Held by the parent so toggling on can show an empty, invalid field
   * rather than silently doing nothing until text is typed. */
  blocked: boolean
  onBlockedChange: (blocked: boolean) => void
  disabled?: boolean
}

/**
 * Marks a card blocked, with the reason the request made mandatory.
 *
 * The requirement is enforced by the data model rather than by validation: a card stores only
 * `blockedReason`, so "blocked" *is* "has a reason" and the two can't drift apart. This component's
 * separate `blocked` switch exists purely so the user can turn the toggle on and be shown an empty
 * required field — the card is not actually blocked until they write something, and the dialog's
 * save button says so.
 */
export function CardBlockedSection({
  reason,
  onChange,
  blocked,
  onBlockedChange,
  disabled,
}: CardBlockedSectionProps) {
  const { t } = useTranslation('board')
  const missingReason = blocked && !reason.trim()

  return (
    <div className="space-y-1" data-testid="card-blocked-section">
      <div className="flex items-center gap-2">
        <Switch
          checked={blocked}
          onChange={(e) => onBlockedChange(e.target.checked)}
          disabled={disabled}
          aria-label={t('card.blocked.label')}
          data-testid="card-blocked-switch"
        />
        <Label
          className={`flex items-center gap-1 text-[11px] ${
            blocked ? 'text-destructive' : 'text-muted-foreground'
          }`}
        >
          <AlertTriangle className="h-3 w-3" />
          {t('card.blocked.label')}
        </Label>
      </div>

      {blocked && (
        <>
          <Textarea
            value={reason}
            onChange={(e) => onChange(e.target.value)}
            placeholder={t('card.blocked.reasonPlaceholder')}
            rows={2}
            disabled={disabled}
            aria-invalid={missingReason}
            className={`text-xs ${missingReason ? 'border-destructive' : ''}`}
            data-testid="card-blocked-reason-input"
          />
          {missingReason && (
            <p className="text-[11px] text-destructive" data-testid="card-blocked-reason-required">
              {t('card.blocked.reasonRequired')}
            </p>
          )}
        </>
      )}
    </div>
  )
}
