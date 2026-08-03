import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('./GithubSection', () => ({ GithubSection: () => <div data-testid="github-section" /> }))

const { apiBitbucketGetUser } = vi.hoisted(() => ({ apiBitbucketGetUser: vi.fn() }))
vi.mock('../../../api/integrations.api', () => ({ apiBitbucketGetUser }))

// The GitLab panel drives a real OAuth device flow; its own behaviour is covered by
// `GitlabPanel.test.tsx`. Here it only needs to be the thing that renders for that provider.
vi.mock('./GitlabPanel', () => ({
  GitlabPanel: () => <div data-testid="integration-panel-gitlab" />,
}))

import { IntegrationSection } from './IntegrationSection'
import { useSettingsStore } from '../../../stores/settings.store'

const INITIAL_SETTINGS = useSettingsStore.getState()

beforeEach(() => {
  vi.clearAllMocks()
  useSettingsStore.setState(INITIAL_SETTINGS, true)
  apiBitbucketGetUser.mockResolvedValue({
    accountId: 'acc-1',
    displayName: 'Someone',
    nickname: 'someone',
    avatarUrl: null,
  })
})

describe('IntegrationSection — provider navigation', () => {
  it('shows GitHub by default', () => {
    render(<IntegrationSection />)
    expect(screen.getByTestId('github-section')).toBeInTheDocument()
  })

  it('switches to GitLab and Bitbucket, hiding GitHub', async () => {
    const user = userEvent.setup()
    render(<IntegrationSection />)
    await user.click(screen.getByTestId('integration-provider-gitlab'))
    expect(screen.getByTestId('integration-panel-gitlab')).toBeInTheDocument()
    expect(screen.queryByTestId('github-section')).not.toBeInTheDocument()

    await user.click(screen.getByTestId('integration-provider-bitbucket'))
    expect(screen.getByTestId('integration-panel-bitbucket')).toBeInTheDocument()
    expect(screen.queryByTestId('integration-panel-gitlab')).not.toBeInTheDocument()
  })

  it('marks the selected provider so the choice is readable from outside', async () => {
    const user = userEvent.setup()
    render(<IntegrationSection />)
    expect(screen.getByTestId('integration-provider-github')).toHaveAttribute('data-active', 'true')
    await user.click(screen.getByTestId('integration-provider-gitlab'))
    expect(screen.getByTestId('integration-provider-gitlab')).toHaveAttribute('data-active', 'true')
    expect(screen.getByTestId('integration-provider-github')).toHaveAttribute(
      'data-active',
      'false'
    )
  })
})

/**
 * Bitbucket is the one provider that still takes a typed token: Atlassian supports no device grant,
 * and the authorization-code alternative needs a redirect URI (so a local HTTP server). What it
 * must not do is *accept it blindly*, which is what the previous `setTimeout` stub did.
 */
