import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { FileHistoryEntry } from '@git-manager/git-types'
import { BlameHistoryPanel } from './BlameHistoryPanel'
import { useRepoUIStore } from '../../stores/repoUI.store'

// i18n: return the key so assertions are language-agnostic, and a fixed language for date formatting.
vi.mock('@git-manager/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}))

// The panel's data comes from SWR-backed hooks; stub them so tests stay synchronous and offline.
const mockUseFileHistory = vi.fn()
vi.mock('../../hooks/useFileHistory', () => ({
  useFileHistory: (...args: unknown[]) => mockUseFileHistory(...args),
}))
vi.mock('../../hooks/useCommitAvatars', () => ({
  useCommitAvatars: () => ({}),
}))

const HISTORY: FileHistoryEntry[] = [
  {
    oid: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    shortOid: 'aaaaaaa',
    authorName: 'Ada Lovelace',
    authorEmail: 'ada@example.com',
    timestamp: Math.floor(Date.now() / 1000) - 3600,
    summary: 'Update the thing',
    body: '',
    status: 'modified',
  },
  {
    oid: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    shortOid: 'bbbbbbb',
    authorName: 'Alan Turing',
    authorEmail: 'alan@example.com',
    timestamp: Math.floor(Date.now() / 1000) - 86400,
    summary: 'Initial commit',
    body: '',
    status: 'added',
  },
]

const FILE = { path: 'src/components/Button.tsx', staged: false }

function renderPanel(props: Partial<React.ComponentProps<typeof BlameHistoryPanel>> = {}) {
  return render(
    <BlameHistoryPanel file={FILE} repoPath="/repo" onClose={vi.fn()} {...props} />
  )
}

beforeEach(() => {
  mockUseFileHistory.mockReturnValue({ data: HISTORY, isLoading: false })
  useRepoUIStore.setState({ selectedHistoryOid: null })
})

describe('BlameHistoryPanel — header', () => {
  it('titles the panel "History" and has no blame toggle or file banner', () => {
    renderPanel()
    expect(screen.getByRole('heading', { name: 'fileHistory.title' })).toBeInTheDocument()
    expect(screen.queryByTestId('blame-history-toggle')).not.toBeInTheDocument()
    // The redundant file-name banner is gone.
    expect(screen.queryByText('src/components/')).not.toBeInTheDocument()
  })
})

describe('BlameHistoryPanel — history list', () => {
  it('renders a row per entry, a current-version row, and an end-of-history marker', () => {
    renderPanel()
    expect(screen.getByTestId('history-current-version')).toBeInTheDocument()
    expect(screen.getByText('Update the thing')).toBeInTheDocument()
    expect(screen.getByText('Initial commit')).toBeInTheDocument()
    expect(screen.getByTestId('history-end')).toBeInTheDocument()
  })

  it('shows a change-status marker per entry', () => {
    renderPanel()
    expect(screen.getByTestId('history-status-aaaaaaa')).toHaveTextContent('M')
    expect(screen.getByTestId('history-status-bbbbbbb')).toHaveTextContent('A')
  })

  it('selects a version on click', async () => {
    const user = userEvent.setup()
    renderPanel()
    await user.click(screen.getByTestId('history-row-aaaaaaa'))
    expect(useRepoUIStore.getState().selectedHistoryOid).toBe(HISTORY[0].oid)
  })

  it('resets to the current version', async () => {
    const user = userEvent.setup()
    useRepoUIStore.setState({ selectedHistoryOid: HISTORY[0].oid })
    renderPanel()
    await user.click(screen.getByTestId('history-current-version'))
    expect(useRepoUIStore.getState().selectedHistoryOid).toBeNull()
  })

  it('prompts to open a file when there is none', () => {
    renderPanel({ file: null })
    expect(screen.getByText('fileHistory.openFile')).toBeInTheDocument()
  })

  it('shows an empty state when the file has no history', () => {
    mockUseFileHistory.mockReturnValue({ data: [], isLoading: false })
    renderPanel()
    expect(screen.getByText('fileHistory.empty')).toBeInTheDocument()
  })
})

describe('BlameHistoryPanel — close', () => {
  it('calls onClose when the close button is clicked', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    renderPanel({ onClose })
    await user.click(screen.getByRole('button', { name: 'fileHistory.close' }))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
