import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { GitBranch } from '@git-manager/git-types'

const { useBranches, usePullRequests, useGitStashes } = vi.hoisted(() => ({
  useBranches: vi.fn(),
  usePullRequests: vi.fn(),
  useGitStashes: vi.fn(),
}))
vi.mock('../../hooks/useBranches', () => ({ useBranches }))
vi.mock('../../hooks/usePullRequests', () => ({ usePullRequests }))
vi.mock('../../hooks/useGitStashes', () => ({ useGitStashes }))
vi.mock('../../api/git.api', () => ({ apiGetTags: vi.fn(), apiListSubmodules: vi.fn() }))

import { apiGetTags, apiListSubmodules } from '../../api/git.api'
import { SidebarRail } from './SidebarRail'

const mockedGetTags = apiGetTags as unknown as ReturnType<typeof vi.fn>
const mockedListSubmodules = apiListSubmodules as unknown as ReturnType<typeof vi.fn>

function localBranch(name: string): GitBranch {
  return {
    name,
    shortName: name,
    isHead: false,
    isRemote: false,
    commitOid: '',
    commitMessage: '',
    commitTimestamp: 0,
    aheadCount: 0,
    behindCount: 0,
  }
}
function remoteBranch(name: string): GitBranch {
  return { ...localBranch(name), isRemote: true }
}

function renderRail(props: Partial<React.ComponentProps<typeof SidebarRail>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <SidebarRail repoPath="/repo" remoteUrls={[]} onExpand={vi.fn()} {...props} />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  useBranches.mockReturnValue({ data: [] })
  usePullRequests.mockReturnValue({ allPrs: [] })
  useGitStashes.mockReturnValue({ data: [] })
  mockedGetTags.mockResolvedValue([])
  mockedListSubmodules.mockResolvedValue([])
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('SidebarRail — counts', () => {
  it('splits local vs remote branch counts', () => {
    useBranches.mockReturnValue({
      data: [localBranch('main'), localBranch('dev'), remoteBranch('origin/main')],
    })
    renderRail()
    expect(screen.getByTitle('Local (2)')).toBeInTheDocument()
    expect(screen.getByTitle('Remotes (1)')).toBeInTheDocument()
  })

  it('shows the pull request count', () => {
    usePullRequests.mockReturnValue({ allPrs: [{}, {}, {}] })
    renderRail()
    expect(screen.getByTitle('Pull Requests (3)')).toBeInTheDocument()
  })

  it('shows the tag count once loaded', async () => {
    mockedGetTags.mockResolvedValue([{ name: 'v1', shortName: 'v1', type: 'tag', commitOid: 'a' }])
    renderRail()
    expect(await screen.findByTitle('Tags (1)')).toBeInTheDocument()
  })

  it('caps the badge display at "99+"', () => {
    usePullRequests.mockReturnValue({ allPrs: Array.from({ length: 150 }, () => ({})) })
    renderRail()
    expect(screen.getByText('99+')).toBeInTheDocument()
  })

  it('does not show a count badge for zero', () => {
    renderRail()
    const localButton = screen.getByTitle('Local (0)')
    expect(localButton.querySelector('span')).not.toBeInTheDocument()
  })
})

describe('SidebarRail — conditional sections', () => {
  it('hides the Stashes icon when there are no stashes', () => {
    renderRail()
    expect(screen.queryByLabelText('Stashes')).not.toBeInTheDocument()
  })

  it('shows the Stashes icon with a count once stashes exist', () => {
    useGitStashes.mockReturnValue({ data: [{}, {}] })
    renderRail()
    expect(screen.getByTitle('Stashes (2)')).toBeInTheDocument()
  })

  it('hides the Submodules icon when there are none', () => {
    renderRail()
    expect(screen.queryByLabelText('Submodules')).not.toBeInTheDocument()
  })

  it('shows the Submodules icon with a count once submodules exist', async () => {
    mockedListSubmodules.mockResolvedValue([{ path: 'a', url: 'u', headOid: '' }])
    renderRail()
    expect(await screen.findByTitle('Submodules (1)')).toBeInTheDocument()
  })
})

describe('SidebarRail — expand', () => {
  it('the top expand button and every rail icon call onExpand', async () => {
    const onExpand = vi.fn()
    const user = userEvent.setup()
    renderRail({ onExpand })
    await user.click(screen.getByLabelText('Déplier la sidebar'))
    await user.click(screen.getByLabelText('Local'))
    expect(onExpand).toHaveBeenCalledTimes(2)
  })
})
