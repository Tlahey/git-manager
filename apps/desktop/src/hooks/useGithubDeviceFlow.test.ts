import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

vi.mock('../api/github.api', () => ({
  apiGithubDeviceCode: vi.fn(),
  apiGithubGetUser: vi.fn(),
  apiGithubPollToken: vi.fn(),
}))

import { apiGithubDeviceCode, apiGithubGetUser, apiGithubPollToken } from '../api/github.api'
import { useGithubDeviceFlow } from './useGithubDeviceFlow'

const mockedDeviceCode = apiGithubDeviceCode as unknown as ReturnType<typeof vi.fn>
const mockedGetUser = apiGithubGetUser as unknown as ReturnType<typeof vi.fn>
const mockedPollToken = apiGithubPollToken as unknown as ReturnType<typeof vi.fn>

const deviceCodeResponse = {
  device_code: 'device-1',
  user_code: 'ABCD-1234',
  verification_uri: 'https://github.com/login/device',
  expires_in: 900,
  interval: 5,
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('completeLoginWithToken', () => {
  it('fetches the user, maps it, and calls onLoginSuccess', async () => {
    mockedGetUser.mockResolvedValue({
      login: 'octocat',
      name: 'The Octocat',
      email: 'octo@x.com',
      avatarUrl: 'a.png',
    })
    const onLoginSuccess = vi.fn()
    const { result } = renderHook(() => useGithubDeviceFlow({ onLoginSuccess }))

    let success: boolean | undefined
    await act(async () => {
      success = await result.current.completeLoginWithToken('tok')
    })

    expect(success).toBe(true)
    expect(onLoginSuccess).toHaveBeenCalledWith('tok', {
      login: 'octocat',
      name: 'The Octocat',
      email: 'octo@x.com',
      avatarUrl: 'a.png',
    })
    expect(result.current.connecting).toBe(false)
  })

  it('falls back the display name to the login when the user has no name', async () => {
    mockedGetUser.mockResolvedValue({ login: 'octocat', name: null, email: null, avatarUrl: '' })
    const onLoginSuccess = vi.fn()
    const { result } = renderHook(() => useGithubDeviceFlow({ onLoginSuccess }))
    await act(async () => result.current.completeLoginWithToken('tok'))
    expect(onLoginSuccess).toHaveBeenCalledWith('tok', expect.objectContaining({ name: 'octocat' }))
  })

  it('sets an error and returns false on failure', async () => {
    mockedGetUser.mockRejectedValue(new Error('bad token'))
    const { result } = renderHook(() => useGithubDeviceFlow({ onLoginSuccess: vi.fn() }))

    let success: boolean | undefined
    await act(async () => {
      success = await result.current.completeLoginWithToken('bad')
    })

    expect(success).toBe(false)
    expect(result.current.error).toBe('bad token')
    expect(result.current.connecting).toBe(false)
  })
})

describe('startOAuthLogin', () => {
  it('fetches the device code, stores it, and opens the verification URL', async () => {
    mockedDeviceCode.mockResolvedValue(deviceCodeResponse)
    mockedPollToken.mockResolvedValue({
      access_token: null,
      error: 'authorization_pending',
      error_description: null,
    })
    const windowOpen = vi.spyOn(window, 'open').mockImplementation(() => null)

    const { result } = renderHook(() => useGithubDeviceFlow({ onLoginSuccess: vi.fn() }))
    await act(async () => result.current.startOAuthLogin())

    expect(result.current.deviceFlowData).toEqual(deviceCodeResponse)
    expect(windowOpen).toHaveBeenCalledWith('https://github.com/login/device', '_blank')
  })

  it('does not keep polling data (still connecting) while the user has not authorized yet', async () => {
    mockedDeviceCode.mockResolvedValue(deviceCodeResponse)
    mockedPollToken.mockResolvedValue({
      access_token: null,
      error: 'authorization_pending',
      error_description: null,
    })
    vi.spyOn(window, 'open').mockImplementation(() => null)

    const { result } = renderHook(() => useGithubDeviceFlow({ onLoginSuccess: vi.fn() }))
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
    mockedGetUser.mockResolvedValue({ login: 'octocat', name: 'Octo', email: null, avatarUrl: '' })
    vi.spyOn(window, 'open').mockImplementation(() => null)
    const onLoginSuccess = vi.fn()

    const { result } = renderHook(() => useGithubDeviceFlow({ onLoginSuccess }))
    await act(async () => result.current.startOAuthLogin())

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })

    expect(onLoginSuccess).toHaveBeenCalledWith(
      'final-token',
      expect.objectContaining({ login: 'octocat' })
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

    const { result } = renderHook(() => useGithubDeviceFlow({ onLoginSuccess: vi.fn() }))
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
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { result } = renderHook(() => useGithubDeviceFlow({ onLoginSuccess: vi.fn() }))
    await act(async () => result.current.startOAuthLogin())

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })

    expect(result.current.error).toBe('Polling error: network down')
    expect(errorSpy).toHaveBeenCalled()
  })

  it('sets an error when requesting the device code itself fails', async () => {
    mockedDeviceCode.mockRejectedValue(new Error('rate limited'))
    const { result } = renderHook(() => useGithubDeviceFlow({ onLoginSuccess: vi.fn() }))
    await act(async () => result.current.startOAuthLogin())
    expect(result.current.error).toBe('rate limited')
    expect(result.current.connecting).toBe(false)
  })

  it('does not open a window when verification_uri is absent', async () => {
    mockedDeviceCode.mockResolvedValue({ ...deviceCodeResponse, verification_uri: '' })
    mockedPollToken.mockResolvedValue({
      access_token: null,
      error: 'authorization_pending',
      error_description: null,
    })
    const windowOpen = vi.spyOn(window, 'open').mockImplementation(() => null)
    const { result } = renderHook(() => useGithubDeviceFlow({ onLoginSuccess: vi.fn() }))
    await act(async () => result.current.startOAuthLogin())
    expect(windowOpen).not.toHaveBeenCalled()
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

    const { result } = renderHook(() => useGithubDeviceFlow({ onLoginSuccess: vi.fn() }))
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

    const { result, unmount } = renderHook(() => useGithubDeviceFlow({ onLoginSuccess: vi.fn() }))
    await act(async () => result.current.startOAuthLogin())

    unmount()
    mockedPollToken.mockClear()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000)
    })
    expect(mockedPollToken).not.toHaveBeenCalled()
  })
})
