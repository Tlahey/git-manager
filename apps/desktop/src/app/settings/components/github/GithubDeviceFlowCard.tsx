import { useState } from 'react'
import { Button } from '@git-manager/ui'
import { useTranslation } from '@git-manager/i18n'
import { Check, ExternalLink, RefreshCw } from 'lucide-react'
import type { DeviceCodeResponse } from '../../../../lib/tauri'

interface GithubDeviceFlowCardProps {
  flow: DeviceCodeResponse
  onCancel: () => void
}

/**
 * The card shown while GitHub's device flow is waiting: the code to type, where to type it, and a
 * way out.
 *
 * It owns its own "copied!" flash because nothing else has any use for it — the state exists for
 * two seconds to confirm a click, and lifting it to the settings page would make a screen-level
 * concern out of a button's own feedback.
 */
export function GithubDeviceFlowCard({ flow, onCancel }: GithubDeviceFlowCardProps) {
  const { t } = useTranslation('settings')
  const [copied, setCopied] = useState(false)

  function copyCode() {
    navigator.clipboard.writeText(flow.user_code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div
      data-testid="github-device-flow-card"
      className="space-y-4 rounded-lg border border-primary/20 bg-primary/5 p-4"
    >
      {/* Stacked rather than title-left / status-right: side by side, each got half a 340px pane,
          which wrapped the title onto two lines and the status onto two more. The status is a
          caption for the title anyway, not a peer of it. */}
      <div className="space-y-1">
        <h4 className="text-xs font-semibold tracking-wider text-foreground uppercase">
          {t('settings.github.authorizationTitle')}
        </h4>
        <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <RefreshCw className="h-3 w-3 shrink-0 animate-spin text-primary" />
          {t('settings.github.waitingAuth')}
        </span>
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">
        {t('settings.github.deviceCodeInstructions')}
      </p>

      {/* Stacked, not side by side: the code is the thing to read here, and sharing a row with the
          copy button left it too little width — an eight-character code broke across two lines in a
          settings pane. `whitespace-nowrap` keeps it on one whatever the pane is doing. */}
      <div className="flex flex-col items-center gap-3 rounded-md border border-border/60 bg-muted/30 p-4">
        <span
          data-testid="github-device-user-code"
          className="font-mono text-2xl font-bold tracking-wider whitespace-nowrap text-foreground select-all"
        >
          {flow.user_code}
        </span>
        <Button size="sm" variant="outline" onClick={copyCode} className="h-8 text-xs">
          {copied ? (
            <>
              <Check className="mr-1.5 h-3.5 w-3.5 text-green-500" />
              {t('settings.github.codeCopied')}
            </>
          ) : (
            t('settings.github.copyCode')
          )}
        </Button>
      </div>

      <div className="flex items-center gap-3">
        {/* `asChild` so this stays a real link — right-click, copy address, middle-click all keep
            working — while riding the Button recipe. Hand-rolled it had three problems, in
            descending order of how much they cost a user: no `focus-visible` ring at all, so
            tabbing to the primary action of this screen showed nothing; `hover:bg-primary-hover`, a
            token that does not exist, so the hover was dead; and a fixed `rounded` plus raw
            `--primary` instead of `rounded-(--control-radius)` and the `--button-*` pair, so it
            ignored both the theme's button shape (glass makes them capsules) and any re-pointing of
            the button colours (`.chrome-surface` does exactly that). Its contrast was fine — that
            pair is audited too; the focus ring is the part that was actually inaccessible. */}
        <Button asChild size="sm">
          <a
            href={flow.verification_uri}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="github-device-verification-link"
          >
            {t('settings.github.openActivationPage')}
            <ExternalLink className="h-3 w-3" />
          </a>
        </Button>

        <Button
          size="sm"
          variant="ghost"
          onClick={onCancel}
          data-testid="github-device-cancel-button"
          className="h-8 text-xs text-muted-foreground hover:text-foreground"
        >
          {t('settings.github.cancel')}
        </Button>
      </div>
    </div>
  )
}
