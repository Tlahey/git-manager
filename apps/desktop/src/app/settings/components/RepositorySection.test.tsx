import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@git-manager/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('../../../hooks/useUserThemes', () => ({ useUserThemes: () => ({ data: [] }) }))

import { RepositorySection } from './RepositorySection'
import { useSettingsStore } from '../../../stores/settings.store'
import { useRepoUIStore } from '../../../stores/repoUI.store'

const INITIAL_SETTINGS = useSettingsStore.getState()

beforeEach(() => {
  vi.clearAllMocks()
  useSettingsStore.setState(INITIAL_SETTINGS, true)
  useRepoUIStore.setState({ activeRepo: null })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('RepositorySection — no repo', () => {
  it('shows a hint and no controls when no repo is active', () => {
    render(<RepositorySection category="general" />)
    expect(screen.getByTestId('repository-no-repo')).toBeInTheDocument()
    expect(screen.queryByTestId('repo-protected-branches-inherited')).not.toBeInTheDocument()
  })
})

describe('RepositorySection — appearance page', () => {
  const REPO = '/repo'
  beforeEach(() => useRepoUIStore.setState({ activeRepo: REPO }))

  it('shows the repo name and a disabled theme select while inheriting', () => {
    useRepoUIStore.setState({ activeRepo: '/home/me/my-project' })
    render(<RepositorySection category="appearance" />)
    expect(screen.getByTestId('repository-name')).toHaveTextContent('my-project')
    expect(screen.getByTestId('repo-theme-select')).toBeDisabled()
    // General-page controls are not on this page.
    expect(screen.queryByTestId('repo-commit-pattern')).not.toBeInTheDocument()
  })

  it('override seeds the theme from the global value and enables the select', async () => {
    const user = userEvent.setup()
    render(<RepositorySection category="appearance" />)
    await user.click(screen.getByTestId('repo-override-theme-override'))
    expect(useSettingsStore.getState().settings.repoOverrides[REPO]).toEqual({ theme: 'dark' })
    expect(screen.getByTestId('repo-theme-select')).toBeEnabled()
  })

  it('editing the theme select writes the override', async () => {
    const user = userEvent.setup()
    render(<RepositorySection category="appearance" />)
    await user.click(screen.getByTestId('repo-override-theme-override'))
    await user.selectOptions(screen.getByTestId('repo-theme-select'), 'dracula')
    expect(useSettingsStore.getState().settings.repoOverrides[REPO]?.theme).toBe('dracula')
  })

  it('inherit removes the theme override again', async () => {
    const user = userEvent.setup()
    useSettingsStore.getState().setRepoSetting(REPO, 'theme', 'dracula')
    render(<RepositorySection category="appearance" />)
    expect(screen.getByTestId('repo-theme-select')).toBeEnabled()
    await user.click(screen.getByTestId('repo-override-theme-inherit'))
    expect(useSettingsStore.getState().settings.repoOverrides[REPO]).toBeUndefined()
    expect(screen.getByTestId('repo-theme-select')).toBeDisabled()
  })
})

describe('RepositorySection — general page', () => {
  const REPO = '/repo'
  beforeEach(() => useRepoUIStore.setState({ activeRepo: REPO }))

  it('shows only protected branches (read-only while inheriting); theme/commit are on other pages', () => {
    render(<RepositorySection category="general" />)
    expect(screen.getByTestId('repo-protected-branches-inherited')).toBeInTheDocument()
    expect(screen.queryByTestId('repo-protected-branches')).not.toBeInTheDocument()
    expect(screen.queryByTestId('repo-theme-select')).not.toBeInTheDocument()
    expect(screen.queryByTestId('repo-commit-pattern')).not.toBeInTheDocument()
  })

  it('previews the inherited global protected branches', () => {
    render(<RepositorySection category="general" />)
    expect(screen.getByTestId('repo-protected-branches-inherited')).toHaveTextContent(
      'main, master, develop'
    )
  })

  it('overriding protected branches swaps in the editable tag input seeded from global', async () => {
    const user = userEvent.setup()
    render(<RepositorySection category="general" />)
    await user.click(screen.getByTestId('repo-override-protectedBranches-override'))
    expect(useSettingsStore.getState().settings.repoOverrides[REPO]?.protectedBranches).toEqual([
      'main',
      'master',
      'develop',
    ])
    const tagInput = screen.getByTestId('repo-protected-branches').querySelector('input')!
    await user.type(tagInput, 'release{Enter}')
    expect(useSettingsStore.getState().settings.repoOverrides[REPO]?.protectedBranches).toContain(
      'release'
    )
  })
})

describe('RepositorySection — ai_commit page', () => {
  const REPO = '/repo'
  beforeEach(() => useRepoUIStore.setState({ activeRepo: REPO }))

  it('shows the commit-style controls disabled while inheriting; protected branches is elsewhere', () => {
    render(<RepositorySection category="ai_commit" />)
    expect(screen.getByTestId('repo-commit-instructions')).toBeDisabled()
    expect(screen.getByTestId('repo-commit-pattern')).toBeDisabled()
    expect(screen.queryByTestId('repo-protected-branches-inherited')).not.toBeInTheDocument()
  })

  it('overriding and editing the commit pattern writes the override', async () => {
    const user = userEvent.setup()
    render(<RepositorySection category="ai_commit" />)
    await user.click(screen.getByTestId('repo-override-commitPattern-override'))
    await user.type(screen.getByTestId('repo-commit-pattern'), '^x')
    expect(useSettingsStore.getState().settings.repoOverrides[REPO]?.commitPattern).toBe('^x')
  })

  it('keeps the other commit field inheriting when only one is overridden', async () => {
    const user = userEvent.setup()
    render(<RepositorySection category="ai_commit" />)
    await user.click(screen.getByTestId('repo-override-commitInstructions-override'))
    expect(screen.getByTestId('repo-commit-pattern')).toBeDisabled()
  })
})
