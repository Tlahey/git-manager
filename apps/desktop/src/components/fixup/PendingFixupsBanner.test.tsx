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
vi.mock('../../api/git.api', () => ({ apiGetPendingFixups: vi.fn() }))
vi.mock('./AutosquashPreviewDialog', () => ({
  AutosquashPreviewDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="autosquash-dialog" /> : null,
}))

import { apiGetPendingFixups } from '../../api/git.api'
import { useRepoDataStore } from '../../stores/repoData.store'
import { PendingFixupsBanner } from './PendingFixupsBanner'

const mockedApi = apiGetPendingFixups as unknown as ReturnType<typeof vi.fn>

function renderBanner(repoPath = '/repo') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <PendingFixupsBanner repoPath={repoPath} />
    </QueryClientProvider>
  )
}

describe('PendingFixupsBanner', () => {
  beforeEach(() => {
    useRepoDataStore.setState({ hiddenFixups: {} })
  })

  it('renders nothing when there are no pending fixups', async () => {
    mockedApi.mockResolvedValue([])
    const { container } = renderBanner()
    await waitFor(() => expect(mockedApi).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the pending count once fixups are found', async () => {
    mockedApi.mockResolvedValue([{ oid: 'a' }, { oid: 'b' }])
    renderBanner()
    await waitFor(() => expect(screen.getByText('fixup.pending:{"count":2}')).toBeInTheDocument())
  })

  it('excludes fixups the user has ignored for this repo', async () => {
    mockedApi.mockResolvedValue([
      { fixupOid: 'a-full', fixupShortOid: 'a' },
      { fixupOid: 'b-full', fixupShortOid: 'b' },
    ])
    useRepoDataStore.setState({ hiddenFixups: { '/repo': ['a-full'] } })
    renderBanner()
    await waitFor(() => expect(screen.getByText('fixup.pending:{"count":1}')).toBeInTheDocument())
  })

  it('renders nothing when every pending fixup has been ignored', async () => {
    mockedApi.mockResolvedValue([{ fixupOid: 'a-full', fixupShortOid: 'a' }])
    useRepoDataStore.setState({ hiddenFixups: { '/repo': ['a-full'] } })
    const { container } = renderBanner()
    await waitFor(() => expect(mockedApi).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it('opens the autosquash dialog when clicked', async () => {
    mockedApi.mockResolvedValue([{ oid: 'a' }])
    const user = userEvent.setup()
    renderBanner()
    await waitFor(() => expect(screen.getByText('Autosquash')).toBeInTheDocument())
    expect(screen.queryByTestId('autosquash-dialog')).not.toBeInTheDocument()

    await user.click(screen.getByText('Autosquash'))
    expect(screen.getByTestId('autosquash-dialog')).toBeInTheDocument()
  })
})
