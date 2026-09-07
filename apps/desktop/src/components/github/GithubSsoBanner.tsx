import { Alert, Button } from '@git-manager/ui'
import { useTranslation } from '@git-manager/i18n'
import { ShieldAlert } from 'lucide-react'
import { useGithubTokenStatusStore } from '../../stores/githubTokenStatus.store'
import { openUrl } from '../../lib/openUrl'

interface GithubSsoBannerProps {
  /** The account whose requests are being judged. `null` (anonymous) never has an SSO verdict. */
  accountId: string | null
  className?: string
}

/**
 * "This token has not been authorized for the organization" — with the link that authorizes it.
 *
 * The failure this exists for used to be invisible. An organization with SAML SSO refuses an
 * unauthorized token with a `403` whose body explains nothing, and several callers turn a failed
 * request into an empty list — so the user saw a repository list with nothing in it, or a Launchpad
 * with no pull requests, and no reason to suspect a credential. The reason was in a response header
 * the app threw away.
 *
 * It reads the store rather than taking a challenge as a prop so it can be dropped wherever that
 * emptiness shows up, without every one of those screens having to learn about SSO. Rendering
 * nothing when there is no challenge is the normal case.
 */
export function GithubSsoBanner({ accountId, className }: GithubSsoBannerProps) {
  const { t } = useTranslation('settings')
  const challenge = useGithubTokenStatusStore((s) => (accountId ? s.ssoByAccount[accountId] : null))

  // Only the refusal is worth interrupting for. The other form of the header ("partial-results")
  // rides along with a response that worked, and turning that into the same alarm would put a
  // banner on screen above data the user can already see.
  if (!challenge?.required) return null

  const authorizeUrl = challenge.authorizeUrl

  return (
    <Alert
      variant="warning"
      className={className}
      data-testid="github-sso-banner"
      icon={<ShieldAlert className="h-4 w-4" />}
    >
      <div className="flex flex-col gap-2">
        <div className="space-y-1">
          <p className="text-xs font-semibold">{t('settings.github.sso.title')}</p>
          <p className="text-xs leading-relaxed opacity-90">{t('settings.github.sso.body')}</p>
        </div>
        {/* GitHub supplies the authorization link, signed, in the header itself. When it does not
            — the `partial-results` form carries none — there is nothing to link to, and offering a
            button that guesses at a URL would send the user to a page that cannot authorize
            anything. */}
        {authorizeUrl && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 w-fit gap-2 text-[10px]"
            data-testid="github-sso-authorize-button"
            onClick={() => void openUrl(authorizeUrl)}
          >
            {t('settings.github.sso.authorize')}
          </Button>
        )}
      </div>
    </Alert>
  )
}
