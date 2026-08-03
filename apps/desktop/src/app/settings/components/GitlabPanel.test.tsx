import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ProviderAccount } from '@git-manager/git-types'

const { apiGitlabDeviceCode, apiGitlabPollToken, apiGitlabGetUser } = vi.hoisted(() => ({
  apiGitlabDeviceCode: vi.fn(),
  apiGitlabPollToken: vi.fn(),
  apiGitlabGetUser: vi.fn(),
}))
vi.mock('../../../api/integrations.api', () => ({
  apiGitlabDeviceCode,
  apiGitlabPollToken,
  apiGitlabGetUser,
}))

import { GitlabPanel } from './GitlabPanel'

const DEVICE_CODE = {
  device_code: 'dev-code',
  user_code: 'ABCD-1234',
  verification_uri: 'https://gitlab.com/oauth/device',
  verification_uri_complete: 'https://gitlab.com/oauth/device?user_code=ABCD-1234',
  expires_in: 600,
  interval: 1,
}

function renderPanel(accounts: ProviderAccount[] = [], activeAccountId: string | null = null) {
  const onChange = vi.fn()
  render(<GitlabPanel accounts={accounts} activeAccountId={activeAccountId} onChange={onChange} />)
  return { onChange }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('open', vi.fn())
  apiGitlabDeviceCode.mockResolvedValue(DEVICE_CODE)
  apiGitlabPollToken.mockResolvedValue({ access_token: null, error: 'authorization_pending' })
  apiGitlabGetUser.mockResolvedValue({
    username: 'someone',
    name: 'Some One',
    email: null,
    avatarUrl: null,
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('GitlabPanel — gitlab.com is one click', () => {
  it('starts the device flow with no client id and shows the user code', async () => {
    const user = userEvent.setup()
    renderPanel()
    await user.click(screen.getByTestId('integration-gitlab-connect-button'))

    // `null` client id = "use the application shipped for gitlab.com", like GitHub's.
    await waitFor(() =>
      expect(apiGitlabDeviceCode).toHaveBeenCalledWith('https://gitlab.com', null)
    )
    expect(await screen.findByTestId('gitlab-device-user-code')).toHaveTextContent('ABCD-1234')
  })

  // GitLab hands back a URL with the code already in it; using the bare one would make the user
  // retype what the app already knows.
  it('opens the pre-filled verification URL', async () => {
    const user = userEvent.setup()
    renderPanel()
    await user.click(screen.getByTestId('integration-gitlab-connect-button'))
    await waitFor(() =>
      expect(window.open).toHaveBeenCalledWith(DEVICE_CODE.verification_uri_complete, '_blank')
    )
  })

  it('does not ask for an Application ID on gitlab.com', () => {
    renderPanel()
    expect(screen.queryByTestId('integration-gitlab-client-id-field')).not.toBeInTheDocument()
  })

  it('cancelling stops the flow and returns to the connect button', async () => {
    const user = userEvent.setup()
    renderPanel()
    await user.click(screen.getByTestId('integration-gitlab-connect-button'))
    await screen.findByTestId('gitlab-device-flow-card')

    await user.click(screen.getByTestId('gitlab-device-cancel'))
    expect(screen.queryByTestId('gitlab-device-flow-card')).not.toBeInTheDocument()
    expect(screen.getByTestId('integration-gitlab-connect-button')).toBeEnabled()
  })
})

/**
 * Every GitLab instance keeps its own application registry, so the id shipped for gitlab.com is
 * unknown to a self-hosted server — there is nothing to fall back on, and starting without one
 * would only produce an opaque `invalid_client` from the instance.
 */
describe('GitlabPanel — a self-hosted instance needs its own Application ID', () => {
  it('asks for one as soon as the URL is not gitlab.com, and blocks until it is filled', async () => {
    const user = userEvent.setup()
    renderPanel()
    const host = screen.getByTestId('integration-gitlab-host-input')
    await user.clear(host)
    await user.type(host, 'https://gitlab.acme.dev')

    expect(screen.getByTestId('integration-gitlab-client-id-field')).toBeInTheDocument()
    expect(screen.getByTestId('integration-gitlab-connect-button')).toBeDisabled()

    await user.type(screen.getByTestId('integration-gitlab-client-id-input'), 'self-hosted-id')
    expect(screen.getByTestId('integration-gitlab-connect-button')).toBeEnabled()
  })

  it('sends that instance and that id', async () => {
    const user = userEvent.setup()
    renderPanel()
    const host = screen.getByTestId('integration-gitlab-host-input')
    await user.clear(host)
    // Trailing slash: the URL is built by concatenation, so `//oauth/...` would 404.
    await user.type(host, 'https://gitlab.acme.dev/')
    await user.type(screen.getByTestId('integration-gitlab-client-id-input'), 'self-hosted-id')
    await user.click(screen.getByTestId('integration-gitlab-connect-button'))

    await waitFor(() =>
      expect(apiGitlabDeviceCode).toHaveBeenCalledWith('https://gitlab.acme.dev', 'self-hosted-id')
    )
  })
})

describe('GitlabPanel — accounts', () => {
  it('shows an empty state, then lists a connected account by its display name', () => {
    const { onChange } = renderPanel()
    expect(screen.getByTestId('integration-gitlab-empty')).toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()

    renderPanel(
      [
        {
          id: 'someone@gitlab.com',
          host: 'https://gitlab.com',
          username: 'someone',
          token: 't',
          displayName: 'Some One',
          authMethod: 'oauth',
        },
      ],
      'someone@gitlab.com'
    )
    expect(screen.getByText('Some One')).toBeInTheDocument()
    expect(screen.getByTestId('integration-gitlab-account-active')).toBeInTheDocument()
  })

  it('removing the active account clears the active id', async () => {
    const user = userEvent.setup()
    const { onChange } = renderPanel(
      [{ id: 'a@gitlab.com', host: 'https://gitlab.com', username: 'a', token: 't' }],
      'a@gitlab.com'
    )
    await user.click(screen.getByTestId('integration-gitlab-remove-a@gitlab.com'))
    expect(onChange).toHaveBeenCalledWith({ accounts: [], activeAccountId: null })
  })

  it('surfaces a failed device-code request instead of waiting silently', async () => {
    apiGitlabDeviceCode.mockRejectedValue(new Error('invalid_client'))
    const user = userEvent.setup()
    renderPanel()
    await user.click(screen.getByTestId('integration-gitlab-connect-button'))
    expect(await screen.findByTestId('integration-gitlab-error')).toHaveTextContent(
      /invalid_client/
    )
  })
})
