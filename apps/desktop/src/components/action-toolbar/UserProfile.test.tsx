import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { GitHubAccount } from '@git-manager/git-types'

vi.mock('@git-manager/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

import { UserProfile } from './UserProfile'
import { useSettingsStore } from '../../stores/settings.store'

const DEFAULT_SETTINGS = useSettingsStore.getState().settings

function account(overrides: Partial<GitHubAccount> = {}): GitHubAccount {
  return {
    id: 'acc1',
    token: 'tok',
    user: { login: 'octocat', name: 'The Octocat', email: 'octo@x.com', avatarUrl: 'https://avatar/octo.png' },
    ...overrides,
  }
}

beforeEach(() => {
  useSettingsStore.setState({ settings: DEFAULT_SETTINGS })
})

describe('UserProfile — no linked account', () => {
  it('shows the generic user icon with no default author name', () => {
    render(<UserProfile onOpenSettings={vi.fn()} />)
    const trigger = screen.getByRole('button')
    expect(trigger.querySelector('svg')).not.toBeNull()
  })

  it('shows initials derived from the default git author name', () => {
    useSettingsStore.setState({
      settings: { ...DEFAULT_SETTINGS, git: { ...DEFAULT_SETTINGS.git, defaultAuthorName: 'Jane Doe' } },
    })
    render(<UserProfile onOpenSettings={vi.fn()} />)
    expect(screen.getByRole('button')).toHaveTextContent('JD')
  })

  it('uses the first two letters for a single-word default author name', () => {
    useSettingsStore.setState({
      settings: { ...DEFAULT_SETTINGS, git: { ...DEFAULT_SETTINGS.git, defaultAuthorName: 'Cher' } },
    })
    render(<UserProfile onOpenSettings={vi.fn()} />)
    expect(screen.getByRole('button')).toHaveTextContent('CH')
  })
})

describe('UserProfile — linked GitHub account', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      settings: {
        ...DEFAULT_SETTINGS,
        github: { accounts: [account()], activeAccountId: 'acc1' },
      },
    })
  })

  it('shows the account avatar image', () => {
    render(<UserProfile onOpenSettings={vi.fn()} />)
    expect(screen.getByRole('img', { name: 'The Octocat' })).toHaveAttribute('src', 'https://avatar/octo.png')
  })

  it('shows the account name and email in the dropdown header', async () => {
    const user = userEvent.setup()
    render(<UserProfile onOpenSettings={vi.fn()} />)
    await user.click(screen.getByRole('button'))
    expect(screen.getAllByText('The Octocat').length).toBeGreaterThan(0)
    expect(screen.getByText('octo@x.com')).toBeInTheDocument()
  })

  it('falls back to initials when the account has no avatar', () => {
    useSettingsStore.setState({
      settings: {
        ...DEFAULT_SETTINGS,
        github: { accounts: [account({ user: { ...account().user, avatarUrl: '' } })], activeAccountId: 'acc1' },
      },
    })
    render(<UserProfile onOpenSettings={vi.fn()} />)
    expect(screen.getByRole('button')).toHaveTextContent('TO')
  })

  it('lists other accounts and switches the active account on selection', async () => {
    const user = userEvent.setup()
    useSettingsStore.setState({
      settings: {
        ...DEFAULT_SETTINGS,
        github: {
          accounts: [account({ id: 'acc1' }), account({ id: 'acc2', user: { ...account().user, login: 'other', name: 'Other User' } })],
          activeAccountId: 'acc1',
        },
      },
    })
    render(<UserProfile onOpenSettings={vi.fn()} />)
    await user.click(screen.getByRole('button'))
    await user.click(screen.getByText('Other User'))

    expect(useSettingsStore.getState().settings.github?.activeAccountId).toBe('acc2')
  })

  it('does not show the "switch account" section with only one account', async () => {
    const user = userEvent.setup()
    render(<UserProfile onOpenSettings={vi.fn()} />)
    await user.click(screen.getByRole('button'))
    expect(screen.queryByText('settings.github.switchAccount')).not.toBeInTheDocument()
  })

  it('calls onOpenSettings("integrations") from the "add account" item', async () => {
    const user = userEvent.setup()
    const onOpenSettings = vi.fn()
    render(<UserProfile onOpenSettings={onOpenSettings} />)
    await user.click(screen.getByRole('button'))
    await user.click(screen.getByText('settings.github.addUser'))
    expect(onOpenSettings).toHaveBeenCalledWith('integrations')
  })
})
