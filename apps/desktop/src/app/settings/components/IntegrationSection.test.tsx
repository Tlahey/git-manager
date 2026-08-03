import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('./GithubSection', () => ({ GithubSection: () => <div data-testid="github-section" /> }))

import { IntegrationSection } from './IntegrationSection'
import { useSettingsStore } from '../../../stores/settings.store'

const INITIAL_SETTINGS = useSettingsStore.getState()

beforeEach(() => {
  useSettingsStore.setState(INITIAL_SETTINGS, true)
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
    expect(screen.getByText('GitLab Integration')).toBeInTheDocument()
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

describe.each([
  {
    provider: 'gitlab' as const,
    emptyLabel: 'No GitLab account connected',
    accountsKey: 'gitlabAccounts' as const,
    activeKey: 'gitlabActiveAccountId' as const,
    defaultHost: 'https://gitlab.com',
  },
  {
    provider: 'bitbucket' as const,
    emptyLabel: 'No Bitbucket account connected',
    accountsKey: 'bitbucketAccounts' as const,
    activeKey: 'bitbucketActiveAccountId' as const,
    defaultHost: 'https://bitbucket.org',
  },
])(
  'IntegrationSection — $provider',
  ({ provider, emptyLabel, accountsKey, activeKey, defaultHost }) => {
    async function openProvider() {
      const user = userEvent.setup()
      render(<IntegrationSection />)
      await user.click(screen.getByTestId(`integration-provider-${provider}`))
      return user
    }

    it('shows an empty state with no accounts', async () => {
      await openProvider()
      expect(screen.getByText(emptyLabel)).toBeInTheDocument()
      expect(screen.getByTestId(`integration-${provider}-empty`)).toBeInTheDocument()
    })

    it('disables the connect button until both username and token are filled', async () => {
      const user = await openProvider()
      const button = screen.getByTestId(`integration-${provider}-connect-button`)
      expect(button).toBeDisabled()
      await user.type(screen.getByTestId(`integration-${provider}-username-input`), 'someone')
      expect(button).toBeDisabled()
      await user.type(screen.getByTestId(`integration-${provider}-token-input`), 'secret-token')
      expect(button).toBeEnabled()
    })

    it('connects a new account after a simulated delay, clears the form, and marks it active', async () => {
      vi.useFakeTimers()
      render(<IntegrationSection />)
      fireEvent.click(screen.getByTestId(`integration-provider-${provider}`))
      fireEvent.change(screen.getByTestId(`integration-${provider}-username-input`), {
        target: { value: 'someone' },
      })
      fireEvent.change(screen.getByTestId(`integration-${provider}-token-input`), {
        target: { value: 'secret-token' },
      })
      fireEvent.click(screen.getByTestId(`integration-${provider}-connect-button`))

      expect(screen.getByText('Connecting...')).toBeInTheDocument()
      await act(async () => vi.advanceTimersByTime(800))

      const accounts = useSettingsStore.getState().settings.integrations![accountsKey]
      expect(accounts).toEqual([
        {
          id: `someone@${defaultHost.replace('https://', '')}`,
          host: defaultHost,
          username: 'someone',
          token: 'secret-token',
        },
      ])
      expect(useSettingsStore.getState().settings.integrations![activeKey]).toBe(accounts[0].id)
      expect(screen.getByTestId(`integration-${provider}-username-input`)).toHaveValue('')
      vi.useRealTimers()
    })

    it('lists connected accounts, activates an inactive one, and removes an account', async () => {
      const accountId = `someone@gitlab.example.com`
      useSettingsStore.setState({
        settings: {
          ...INITIAL_SETTINGS.settings,
          integrations: {
            gitlabAccounts: [],
            gitlabActiveAccountId: null,
            bitbucketAccounts: [],
            bitbucketActiveAccountId: null,
            [accountsKey]: [
              {
                id: accountId,
                host: 'https://gitlab.example.com',
                username: 'someone',
                token: 't',
              },
              { id: 'other@host.com', host: 'https://host.com', username: 'other', token: 't2' },
            ],
            [activeKey]: 'other@host.com',
          },
        },
      })
      const user = await openProvider()
      expect(screen.getByTestId(`integration-${provider}-account-${accountId}`)).toBeInTheDocument()
      expect(screen.getByText('someone')).toBeInTheDocument()
      expect(screen.getByText('Active')).toBeInTheDocument() // only the active one shows this badge

      await user.click(screen.getByTestId(`integration-${provider}-set-active-${accountId}`))
      expect(useSettingsStore.getState().settings.integrations![activeKey]).toBe(accountId)

      await user.click(screen.getByTestId(`integration-${provider}-remove-${accountId}`))
      expect(
        useSettingsStore.getState().settings.integrations![accountsKey].map((a) => a.id)
      ).toEqual(['other@host.com'])
    })

    it('falls back to another remaining account when the active one is removed', async () => {
      useSettingsStore.setState({
        settings: {
          ...INITIAL_SETTINGS.settings,
          integrations: {
            gitlabAccounts: [],
            gitlabActiveAccountId: null,
            bitbucketAccounts: [],
            bitbucketActiveAccountId: null,
            [accountsKey]: [
              { id: 'a@host.com', host: 'https://host.com', username: 'a', token: 't' },
              { id: 'b@host.com', host: 'https://host.com', username: 'b', token: 't2' },
            ],
            [activeKey]: 'a@host.com',
          },
        },
      })
      const user = await openProvider()
      await user.click(screen.getByTestId(`integration-${provider}-remove-a@host.com`))
      expect(useSettingsStore.getState().settings.integrations![activeKey]).toBe('b@host.com')
    })

    it('falls back to null when the only (active) account is removed', async () => {
      useSettingsStore.setState({
        settings: {
          ...INITIAL_SETTINGS.settings,
          integrations: {
            gitlabAccounts: [],
            gitlabActiveAccountId: null,
            bitbucketAccounts: [],
            bitbucketActiveAccountId: null,
            [accountsKey]: [
              { id: 'a@host.com', host: 'https://host.com', username: 'a', token: 't' },
            ],
            [activeKey]: 'a@host.com',
          },
        },
      })
      const user = await openProvider()
      await user.click(screen.getByTestId(`integration-${provider}-remove-a@host.com`))
      expect(useSettingsStore.getState().settings.integrations![activeKey]).toBeNull()
      expect(screen.getByText(emptyLabel)).toBeInTheDocument()
    })
  }
)
