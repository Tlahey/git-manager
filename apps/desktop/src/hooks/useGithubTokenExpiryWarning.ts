import { useEffect, useRef } from 'react'
import { toast } from '@git-manager/ui'
import { useTranslation } from '@git-manager/i18n'
import { useSettingsStore } from '../stores/settings.store'
import { describeTokenExpiry } from '../lib/githubTokenExpiry'

/**
 * Warns, once per launch, about a connected GitHub token that is about to expire.
 *
 * A personal access token cannot be renewed in place — there is no refresh grant, so the app's only
 * useful move is to say so early. GitHub sends its own reminder email seven days out; this matches
 * that window so the two agree rather than surprising the user separately.
 *
 * # Why a toast and not a notification-centre entry
 *
 * `notification.store.ts` is pull-request-shaped down to `prNumber`/`prId`/`targetTab`, and its
 * routing tries to open the local clone a notification belongs to. A token has no repository, so an
 * entry there would need three invented fields and would route nowhere. The actionable half lives in
 * Settings › GitHub, which shows the same expiry as a badge with a "Renew" button next to it — this
 * is the part that has to reach a user who was not going to open Settings.
 *
 * Fires once per account per launch, tracked in a ref rather than persisted state: the point is to
 * be seen, and a warning suppressed for a day it was never actually read is a warning that arrives
 * as an outage instead.
 */
export function useGithubTokenExpiryWarning() {
  const { t } = useTranslation('settings')
  const accounts = useSettingsStore((s) => s.settings.github?.accounts)
  const warnedRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    for (const account of accounts ?? []) {
      const expiry = describeTokenExpiry(account.tokenExpiresAt)
      if (!expiry || expiry.level === 'ok') continue
      if (warnedRef.current.has(account.id)) continue
      warnedRef.current.add(account.id)

      const description =
        expiry.level === 'expired'
          ? t('settings.github.token.expiredToast', { login: account.id })
          : t('settings.github.token.expiringToast', {
              login: account.id,
              count: expiry.daysLeft,
            })
      toast.warning(t('settings.github.token.toastTitle'), { description })
    }
  }, [accounts, t])
}
