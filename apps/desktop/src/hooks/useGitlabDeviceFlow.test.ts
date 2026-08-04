import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

vi.mock('../api/integrations.api', () => ({
  apiGitlabDeviceCode: vi.fn(),
  apiGitlabPollToken: vi.fn(),
  apiGitlabGetUser: vi.fn(),
}))

import { apiGitlabDeviceCode, apiGitlabPollToken, apiGitlabGetUser } from '../api/integrations.api'
import { useGitlabDeviceFlow } from './useGitlabDeviceFlow'

const mockedDeviceCode = apiGitlabDeviceCode as unknown as ReturnType<typeof vi.fn>
const mockedGetUser = apiGitlabGetUser as unknown as ReturnType<typeof vi.fn>
const mockedPollToken = apiGitlabPollToken as unknown as ReturnType<typeof vi.fn>

const INSTANCE_URL = 'https://gitlab.com'
const CLIENT_ID: string | null = null

const deviceCodeResponse = {
  device_code: 'device-1',
  user_code: 'ABCD-1234',
  verification_uri: 'https://gitlab.com/oauth/device',
  verification_uri_complete: 'https://gitlab.com/oauth/device?user_code=ABCD-1234',
  expires_in: 900,
  interval: 5,
}

function renderFlow(onLoginSuccess = vi.fn(), instanceUrl = INSTANCE_URL, clientId = CLIENT_ID) {
  return renderHook(() => useGitlabDeviceFlow({ instanceUrl, clientId, onLoginSuccess }))
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('completeLoginWithToken', () => {
  it('fetches the user and calls onLoginSuccess', async () => {
    mockedGetUser.mockResolvedValue({
      username: 'someone',
      name: 'Some One',
      email: 'someone@x.com',
      avatarUrl: 'a.png',
    })
    const onLoginSuccess = vi.fn()
    const { result } = renderFlow(onLoginSuccess)

    let success: boolean | undefined
    await act(async () => {
      success = await result.current.completeLoginWithToken('tok')
    })

    expect(success).toBe(true)
    expect(mockedGetUser).toHaveBeenCalledWith(INSTANCE_URL, 'tok')
    expect(onLoginSuccess).toHaveBeenCalledWith('tok', {
      username: 'someone',
      name: 'Some One',
      email: 'someone@x.com',
      avatarUrl: 'a.png',
    })
    expect(result.current.connecting).toBe(false)
  })

  it('sets an error and returns false on failure', async () => {
    mockedGetUser.mockRejectedValue(new Error('bad token'))
    const { result } = renderFlow()

    let success: boolean | undefined
    await act(async () => {
      success = await result.current.completeLoginWithToken('bad')
    })

    expect(success).toBe(false)
    expect(result.current.error).toBe('bad token')
    expect(result.current.connecting).toBe(false)
  })

  it('falls back to the raw error value when the failure is not an Error instance', async () => {
    mockedGetUser.mockRejectedValue('boom')
    const { result } = renderFlow()

    await act(async () => {
      await result.current.completeLoginWithToken('bad')
    })

    expect(result.current.error).toBe('boom')
  })
})

describe('startOAuthLogin', () => {
  it('fetches the device code for the given instance/client, stores it, and opens the pre-filled verification URL', async () => {
    mockedDeviceCode.mockResolvedValue(deviceCodeResponse)
    mockedPollToken.mockResolvedValue({
      access_token: null,
      error: 'authorization_pending',
      error_description: null,
    })
    const windowOpen = vi.spyOn(window, 'open').mockImplementation(() => null)

    const { result } = renderFlow(vi.fn(), 'https://gitlab.acme.dev', 'self-hosted-id')
    await act(async () => result.current.startOAuthLogin())

    expect(mockedDeviceCode).toHaveBeenCalledWith('https://gitlab.acme.dev', 'self-hosted-id')
    expect(result.current.deviceFlowData).toEqual(deviceCodeResponse)
    // GitLab returns a URL with the code already filled in; that one is preferred over the bare
    // verification_uri so the user does not have to retype it.
    expect(windowOpen).toHaveBeenCalledWith(deviceCodeResponse.verification_uri_complete, '_blank')
  })

  it('falls back to the bare verification_uri when verification_uri_complete is absent', async () => {
    mockedDeviceCode.mockResolvedValue({ ...deviceCodeResponse, verification_uri_complete: null })
    mockedPollToken.mockResolvedValue({
      access_token: null,
      error: 'authorization_pending',
      error_description: null,
    })
    const windowOpen = vi.spyOn(window, 'open').mockImplementation(() => null)

    const { result } = renderFlow()
    await act(async () => result.current.startOAuthLogin())

    expect(windowOpen).toHaveBeenCalledWith(deviceCodeResponse.verification_uri, '_blank')
  })

  it('does not open a window when neither verification URL is present', async () => {
    mockedDeviceCode.mockResolvedValue({
      ...deviceCodeResponse,
      verification_uri: '',
      verification_uri_complete: null,
    })
    mockedPollToken.mockResolvedValue({
      access_token: null,
      error: 'authorization_pending',
      error_description: null,
    })
    const windowOpen = vi.spyOn(window, 'open').mockImplementation(() => null)

    const { result } = renderFlow()
    await act(async () => result.current.startOAuthLogin())

    expect(windowOpen).not.toHaveBeenCalled()
  })

  it('does not keep polling data (still connecting) while the user has not authorized yet', async () => {
    mockedDeviceCode.mockResolvedValue(deviceCodeResponse)
    mockedPollToken.mockResolvedValue({
      access_token: null,
      error: 'authorization_pending',
      error_description: null,
    })
    vi.spyOn(window, 'open').mockImplementation(() => null)

    const { result } = renderFlow()
    await act(async () => result.current.startOAuthLogin())

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })

    expect(result.current.error).toBeNull()
    expect(result.current.deviceFlowData).toEqual(deviceCodeResponse)
  })

  it('treats slow_down like authorization_pending and keeps polling', async () => {
    mockedDeviceCode.mockResolvedValue(deviceCodeResponse)
    mockedPollToken.mockResolvedValue({
      access_token: null,
      error: 'slow_down',
      error_description: null,
    })
    vi.spyOn(window, 'open').mockImplementation(() => null)

    const { result } = renderFlow()
    await act(async () => result.current.startOAuthLogin())

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })

    expect(result.current.error).toBeNull()
    expect(result.current.deviceFlowData).toEqual(deviceCodeResponse)
  })

  it('completes login once the poll returns an access token', async () => {
    mockedDeviceCode.mockResolvedValue(deviceCodeResponse)
    mockedPollToken.mockResolvedValue({
      access_token: 'final-token',
      error: null,
      error_description: null,
    })
    mockedGetUser.mockResolvedValue({
      username: 'someone',
      name: 'Some One',
      email: null,
      avatarUrl: null,
    })
    vi.spyOn(window, 'open').mockImplementation(() => null)
    const onLoginSuccess = vi.fn()

    const { result } = renderFlow(onLoginSuccess)
    await act(async () => result.current.startOAuthLogin())

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })

    expect(onLoginSuccess).toHaveBeenCalledWith(
      'final-token',
      expect.objectContaining({ username: 'someone' })
    )
    expect(result.current.deviceFlowData).toBeNull()
  })

  it('surfaces an OAuth error from the poll response and stops polling', async () => {
    mockedDeviceCode.mockResolvedValue(deviceCodeResponse)
    mockedPollToken.mockResolvedValue({
      access_token: null,
      error: 'access_denied',
      error_description: 'User denied access',
    })
    vi.spyOn(window, 'open').mockImplementation(() => null)

    const { result } = renderFlow()
    await act(async () => result.current.startOAuthLogin())

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })

    expect(result.current.error).toBe('OAuth Error: User denied access')
    expect(result.current.connecting).toBe(false)
    expect(result.current.deviceFlowData).toBeNull()

    // Polling should have stopped — advancing further doesn't call poll again.
    mockedPollToken.mockClear()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })
    expect(mockedPollToken).not.toHaveBeenCalled()
  })

  it('surfaces a thrown polling error', async () => {
    mockedDeviceCode.mockResolvedValue(deviceCodeResponse)
    mockedPollToken.mockRejectedValue(new Error('network down'))
    vi.spyOn(window, 'open').mockImplementation(() => null)

    const { result } = renderFlow()
    await act(async () => result.current.startOAuthLogin())

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })

    expect(result.current.error).toBe('Polling error: network down')
    expect(result.current.connecting).toBe(false)
    expect(result.current.deviceFlowData).toBeNull()
  })

  it('sets an error when requesting the device code itself fails', async () => {
    mockedDeviceCode.mockRejectedValue(new Error('invalid_client'))
    const { result } = renderFlow()
    await act(async () => result.current.startOAuthLogin())
    expect(result.current.error).toBe('invalid_client')
    expect(result.current.connecting).toBe(false)
  })
})

