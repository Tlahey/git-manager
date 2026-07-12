import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { GitRef } from '@git-manager/git-types'

vi.mock('../../api/git.api', () => ({ apiGetTags: vi.fn() }))
vi.mock('./HoverExpandLabel', () => ({
  HoverExpandLabel: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}))

import { apiGetTags } from '../../api/git.api'
import { TagsSection } from './TagsSection'

const mockedGetTags = apiGetTags as unknown as ReturnType<typeof vi.fn>

function tag(shortName: string, commitOid = '1234567890abcdef'): GitRef {
  return { name: `refs/tags/${shortName}`, shortName, type: 'tag', commitOid }
}

function renderSection() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <TagsSection repoPath="/repo" />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('TagsSection', () => {
  it('renders nothing when there are no tags', async () => {
    mockedGetTags.mockResolvedValue([])
    const { container } = renderSection()
    await new Promise((r) => setTimeout(r, 0))
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the header with the tag count, collapsed by default', async () => {
    mockedGetTags.mockResolvedValue([tag('v1.0.0'), tag('v2.0.0')])
    renderSection()
    expect(await screen.findByText('Tags')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.queryByText('v1.0.0')).not.toBeInTheDocument()
  })

  it('expands to show each tag name and short oid', async () => {
    mockedGetTags.mockResolvedValue([tag('v1.0.0', 'abcdef1234567890')])
    const user = userEvent.setup()
    renderSection()
    await user.click(await screen.findByText('Tags'))
    expect(screen.getByText('v1.0.0')).toBeInTheDocument()
    expect(screen.getByText('abcdef1')).toBeInTheDocument()
  })

  it('caps the list at 100 tags and shows a "+N more" footer', async () => {
    mockedGetTags.mockResolvedValue(Array.from({ length: 105 }, (_, i) => tag(`v${i}`)))
    const user = userEvent.setup()
    renderSection()
    await user.click(await screen.findByText('Tags'))
    expect(screen.queryByText('v100')).not.toBeInTheDocument()
    expect(screen.getByText('+ 5 autres tags')).toBeInTheDocument()
  })
})
