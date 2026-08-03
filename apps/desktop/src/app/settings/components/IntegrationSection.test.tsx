import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('./GithubSection', () => ({ GithubSection: () => <div data-testid="github-section" /> }))

// Built, tested, and deliberately not listed — see `AVAILABLE_PROVIDERS`. Mocked so this file
// asserts what the screen *offers*, not what those panels do (they have their own tests).
vi.mock('./GitlabPanel', () => ({
  GitlabPanel: () => <div data-testid="integration-panel-gitlab" />,
}))
vi.mock('./TokenProviderPanel', () => ({
  TokenProviderPanel: (props: { provider: string }) => (
    <div data-testid={`integration-panel-${props.provider}`} />
  ),
}))
vi.mock('../../../api/integrations.api', () => ({ apiBitbucketGetUser: vi.fn() }))

import { IntegrationSection } from './IntegrationSection'
import { useSettingsStore } from '../../../stores/settings.store'

const INITIAL_SETTINGS = useSettingsStore.getState()

beforeEach(() => {
  vi.clearAllMocks()
  useSettingsStore.setState(INITIAL_SETTINGS, true)
})

describe('IntegrationSection', () => {
  it('shows GitHub', () => {
    render(<IntegrationSection />)
    expect(screen.getByTestId('github-section')).toBeInTheDocument()
  })

  // GitLab needs an OAuth application nobody has registered yet, and nothing in the app reads
  // either account — so both would offer to connect and then do nothing with the result.
  it('does not offer GitLab or Bitbucket while they are unavailable', () => {
    render(<IntegrationSection />)
    expect(screen.queryByTestId('integration-provider-gitlab')).not.toBeInTheDocument()
    expect(screen.queryByTestId('integration-provider-bitbucket')).not.toBeInTheDocument()
    expect(screen.queryByTestId('integration-panel-gitlab')).not.toBeInTheDocument()
    expect(screen.queryByTestId('integration-panel-bitbucket')).not.toBeInTheDocument()
  })

  // A column headed "Providers" listing a single entry is a chooser with nothing to choose.
  it('hides the provider rail while only one provider is available', () => {
    render(<IntegrationSection />)
    expect(screen.queryByTestId('integration-providers')).not.toBeInTheDocument()
  })
})