describe('cancelFlow', () => {
  it('clears device flow state and stops polling', async () => {
    mockedDeviceCode.mockResolvedValue(deviceCodeResponse)
    mockedPollToken.mockResolvedValue({
      access_token: null,
      error: 'authorization_pending',
      error_description: null,
    })
    vi.spyOn(window, 'open').mockImplementation(() => null)

    const { result } = renderFlow()
    await act(async () => result.current.startOAuthLogin())

    act(() => result.current.cancelFlow())
    expect(result.current.deviceFlowData).toBeNull()
    expect(result.current.connecting).toBe(false)

    mockedPollToken.mockClear()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })
    expect(mockedPollToken).not.toHaveBeenCalled()
  })
})

describe('cleanup', () => {
  it('clears the polling interval on unmount', async () => {
    mockedDeviceCode.mockResolvedValue(deviceCodeResponse)
    mockedPollToken.mockResolvedValue({
      access_token: null,
      error: 'authorization_pending',
      error_description: null,
    })
    vi.spyOn(window, 'open').mockImplementation(() => null)

    const { result, unmount } = renderFlow()
    await act(async () => result.current.startOAuthLogin())

    unmount()
    mockedPollToken.mockClear()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000)
    })
    expect(mockedPollToken).not.toHaveBeenCalled()
  })
})
