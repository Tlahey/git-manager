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
    await user.click(screen.getByText('GitLab'))
    expect(screen.getByText('Intégration GitLab')).toBeInTheDocument()
    expect(screen.queryByTestId('github-section')).not.toBeInTheDocument()

    await user.click(screen.getByText('Bitbucket'))
    expect(screen.getByText('Intégration Bitbucket')).toBeInTheDocument()
    expect(screen.queryByText('Intégration GitLab')).not.toBeInTheDocument()
  })
})

describe.each([
  {
    provider: 'gitlab' as const,
    navLabel: 'GitLab',
    connectLabel: 'Ajouter le compte GitLab',
    emptyLabel: 'Aucun compte GitLab connecté',
    userPlaceholder: 'Ex: adupont',
    tokenPlaceholder: 'glpat-...',
    accountsKey: 'gitlabAccounts' as const,
    activeKey: 'gitlabActiveAccountId' as const,
    defaultHost: 'https://gitlab.com',
  },
  {
    provider: 'bitbucket' as const,
    navLabel: 'Bitbucket',
    connectLabel: 'Ajouter le compte Bitbucket',
    emptyLabel: 'Aucun compte Bitbucket connecté',
    userPlaceholder: 'Ex: antoine-d',
    tokenPlaceholder: "Saisissez votre mot de passe d'application",
    accountsKey: 'bitbucketAccounts' as const,
    activeKey: 'bitbucketActiveAccountId' as const,
    defaultHost: 'https://bitbucket.org',
  },
])('IntegrationSection — $provider', ({ navLabel, connectLabel, emptyLabel, userPlaceholder, tokenPlaceholder, accountsKey, activeKey, defaultHost }) => {
  async function openProvider() {
    const user = userEvent.setup()
    render(<IntegrationSection />)
    await user.click(screen.getByText(navLabel))
    return user
  }

  it('shows an empty state with no accounts', async () => {
    await openProvider()
    expect(screen.getByText(emptyLabel)).toBeInTheDocument()
  })

  it('disables the connect button until both username and token are filled', async () => {
    const user = await openProvider()
    const button = screen.getByText(connectLabel).closest('button')!
    expect(button).toBeDisabled()
    await user.type(screen.getByPlaceholderText(userPlaceholder), 'someone')
    expect(button).toBeDisabled()
    await user.type(screen.getByPlaceholderText(tokenPlaceholder), 'secret-token')
    expect(button).toBeEnabled()
  })

  it('connects a new account after a simulated delay, clears the form, and marks it active', async () => {
    vi.useFakeTimers()
    render(<IntegrationSection />)
    fireEvent.click(screen.getByText(navLabel))
    fireEvent.change(screen.getByPlaceholderText(userPlaceholder), { target: { value: 'someone' } })
    fireEvent.change(screen.getByPlaceholderText(tokenPlaceholder), { target: { value: 'secret-token' } })
    fireEvent.click(screen.getByText(connectLabel).closest('button')!)

    expect(screen.getByText('Connexion...')).toBeInTheDocument()
    await act(async () => vi.advanceTimersByTime(800))

    const accounts = useSettingsStore.getState().settings.integrations![accountsKey]
    expect(accounts).toEqual([{ id: `someone@${defaultHost.replace('https://', '')}`, host: defaultHost, username: 'someone', token: 'secret-token' }])
    expect(useSettingsStore.getState().settings.integrations![activeKey]).toBe(accounts[0].id)
    expect(screen.getByPlaceholderText(userPlaceholder)).toHaveValue('')
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
            { id: accountId, host: 'https://gitlab.example.com', username: 'someone', token: 't' },
            { id: 'other@host.com', host: 'https://host.com', username: 'other', token: 't2' },
          ],
          [activeKey]: 'other@host.com',
        },
      },
    })
    const user = await openProvider()
    expect(screen.getByText('someone')).toBeInTheDocument()
    expect(screen.getByText('Actif')).toBeInTheDocument() // only the active one shows this badge

    await user.click(screen.getByText('Activer'))
    expect(useSettingsStore.getState().settings.integrations![activeKey]).toBe(accountId)

    const removeButtons = screen.getAllByRole('button', { name: '' }).filter((b) => b.querySelector('.lucide-trash2'))
    await user.click(removeButtons[0])
    expect(useSettingsStore.getState().settings.integrations![accountsKey].map((a) => a.id)).toEqual(['other@host.com'])
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
    const removeButtons = screen.getAllByRole('button', { name: '' }).filter((b) => b.querySelector('.lucide-trash2'))
    await user.click(removeButtons[0])
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
          [accountsKey]: [{ id: 'a@host.com', host: 'https://host.com', username: 'a', token: 't' }],
          [activeKey]: 'a@host.com',
        },
      },
    })
    const user = await openProvider()
    const removeButton = screen.getAllByRole('button', { name: '' }).find((b) => b.querySelector('.lucide-trash2'))!
    await user.click(removeButton)
    expect(useSettingsStore.getState().settings.integrations![activeKey]).toBeNull()
    expect(screen.getByText(emptyLabel)).toBeInTheDocument()
  })
})
