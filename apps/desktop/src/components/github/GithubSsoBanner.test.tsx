import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GithubSsoBanner } from './GithubSsoBanner'
import { useGithubTokenStatusStore } from '../../stores/githubTokenStatus.store'

const openUrl = vi.hoisted(() => vi.fn())
vi.mock('../../lib/openUrl', () => ({ openUrl }))

const AUTHORIZE_URL = 'https://github.com/orgs/acme/sso?authorization_request=abc'

function challenge(over: Partial<{ required: boolean; authorizeUrl: string | null }> = {}) {
  return { required: true, organizations: [], authorizeUrl: AUTHORIZE_URL, ...over }
}

beforeEach(() => {
  openUrl.mockClear()
  useGithubTokenStatusStore.setState({ ssoByAccount: {} })
})

describe('GithubSsoBanner', () => {
  it('shows nothing for an account GitHub has not refused', () => {
    useGithubTokenStatusStore.setState({ ssoByAccount: { octocat: null } })
    render(<GithubSsoBanner accountId="octocat" />)
    expect(screen.queryByTestId('github-sso-banner')).toBeNull()
  })

  it('shows nothing when no account is connected', () => {
    render(<GithubSsoBanner accountId={null} />)
    expect(screen.queryByTestId('github-sso-banner')).toBeNull()
  })

  it('explains the refusal rather than leaving the screen empty', () => {
    useGithubTokenStatusStore.setState({ ssoByAccount: { octocat: challenge() } })
    render(<GithubSsoBanner accountId="octocat" />)
    expect(screen.getByText('This token has not been authorized for the organization')).toBeTruthy()
  })

  it('opens the authorization link GitHub supplied, verbatim', async () => {
    useGithubTokenStatusStore.setState({ ssoByAccount: { octocat: challenge() } })
    render(<GithubSsoBanner accountId="octocat" />)

    await userEvent.click(screen.getByTestId('github-sso-authorize-button'))

    // The signed `authorization_request` parameter must survive intact — a rebuilt URL is a dead
    // link, which is why the header's own URL is carried all the way here.
    expect(openUrl).toHaveBeenCalledWith(AUTHORIZE_URL)
  })

  it('offers no button when GitHub named no authorization URL', () => {
    useGithubTokenStatusStore.setState({
      ssoByAccount: { octocat: challenge({ authorizeUrl: null }) },
    })
    render(<GithubSsoBanner accountId="octocat" />)
    expect(screen.getByTestId('github-sso-banner')).toBeTruthy()
    expect(screen.queryByTestId('github-sso-authorize-button')).toBeNull()
  })

  it('stays quiet for the partial-results form, which rides along with a working response', () => {
    useGithubTokenStatusStore.setState({
      ssoByAccount: { octocat: challenge({ required: false }) },
    })
    render(<GithubSsoBanner accountId="octocat" />)
    expect(screen.queryByTestId('github-sso-banner')).toBeNull()
  })
})
