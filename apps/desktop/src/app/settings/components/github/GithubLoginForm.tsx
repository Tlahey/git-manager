import type { ReactNode } from 'react'
import { Alert, Button, Card, Input, GithubIcon } from '@git-manager/ui'
import { useTranslation } from '@git-manager/i18n'
import { AlertCircle, ArrowLeft, Key, RefreshCw } from 'lucide-react'

/** Which way of adding an account the user is partway through, or `null` for the choice itself. */
export type LoginMethod = 'oauth' | 'pat' | null

interface GithubLoginFormProps {
  method: LoginMethod
  onPickMethod: (method: LoginMethod) => void
  /** Abandons whatever is in progress and returns to the choice. */
  onCancel: () => void
  connecting: boolean
  /** Whatever GitHub or the transport last refused with, shown under either form. */
  error: string | null
  onStartOAuth: () => void
  patToken: string
  onPatTokenChange: (token: string) => void
  onSubmitPat: () => void
}

/**
 * Adding a GitHub account: the choice between the two ways in, and whichever one was picked.
 *
 * The two forms share a shell — same heading, same way back, same error slot — because they are two
 * answers to one question, and a user who tried one and backed out must not find the other laid out
 * differently. They were written twice before, which is how the two drifted apart in the first
 * place.
 */
export function GithubLoginForm({
  method,
  onPickMethod,
  onCancel,
  connecting,
  error,
  onStartOAuth,
  patToken,
  onPatTokenChange,
  onSubmitPat,
}: GithubLoginFormProps) {
  const { t } = useTranslation('settings')

  if (method === null) {
    return (
      <Card className="space-y-4 bg-card/30 p-4">
        <h4 className="text-xs font-semibold text-foreground">{t('settings.github.addUser')}</h4>
        <div className="flex flex-col gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              onPickMethod('oauth')
              onStartOAuth()
            }}
            className="h-9 w-full justify-start gap-2 px-3 text-xs transition-all duration-200 hover:border-primary/30 hover:bg-primary/5"
            data-testid="github-login-oauth-button"
          >
            <GithubIcon className="h-4 w-4 text-muted-foreground" />
            <span>{t('settings.github.loginButton')}</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPickMethod('pat')}
            className="h-9 w-full justify-start gap-2 px-3 text-xs transition-all duration-200 hover:border-primary/30 hover:bg-primary/5"
            data-testid="github-login-pat-button"
          >
            <Key className="h-4 w-4 text-muted-foreground" />
            <span>{t('settings.github.loginWithPAT')}</span>
          </Button>
        </div>
      </Card>
    )
  }

  return (
    <MethodCard onBack={onCancel} error={error}>
      {method === 'oauth' ? (
        <div className="flex flex-col gap-3">
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t('settings.github.tokenHint')}
          </p>
          <Button
            size="sm"
            onClick={onStartOAuth}
            disabled={connecting}
            className="h-8 w-full gap-2 text-xs"
          >
            {connecting ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                {t('settings.github.connecting')}
              </>
            ) : (
              <>
                <GithubIcon className="h-4 w-4" />
                {t('settings.github.loginButton')}
              </>
            )}
          </Button>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            onSubmitPat()
          }}
          className="space-y-3"
        >
          <div className="space-y-1">
            <label className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
              {t('settings.github.patLabel')}
            </label>
            <Input
              type="password"
              value={patToken}
              onChange={(e) => onPatTokenChange(e.target.value)}
              placeholder={t('settings.github.patPlaceholder')}
              className="h-8 font-mono text-xs"
              disabled={connecting}
              data-testid="github-pat-input"
            />
          </div>
          <Button
            type="submit"
            size="sm"
            disabled={connecting || !patToken.trim()}
            className="h-8 w-full gap-2 text-xs"
            data-testid="github-pat-submit-button"
          >
            {connecting ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                {t('settings.github.connecting')}
              </>
            ) : (
              <>
                <Key className="h-3.5 w-3.5" />
                {t('settings.github.addPatButton')}
              </>
            )}
          </Button>
        </form>
      )}
    </MethodCard>
  )
}

/** The shell both methods sit in: the heading, the way back to the choice, and the error slot. */
function MethodCard({
  onBack,
  error,
  children,
}: {
  onBack: () => void
  error: string | null
  children: ReactNode
}) {
  const { t } = useTranslation('settings')
  return (
    <Card className="space-y-4 bg-card/30 p-4">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-foreground">{t('settings.github.addUser')}</h4>
        <button
          type="button"
          onClick={onBack}
          data-testid="github-back-to-choice-button"
          className="flex cursor-pointer items-center gap-1 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-2.5 w-2.5" />
          {t('settings.github.backToAuthOptions')}
        </button>
      </div>

      <div className="space-y-4">
        {children}

        {error && (
          <Alert
            data-testid="github-error-message"
            className="items-center"
            icon={<AlertCircle className="h-4 w-4" />}
          >
            {error}
          </Alert>
        )}
      </div>
    </Card>
  )
}
