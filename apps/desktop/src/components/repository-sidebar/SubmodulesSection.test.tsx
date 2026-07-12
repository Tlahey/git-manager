import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { GitSubmodule } from '@git-manager/git-types'

vi.mock('../../api/git.api', () => ({ apiListSubmodules: vi.fn() }))
vi.mock('./HoverExpandLabel', () => ({
  HoverExpandLabel: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}))

import { apiListSubmodules } from '../../api/git.api'
import { SubmodulesSection } from './SubmodulesSection'

const mockedListSubmodules = apiListSubmodules as unknown as ReturnType<typeof vi.fn>

function submodule(overrides: Partial<GitSubmodule> = {}): GitSubmodule {
  return {
    path: 'vendor/lib',
    url: 'git@github.com:owner/lib.git',
    headOid: 'abcdef1234567890',
    ...overrides,
  }
}

function renderSection() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <SubmodulesSection repoPath="/repo" />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('SubmodulesSection', () => {
  it('renders nothing when there are no submodules', async () => {
    mockedListSubmodules.mockResolvedValue([])
    const { container } = renderSection()
    await new Promise((r) => setTimeout(r, 0))
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the header with the submodule count, collapsed by default', async () => {
    mockedListSubmodules.mockResolvedValue([submodule()])
    renderSection()
    expect(await screen.findByText('Submodules')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.queryByText('vendor/lib')).not.toBeInTheDocument()
  })

  it('expands to show the path, shortened URL, and short head oid', async () => {
    const user = userEvent.setup()
    mockedListSubmodules.mockResolvedValue([
      submodule({
        path: 'vendor/lib',
        url: 'git@github.com:owner/lib.git',
        headOid: 'abcdef1234567890',
      }),
    ])
    renderSection()
    await user.click(await screen.findByText('Submodules'))
    expect(screen.getByText('vendor/lib')).toBeInTheDocument()
    expect(screen.getByText('github.com:owner/lib')).toBeInTheDocument()
    expect(screen.getByText('abcdef1')).toBeInTheDocument()
  })

  it('shortens an https URL the same way', async () => {
    const user = userEvent.setup()
    mockedListSubmodules.mockResolvedValue([submodule({ url: 'https://gitlab.com/owner/lib.git' })])
    renderSection()
    await user.click(await screen.findByText('Submodules'))
    expect(screen.getByText('gitlab.com/owner/lib')).toBeInTheDocument()
  })

  it('omits the head-oid badge when the submodule has none', async () => {
    const user = userEvent.setup()
    mockedListSubmodules.mockResolvedValue([submodule({ headOid: '' })])
    renderSection()
    await user.click(await screen.findByText('Submodules'))
    expect(screen.queryByText('abcdef1')).not.toBeInTheDocument()
  })
})
