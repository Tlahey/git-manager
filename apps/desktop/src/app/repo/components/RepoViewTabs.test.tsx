import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RepoViewTabs } from './RepoViewTabs'
import { useRepoViewTabsStore } from '../../../stores/repoViewTabs.store'
import { renderWithLanguage } from '../../../test/i18n'

beforeEach(() => useRepoViewTabsStore.setState({ byPath: {} }))

describe('RepoViewTabs', () => {
  it('renders one tab per view, labelled in English', () => {
    render(<RepoViewTabs tabPath="/repo" />)
    expect(screen.getByTestId('repo-view-tabs')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Graph' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Terminal' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Settings' })).toBeInTheDocument()
    expect(screen.getByRole('tablist', { name: 'Repository views' })).toBeInTheDocument()
  })

  it('translates the labels', () => {
    renderWithLanguage(<RepoViewTabs tabPath="/repo" />, 'fr')
    expect(screen.getByRole('tab', { name: 'Graphe' })).toBeInTheDocument()
    expect(screen.getByRole('tablist', { name: 'Vues du dépôt' })).toBeInTheDocument()
  })

  it('marks Graph as the selected tab by default', () => {
    render(<RepoViewTabs tabPath="/repo" />)
    expect(screen.getByTestId('repo-view-tab-graph')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('repo-view-tab-terminal')).toHaveAttribute('aria-selected', 'false')
  })

  it('selects the clicked view for this tab path', async () => {
    const user = userEvent.setup()
    render(<RepoViewTabs tabPath="/repo" />)
    await user.click(screen.getByTestId('repo-view-tab-terminal'))
    expect(useRepoViewTabsStore.getState().activeViewFor('/repo')).toBe('terminal')
    expect(screen.getByTestId('repo-view-tab-terminal')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('repo-view-tab-graph')).toHaveAttribute('aria-selected', 'false')
  })

  it('reads the view of its own tab path only', () => {
    useRepoViewTabsStore.setState({ byPath: { '/other': 'settings', '/repo': 'terminal' } })
    render(<RepoViewTabs tabPath="/repo" />)
    expect(screen.getByTestId('repo-view-tab-terminal')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('repo-view-tab-settings')).toHaveAttribute('aria-selected', 'false')
  })

  it('moves between tabs with the arrow keys, wrapping around', async () => {
    const user = userEvent.setup()
    render(<RepoViewTabs tabPath="/repo" />)
    screen.getByTestId('repo-view-tab-graph').focus()
    await user.keyboard('{ArrowRight}')
    expect(useRepoViewTabsStore.getState().activeViewFor('/repo')).toBe('terminal')
    expect(screen.getByTestId('repo-view-tab-terminal')).toHaveFocus()
    await user.keyboard('{ArrowLeft}{ArrowLeft}')
    expect(useRepoViewTabsStore.getState().activeViewFor('/repo')).toBe('settings')
    expect(screen.getByTestId('repo-view-tab-settings')).toHaveFocus()
  })
})
