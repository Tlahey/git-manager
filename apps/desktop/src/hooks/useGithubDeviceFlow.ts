import { useEffect, useRef, useState } from 'react'
import { apiGithubDeviceCode, apiGithubGetUser, apiGithubPollToken } from '../api/github.api'
import type { DeviceCodeResponse } from '../lib/tauri'
import type { GitHubUser } from '@git-manager/git-types'

interface UseGithubDeviceFlowOptions {
  onLoginSuccess: (token: string, user: GitHubUser) => void
}

/**
 * Drives the GitHub OAuth device-authorization flow (device code request, polling for the
 * access token, cleanup) and the shared "exchange a token for a user" step used by both the
 * OAuth flow and the personal-access-token flow.
 */
export function useGithubDeviceFlow({ onLoginSuccess }: UseGithubDeviceFlowOptions) {
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deviceFlowData, setDeviceFlowData] = useState<DeviceCodeResponse | null>(null)
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current)
    }
  }, [])

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

  async function startOAuthLogin() {
    setError(null)
    setConnecting(true)
    setDeviceFlowData(null)
    if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current)

    try {
      const data = await apiGithubDeviceCode('repo read:user user:email')
      setDeviceFlowData(data)

      const interval = data.interval || 5
      const id = setInterval(async () => {
        try {
          const pollData = await apiGithubPollToken(data.device_code)

          if (pollData.error === 'authorization_pending' || pollData.error === 'slow_down') {
            return
          }
          if (pollData.error) {
            clearInterval(id)
            setDeviceFlowData(null)
            setConnecting(false)
            setError(`OAuth Error: ${pollData.error_description || pollData.error}`)
            return
          }
          if (pollData.access_token) {
            clearInterval(id)
            setDeviceFlowData(null)
            await completeLoginWithToken(pollData.access_token)
          }
        } catch (e: unknown) {
          console.error('Polling error:', e)
          clearInterval(id)
          setDeviceFlowData(null)
          setConnecting(false)
          setError(`Polling error: ${e instanceof Error ? e.message : String(e)}`)
        }
      }, interval * 1000)

      pollingIntervalRef.current = id

      if (data.verification_uri) {
        window.open(data.verification_uri, '_blank')
      }
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

  return {
    connecting,
    error,
    deviceFlowData,
    startOAuthLogin,
    completeLoginWithToken,
    cancelFlow,
  }
}
