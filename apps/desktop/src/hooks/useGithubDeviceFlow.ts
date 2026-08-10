import { useEffect, useRef, useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { apiGithubDeviceCode, apiGithubGetUser, apiGithubPollToken } from '../api/github.api'
import type { DeviceCodeResponse } from '../lib/tauri'
import type { GitHubUser } from '@git-manager/git-types'

interface UseGithubDeviceFlowOptions {
  onLoginSuccess: (token: string, user: GitHubUser) => void
}

/** Extra delay GitHub asks for when we polled too fast, per RFC 8628 §3.5. */
const SLOW_DOWN_BACKOFF_MS = 5000

/** Fallbacks for the two timings GitHub is supposed to send us. */
const DEFAULT_INTERVAL_SECONDS = 5
const DEFAULT_EXPIRY_SECONDS = 900

/**
 * Drives the GitHub OAuth device-authorization flow (device code request, polling for the
 * access token, cleanup) and the shared "exchange a token for a user" step used by both the
 * OAuth flow and the personal-access-token flow.
 *
 * Polling is a chain of `setTimeout`s rather than a `setInterval`, and that is the whole point of
 * the shape: the delay between two polls has to be able to *grow*.
 *
 * GitHub answers `slow_down` when we ask too often, and RFC 8628 §3.5 requires the client to add
 * five seconds to its interval each time it does. A fixed interval never backs off, so once the
 * first `slow_down` lands GitHub keeps answering `slow_down` — and the user, who has already
 * approved the request in their browser, watches a spinner forever with nothing to click and no
 * error to read. A `setInterval` also stacks requests whenever one takes longer than the interval,
 * which is a way to earn that `slow_down` in the first place.
 *
 * The code's own `expires_in` is honoured too: a device code dies after ~15 minutes, and polling a
 * dead one is how the same spinner outlives the thing it is waiting for.
 */
export function useGithubDeviceFlow({ onLoginSuccess }: UseGithubDeviceFlowOptions) {
  const { t } = useTranslation('settings')
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deviceFlowData, setDeviceFlowData] = useState<DeviceCodeResponse | null>(null)
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function stopPolling() {
    if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current)
    pollTimeoutRef.current = null
  }

  useEffect(() => stopPolling, [])

  async function completeLoginWithToken(tokenVal: string): Promise<boolean> {
    setConnecting(true)
    setError(null)
    try {
      const userData = await apiGithubGetUser(tokenVal)
      const connectedUser: GitHubUser = {
        login: userData.login,
        name: userData.name || userData.login,
        email: userData.email,
        avatarUrl: userData.avatarUrl,
      }
      onLoginSuccess(tokenVal, connectedUser)
      return true
    } catch (err: unknown) {
      setError((err instanceof Error ? err.message : '') || String(err))
      return false
    } finally {
      setConnecting(false)
    }
  }

  /** Ends the flow with a message, leaving the card replaced by the error rather than a spinner. */
  function failFlow(message: string) {
    stopPolling()
    setDeviceFlowData(null)
    setConnecting(false)
    setError(message)
  }

  async function startOAuthLogin() {
    setError(null)
    setConnecting(true)
    setDeviceFlowData(null)
    stopPolling()

    try {
      const data = await apiGithubDeviceCode('repo read:user user:email')
      setDeviceFlowData(data)

      let delayMs = (data.interval || DEFAULT_INTERVAL_SECONDS) * 1000
      const expiresAt = Date.now() + (data.expires_in || DEFAULT_EXPIRY_SECONDS) * 1000

      const scheduleNextPoll = () => {
        pollTimeoutRef.current = setTimeout(poll, delayMs)
      }

      const poll = async () => {
        if (Date.now() >= expiresAt) {
          failFlow(t('settings.github.deviceCodeExpired'))
          return
        }

        try {
          const pollData = await apiGithubPollToken(data.device_code)

          // Asked too often: widen the gap before trying again, or GitHub will keep saying this
          // and never hand over the token, however many times the user approves.
          if (pollData.error === 'slow_down') {
            delayMs += SLOW_DOWN_BACKOFF_MS
            scheduleNextPoll()
            return
          }
          if (pollData.error === 'authorization_pending') {
            scheduleNextPoll()
            return
          }
          if (pollData.error) {
            failFlow(`OAuth Error: ${pollData.error_description || pollData.error}`)
            return
          }
          if (pollData.access_token) {
            stopPolling()
            setDeviceFlowData(null)
            await completeLoginWithToken(pollData.access_token)
            return
          }
          // Neither a token nor an error — nothing to act on, so keep waiting rather than
          // treating an unexpected shape as a failure.
          scheduleNextPoll()
        } catch (e: unknown) {
          console.error('Polling error:', e)
          failFlow(`Polling error: ${e instanceof Error ? e.message : String(e)}`)
        }
      }

      scheduleNextPoll()

      if (data.verification_uri) {
        window.open(data.verification_uri, '_blank')
      }
    } catch (err: unknown) {
      setConnecting(false)
      setError((err instanceof Error ? err.message : '') || String(err))
    }
  }

  function cancelFlow() {
    stopPolling()
    setDeviceFlowData(null)
    setConnecting(false)
  }

  return {
    connecting,
    error,
    deviceFlowData,
    startOAuthLogin,
    completeLoginWithToken,
    cancelFlow,
  }
}
