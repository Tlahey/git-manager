import { useEffect, useRef, useState } from 'react'
import {
  apiGitlabDeviceCode,
  apiGitlabPollToken,
  apiGitlabGetUser,
  type GitLabDeviceCodeResponse,
  type GitLabUserInfo,
} from '../api/integrations.api'

interface UseGitlabDeviceFlowOptions {
  /** Which GitLab to sign in to — gitlab.com, or a self-hosted instance. */
  instanceUrl: string
  /**
   * That instance's own OAuth application id, or `null` to use the one shipped for gitlab.com.
   * Required for self-hosted: each instance keeps a separate application registry, so the shipped
   * id is unknown to it.
   */
  clientId: string | null
  onLoginSuccess: (token: string, user: GitLabUserInfo) => void
}

/**
 * Drives GitLab's OAuth device-authorization flow — the same shape as
 * {@link useGithubDeviceFlow}: request a code, open the approval page, poll until the user says
 * yes, then swap the token for a profile.
 *
 * Deliberately a sibling of the GitHub hook rather than a shared generic one. The two differ in
 * every parameter that matters (an instance and a client id here; neither there) and agree only on
 * the polling skeleton, so folding them together would trade a real difference for a shared shape.
 */
export function useGitlabDeviceFlow({
  instanceUrl,
  clientId,
  onLoginSuccess,
}: UseGitlabDeviceFlowOptions) {
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deviceFlowData, setDeviceFlowData] = useState<GitLabDeviceCodeResponse | null>(null)
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current)
    }
  }, [])

  /** Swaps a token for its profile — which is also the check that the token works at all. */
  async function completeLoginWithToken(tokenVal: string): Promise<boolean> {
    setConnecting(true)
    setError(null)
    try {
      const user = await apiGitlabGetUser(instanceUrl, tokenVal)
      onLoginSuccess(tokenVal, user)
      return true
    } catch (err: unknown) {
      setError((err instanceof Error ? err.message : '') || String(err))
      return false
    } finally {
      setConnecting(false)
    }
  }

  async function startOAuthLogin() {
    setError(null)
    setConnecting(true)
    setDeviceFlowData(null)
    if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current)

    try {
      const data = await apiGitlabDeviceCode(instanceUrl, clientId)
      setDeviceFlowData(data)

      const interval = data.interval || 5
      const id = setInterval(async () => {
        try {
          const poll = await apiGitlabPollToken(instanceUrl, clientId, data.device_code)

          // Both mean "keep waiting". `slow_down` asks for a longer gap, which the fixed interval
          // already errs on the side of — GitLab's own suggested interval is the starting point.
          if (poll.error === 'authorization_pending' || poll.error === 'slow_down') return

          if (poll.error) {
            clearInterval(id)
            setDeviceFlowData(null)
            setConnecting(false)
            setError(`OAuth Error: ${poll.error_description || poll.error}`)
            return
          }
          if (poll.access_token) {
            clearInterval(id)
            setDeviceFlowData(null)
            await completeLoginWithToken(poll.access_token)
          }
        } catch (e: unknown) {
          clearInterval(id)
          setDeviceFlowData(null)
          setConnecting(false)
          setError(`Polling error: ${e instanceof Error ? e.message : String(e)}`)
        }
      }, interval * 1000)

      pollingIntervalRef.current = id

      // GitLab hands back a URL with the code already in it; prefer it, so the user does not have
      // to retype what the app already knows.
      const target = data.verification_uri_complete || data.verification_uri
      if (target) window.open(target, '_blank')
    } catch (err: unknown) {
      setConnecting(false)
      setError((err instanceof Error ? err.message : '') || String(err))
    }
  }

  function cancelFlow() {
    if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current)
    setDeviceFlowData(null)
    setConnecting(false)
  }

  return { connecting, error, deviceFlowData, startOAuthLogin, completeLoginWithToken, cancelFlow }
}