describe('IntegrationSection — Bitbucket', () => {
  async function openBitbucket() {
    const user = userEvent.setup()
    render(<IntegrationSection />)
    await user.click(screen.getByTestId('integration-provider-bitbucket'))
    return user
  }

  function seedAccounts(bitbucketAccounts: unknown[], bitbucketActiveAccountId: string | null) {
    useSettingsStore.setState({
      settings: {
        ...INITIAL_SETTINGS.settings,
        integrations: {
          gitlabAccounts: [],
          gitlabActiveAccountId: null,
          bitbucketAccounts: bitbucketAccounts as never,
          bitbucketActiveAccountId,
        },
      },
    })
  }

  const bitbucket = () => useSettingsStore.getState().settings.integrations!

  it('shows an empty state with no accounts', async () => {
    await openBitbucket()
    expect(screen.getByText('No Bitbucket account connected')).toBeInTheDocument()
    expect(screen.getByTestId('integration-bitbucket-empty')).toBeInTheDocument()
  })

  it('disables the connect button until both username and token are filled', async () => {
    const user = await openBitbucket()
    const button = screen.getByTestId('integration-bitbucket-connect-button')
    expect(button).toBeDisabled()
    await user.type(screen.getByTestId('integration-bitbucket-username-input'), 'someone')
    expect(button).toBeDisabled()
    await user.type(screen.getByTestId('integration-bitbucket-token-input'), 'secret-token')
    expect(button).toBeEnabled()
  })

  it('verifies the credentials against Bitbucket before storing them', async () => {
    const user = await openBitbucket()
    await user.type(screen.getByTestId('integration-bitbucket-username-input'), 'someone')
    await user.type(screen.getByTestId('integration-bitbucket-token-input'), 'secret-token')
    await user.click(screen.getByTestId('integration-bitbucket-connect-button'))

    await waitFor(() => expect(apiBitbucketGetUser).toHaveBeenCalledWith('someone', 'secret-token'))
    await waitFor(() =>
      expect(bitbucket().bitbucketAccounts).toEqual([
        expect.objectContaining({
          id: 'someone@bitbucket.org',
          host: 'https://bitbucket.org',
          username: 'someone',
          token: 'secret-token',
          displayName: 'Someone',
          authMethod: 'token',
        }),
      ])
    )
  })

  // The whole point of the change: a rejected credential must not become a stored account.
  it('stores nothing and reports the failure when Bitbucket rejects the credentials', async () => {
    apiBitbucketGetUser.mockRejectedValue(new Error('Bitbucket rejected those credentials.'))
    const user = await openBitbucket()
    await user.type(screen.getByTestId('integration-bitbucket-username-input'), 'someone')
    await user.type(screen.getByTestId('integration-bitbucket-token-input'), 'wrong')
    await user.click(screen.getByTestId('integration-bitbucket-connect-button'))

    expect(await screen.findByTestId('integration-bitbucket-error')).toHaveTextContent(
      /rejected those credentials/
    )
    expect(bitbucket().bitbucketAccounts).toEqual([])
  })

  it('lists connected accounts, activates an inactive one, and removes an account', async () => {
    seedAccounts(
      [
        { id: 'someone@host.com', host: 'https://host.com', username: 'someone', token: 't' },
        { id: 'other@host.com', host: 'https://host.com', username: 'other', token: 't2' },
      ],
      'other@host.com'
    )
    const user = await openBitbucket()
    expect(screen.getByTestId('integration-bitbucket-account-someone@host.com')).toBeInTheDocument()
    expect(screen.getByText('Active')).toBeInTheDocument() // only the active one shows this badge

    await user.click(screen.getByTestId('integration-bitbucket-set-active-someone@host.com'))
    expect(bitbucket().bitbucketActiveAccountId).toBe('someone@host.com')

    await user.click(screen.getByTestId('integration-bitbucket-remove-someone@host.com'))
    expect(bitbucket().bitbucketAccounts.map((a) => a.id)).toEqual(['other@host.com'])
  })

  it('falls back to another remaining account when the active one is removed', async () => {
    seedAccounts(
      [
        { id: 'a@host.com', host: 'https://host.com', username: 'a', token: 't' },
        { id: 'b@host.com', host: 'https://host.com', username: 'b', token: 't2' },
      ],
      'a@host.com'
    )
    const user = await openBitbucket()
    await user.click(screen.getByTestId('integration-bitbucket-remove-a@host.com'))
    expect(bitbucket().bitbucketActiveAccountId).toBe('b@host.com')
  })

  it('falls back to null when the only (active) account is removed', async () => {
    seedAccounts(
      [{ id: 'a@host.com', host: 'https://host.com', username: 'a', token: 't' }],
      'a@host.com'
    )
    const user = await openBitbucket()
    await user.click(screen.getByTestId('integration-bitbucket-remove-a@host.com'))
    expect(bitbucket().bitbucketActiveAccountId).toBeNull()
    expect(screen.getByText('No Bitbucket account connected')).toBeInTheDocument()
  })
})
