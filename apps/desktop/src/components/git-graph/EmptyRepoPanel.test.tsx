import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('@git-manager/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}:${JSON.stringify(opts)}` : key,
  }),
}))

const { apiCreateCommit, apiGetRemotes, apiPushBranch } = vi.hoisted(() => ({
  apiCreateCommit: vi.fn(),
  apiGetRemotes: vi.fn(),
  apiPushBranch: vi.fn(),
}))
vi.mock('../../api/git.api', () => ({ apiCreateCommit, apiGetRemotes, apiPushBranch }))

import { EmptyRepoPanel } from './EmptyRepoPanel'
import { useRepoUIStore } from '../../stores/repoUI.store'

function renderPanel(repoPath = '/tmp/gm-sandbox') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidateSpy = vi.spyOn(client, 'invalidateQueries')
  const utils = render(
    <QueryClientProvider client={client}>
      <EmptyRepoPanel repoPath={repoPath} />
    </QueryClientProvider>
  )
  return { ...utils, invalidateSpy }
}

beforeEach(() => {
  vi.clearAllMocks()
  apiCreateCommit.mockResolvedValue({ oid: 'abc', shortOid: 'abc' })
  apiGetRemotes.mockResolvedValue([{ name: 'origin', url: 'git@github.com:me/repo.git' }])
  apiPushBranch.mockResolvedValue(undefined)
})

describe('EmptyRepoPanel', () => {
  it('shows the prompt with the repo name derived from the path', () => {
    renderPanel('/tmp/gm-sandbox')
    expect(screen.getByTestId('empty-repo-panel')).toBeInTheDocument()
    expect(screen.getByText(/gm-sandbox/)).toBeInTheDocument()
  })

  it('commits then pushes to establish the branch on the remote, and refreshes the graph', async () => {
    const user = userEvent.setup()
    const { invalidateSpy } = renderPanel('/repo')
    await user.click(screen.getByTestId('empty-repo-initialize'))
    expect(apiCreateCommit).toHaveBeenCalledWith('/repo', 'Initial commit')
    await waitFor(() => expect(apiPushBranch).toHaveBeenCalledWith('/repo'))
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['git-log', '/repo'] })
    )
  })

  it('skips the push when the repo has no remote (local-only)', async () => {
    apiGetRemotes.mockResolvedValue([])
    const user = userEvent.setup()
    renderPanel('/repo')
    await user.click(screen.getByTestId('empty-repo-initialize'))
    expect(apiCreateCommit).toHaveBeenCalledWith('/repo', 'Initial commit')
    await waitFor(() => expect(apiGetRemotes).toHaveBeenCalled())
    expect(apiPushBranch).not.toHaveBeenCalled()
  })

  it('does not create a duplicate commit when retrying after a push failure', async () => {
    apiPushBranch.mockRejectedValueOnce(new Error('push denied'))
    const user = userEvent.setup()
    renderPanel('/repo')
    await user.click(screen.getByTestId('empty-repo-initialize'))
    await waitFor(() => expect(screen.getByText(/push denied/)).toBeInTheDocument())
    expect(apiCreateCommit).toHaveBeenCalledTimes(1)
    // Retry: push only, no second commit.
    await user.click(screen.getByTestId('empty-repo-initialize'))
    await waitFor(() => expect(apiPushBranch).toHaveBeenCalledTimes(2))
    expect(apiCreateCommit).toHaveBeenCalledTimes(1)
  })

  it('surfaces an error when the commit fails', async () => {
    apiCreateCommit.mockRejectedValueOnce(new Error('cannot commit'))
    const user = userEvent.setup()
    renderPanel()
    await user.click(screen.getByTestId('empty-repo-initialize'))
    await waitFor(() => expect(screen.getByText(/cannot commit/)).toBeInTheDocument())
  })

  it('Cancel closes the repo tab, falling back to the last open tab', async () => {
    const user = userEvent.setup()
    useRepoUIStore.setState({
      openTabs: ['/other', '/repo'],
      activeTab: '/repo',
      activeRepo: '/repo',
    })
    renderPanel('/repo')
    await user.click(screen.getByTestId('empty-repo-cancel'))
    const state = useRepoUIStore.getState()
    expect(state.openTabs).toEqual(['/other'])
    expect(state.activeTab).toBe('/other')
  })
})
