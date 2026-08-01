import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// The real page is covered by its own test; here only the wiring of the embedded view matters.
vi.mock('../../settings/SettingsPage', () => ({
  SettingsPage: (props: { embedded?: boolean; initialScope?: string }) => (
    <div data-testid="fake-settings-page">
      <span data-testid="settings-embedded">{String(props.embedded)}</span>
      <span data-testid="settings-scope">{props.initialScope ?? ''}</span>
    </div>
  ),
}))

import { RepoSettingsView } from './RepoSettingsView'

describe('RepoSettingsView', () => {
  it('embeds the Settings page on the Repository scope', () => {
    render(<RepoSettingsView />)
    expect(screen.getByTestId('settings-embedded')).toHaveTextContent('true')
    expect(screen.getByTestId('settings-scope')).toHaveTextContent('local')
  })

  it('is a tab panel labelled by its tab', () => {
    render(<RepoSettingsView />)
    const panel = screen.getByTestId('repo-settings-view')
    expect(panel).toHaveAttribute('role', 'tabpanel')
    expect(panel).toHaveAttribute('aria-labelledby', 'repo-view-tab-settings')
  })
})
