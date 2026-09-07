import { useEffect, useRef } from 'react'
import { toast } from '@git-manager/ui'
import { useTranslation } from '@git-manager/i18n'
import { useGithubRateLimitStore } from '../stores/githubRateLimit.store'

/**
 * Says out loud when GitHub has stopped answering, and for how long.
 *
 * The failure this exists for is silence: several callers turn a `403` into an empty list, so a
 * spent quota used to look exactly like a repository with no open pull requests and a dashboard with
 * nothing on it. Now that the app *knows* — the `x-ratelimit-*` headers are read and the polling
 * backs off on its own — the one thing left is telling the user, because a screen that quietly stops
 * updating is indistinguishable from a screen with nothing to say.
 *
 * # Why a toast, and once per block
 *
 * The same argument as {@link useGithubTokenExpiryWarning}: `notification.store.ts` is
 * pull-request-shaped down to `prNumber`, and a quota belongs to no repository. Fired once per
 * cooldown — keyed on the deadline itself, so a *new* block later in the session speaks again while
 * the current one stays quiet however many hooks bump into it.
 */
export function useGithubRateLimitWarning() {
  const { t } = useTranslation('settings')
  const buckets = useGithubRateLimitStore((s) => s.buckets)
  const announcedRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    for (const [key, bucket] of Object.entries(buckets)) {
      if (!bucket.blockedUntil) continue
      const announcementId = `${key}:${bucket.blockedUntil}`
      if (announcedRef.current.has(announcementId)) continue
      announcedRef.current.add(announcementId)

      const minutes = Math.max(1, Math.ceil((bucket.blockedUntil - Date.now()) / 60_000))
      toast.warning(t('settings.github.rateLimit.toastTitle'), {
        description: t('settings.github.rateLimit.toastBody', {
          resource: key.split(':')[1],
          count: minutes,
        }),
      })
    }
  }, [buckets, t])
}
