import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SWRConfig } from 'swr'

const {
  apiListDailySummaries,
  apiDeleteDailySummary,
  apiOpenDailySummariesDir,
  apiOpenInEditor,
  run,
  generateDailySummary,
} = vi.hoisted(() => ({
  apiListDailySummaries: vi.fn(),
  apiDeleteDailySummary: vi.fn(),
  apiOpenDailySummariesDir: vi.fn(),
  apiOpenInEditor: vi.fn(),
  run: vi.fn(),
  generateDailySummary: vi.fn(),
}))
vi.mock('../../api/dailySummary.api', () => ({
  apiListDailySummaries,
  apiDeleteDailySummary,
  apiOpenDailySummariesDir,
  apiSaveDailySummary: vi.fn(),
}))
vi.mock('../../api/repo.api', () => ({ apiOpenInEditor }))
vi.mock('../../api/ai.api', () => ({ summarySearchService: { run } }))
vi.mock('../../lib/generateDailySummary', () => ({ generateDailySummary }))
vi.mock('../../hooks/useAiEnabled', () => ({ useAiEnabled: () => true }))

import { DailySummariesPanel } from './DailySummariesPanel'
import { useDailySummaryStore } from '../../stores/dailySummary.store'

function file(date: string, repoPath: string, repoName: string, headline: string) {
  return {
    repoPath,
    repoName,
    date,
    filePath: `/archive/${repoName}/${date}.md`,
    markdown: `---\nrepo: ${repoName}\nrepoPath: ${repoPath}\ndate: ${date}\nbranch: origin/main\ngeneratedAt: 2026-07-27T08:00:00.000Z\ncommits: 2\nfiles: 3\n---\n\n# ${date}\n\n${headline}\n\n## Yesterday\n\n- did a thing\n`,
  }
}

const ARCHIVE = [
  file('2026-07-27', '/p/git-manager', 'git-manager', 'Shipped the merge editor'),
  file('2026-07-20', '/p/git-manager', 'git-manager', 'Bumped dependencies'),
  file('2026-07-27', '/p/other', 'other', 'Another project entirely'),
]

/**
 * Rendered with a fresh SWR cache every time.
 *
 * `useDailySummaryHistory`'s key is a constant (there is one archive), so the global cache would
 * carry one test's result into the next: the fetcher never re-runs, `hydrate()` never repopulates
 * the store `beforeEach` just emptied, and the panel renders an empty archive. `dedupingInterval: 0`
 * closes the same hole within a single test — without it these only pass because `userEvent` is slow
 * enough to outlast SWR's 2s dedupe window, which is a race, not a guarantee.
 */
function renderPanel(repoPath = '/p/git-manager') {
  const onClose = vi.fn()
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <DailySummariesPanel repoPath={repoPath} onClose={onClose} />
    </SWRConfig>
  )
  return onClose
}

beforeEach(() => {
  vi.clearAllMocks()
  useDailySummaryStore.setState({ entries: {}, hydrated: false })
  apiListDailySummaries.mockResolvedValue(ARCHIVE)
  run.mockResolvedValue({ answer: 'On the 27th.', matches: [] })
  generateDailySummary.mockResolvedValue({ headline: 'H', highlights: [] })
})

describe('DailySummariesPanel — scoping', () => {
  /** The whole reason this is a panel and not a page: it is about the repository you are in. */
  it('shows only this repository’s days', async () => {
    renderPanel()
    await waitFor(() => expect(screen.getByText('Shipped the merge editor')).toBeInTheDocument())
    expect(screen.getByText('Bumped dependencies')).toBeInTheDocument()
    expect(screen.queryByText('Another project entirely')).not.toBeInTheDocument()
  })

  it('sends only this repository’s days to the model', async () => {
    renderPanel()
    await waitFor(() => expect(screen.getByText('Shipped the merge editor')).toBeInTheDocument())

    const user = userEvent.setup()
    await user.type(screen.getByTestId('summary-ask-input'), 'what happened?')
    await user.click(screen.getByTestId('summary-ask-submit'))

    await waitFor(() => expect(run).toHaveBeenCalled())
    const repos = run.mock.calls[0][1].candidates.map((c: { repo: string }) => c.repo)
    expect(new Set(repos)).toEqual(new Set(['git-manager']))
  })

  it('shows the empty-archive message for a repo with no briefing', async () => {
    renderPanel('/p/fresh')
    await waitFor(() =>
      expect(screen.getByTestId('summaries-empty')).toHaveTextContent(
        'No briefing has been archived yet.'
      )
    )
  })
})

describe('DailySummariesPanel — picking a day', () => {
  /** Narrowing by content is the model's job; the panel offers no lexical box beside it. */
  it('offers no text filter', async () => {
    renderPanel()
    await waitFor(() => expect(screen.getByText('Shipped the merge editor')).toBeInTheDocument())
    expect(screen.queryByTestId('summary-search-input')).not.toBeInTheDocument()
  })

  it('lists every day until one is picked', async () => {
    renderPanel()
    await waitFor(() => expect(screen.getByText('Shipped the merge editor')).toBeInTheDocument())
    expect(screen.getByText('Bumped dependencies')).toBeInTheDocument()
  })

  it('narrows to exactly the day picked', async () => {
    renderPanel()
    await waitFor(() => expect(screen.getByText('Bumped dependencies')).toBeInTheDocument())

    await userEvent.setup().type(screen.getByTestId('summary-day-input'), '2026-07-27')
    await waitFor(() => expect(screen.queryByText('Bumped dependencies')).not.toBeInTheDocument())
    expect(screen.getByText('Shipped the merge editor')).toBeInTheDocument()
  })

  it('invites generating a day that has no briefing yet', async () => {
    renderPanel()
    await waitFor(() => expect(screen.getByText('Shipped the merge editor')).toBeInTheDocument())

    await userEvent.setup().type(screen.getByTestId('summary-day-input'), '2026-07-22')
    await waitFor(() =>
      expect(screen.getByText(/No briefing for this day yet/)).toBeInTheDocument()
    )
  })

  it('goes back to every day when the picked one is cleared', async () => {
    renderPanel()
    await waitFor(() => expect(screen.getByText('Bumped dependencies')).toBeInTheDocument())

    const user = userEvent.setup()
    await user.type(screen.getByTestId('summary-day-input'), '2026-07-27')
    await waitFor(() => expect(screen.queryByText('Bumped dependencies')).not.toBeInTheDocument())
    await user.click(screen.getByTestId('summary-clear-day'))

    await waitFor(() => expect(screen.getByText('Bumped dependencies')).toBeInTheDocument())
  })

  it('shows the answer and narrows to a cited day', async () => {
    run.mockResolvedValue({
      answer: 'A',
      matches: [{ repo: 'git-manager', date: '2026-07-20', reason: 'it was there' }],
    })
    renderPanel()
    await waitFor(() => expect(screen.getByText('Shipped the merge editor')).toBeInTheDocument())

    const user = userEvent.setup()
    await user.type(screen.getByTestId('summary-ask-input'), 'q')
    await user.click(screen.getByTestId('summary-ask-submit'))
    await waitFor(() => expect(screen.getByTestId('summary-answer-match')).toBeInTheDocument())
    await user.click(screen.getByTestId('summary-answer-match'))

    await waitFor(() =>
      expect(screen.queryByText('Shipped the merge editor')).not.toBeInTheDocument()
    )
    expect(screen.getByText('Bumped dependencies')).toBeInTheDocument()
  })
})

describe('DailySummariesPanel — actions', () => {
  /** The date is the argument, so there is nothing to generate until one is picked. */
  it('cannot generate before a day is picked', async () => {
    renderPanel()
    await waitFor(() => expect(screen.getByText('Shipped the merge editor')).toBeInTheDocument())
    expect(screen.getByTestId('summary-generate-button')).toBeDisabled()
  })

  it('generates the picked day for this repo', async () => {
    renderPanel()
    await waitFor(() => expect(screen.getByText('Shipped the merge editor')).toBeInTheDocument())

    const user = userEvent.setup()
    await user.type(screen.getByTestId('summary-day-input'), '2026-07-22')
    await user.click(screen.getByTestId('summary-generate-button'))

    await waitFor(() =>
      expect(generateDailySummary).toHaveBeenCalledWith(
        '/p/git-manager',
        expect.anything(),
        expect.objectContaining({ date: '2026-07-22' })
      )
    )
  })

  it('reports a quiet day rather than an error', async () => {
    generateDailySummary.mockResolvedValue(null)
    renderPanel()
    await waitFor(() => expect(screen.getByText('Shipped the merge editor')).toBeInTheDocument())

    const user = userEvent.setup()
    await user.type(screen.getByTestId('summary-day-input'), '2026-07-22')
    await user.click(screen.getByTestId('summary-generate-button'))

    await waitFor(() => expect(screen.getByTestId('summaries-skipped')).toBeInTheDocument())
  })

  it('opens a briefing file in the configured editor', async () => {
    renderPanel()
    await waitFor(() => expect(screen.getByText('Shipped the merge editor')).toBeInTheDocument())

    await userEvent.setup().click(screen.getAllByTestId('summary-open-in-editor')[0])
    expect(apiOpenInEditor).toHaveBeenCalledWith(
      '/archive/git-manager/2026-07-27.md',
      expect.any(String)
    )
  })

  it('reveals the archive folder from the header', async () => {
    renderPanel()
    await waitFor(() => expect(screen.getByText('Shipped the merge editor')).toBeInTheDocument())

    await userEvent.setup().click(screen.getByTestId('summaries-open-folder'))
    expect(apiOpenDailySummariesDir).toHaveBeenCalledOnce()
  })

  it('deletes a briefing and drops it from the list', async () => {
    renderPanel()
    await waitFor(() => expect(screen.getByText('Shipped the merge editor')).toBeInTheDocument())

    apiListDailySummaries.mockResolvedValue([ARCHIVE[1], ARCHIVE[2]])
    await userEvent.setup().click(screen.getAllByTestId('summary-delete')[0])

    expect(apiDeleteDailySummary).toHaveBeenCalledWith('/archive/git-manager/2026-07-27.md')
    await waitFor(() =>
      expect(screen.queryByText('Shipped the merge editor')).not.toBeInTheDocument()
    )
  })

  it('surfaces a failed action without losing the list', async () => {
    apiOpenDailySummariesDir.mockRejectedValue(new Error('no such folder'))
    renderPanel()
    await waitFor(() => expect(screen.getByText('Shipped the merge editor')).toBeInTheDocument())

    await userEvent.setup().click(screen.getByTestId('summaries-open-folder'))
    await waitFor(() => expect(screen.getByText(/no such folder/)).toBeInTheDocument())
    expect(screen.getByText('Shipped the merge editor')).toBeInTheDocument()
  })

  it('closes from the header button', async () => {
    const onClose = renderPanel()
    await waitFor(() => expect(screen.getByText('Shipped the merge editor')).toBeInTheDocument())

    await userEvent.setup().click(screen.getByTestId('summaries-close'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('names its icon-only header controls', async () => {
    renderPanel()
    await waitFor(() => expect(screen.getByText('Shipped the merge editor')).toBeInTheDocument())
    expect(screen.getByTestId('summaries-close')).toHaveAccessibleName('Close')
    expect(screen.getByTestId('summaries-open-folder')).toHaveAccessibleName('Open folder')
  })
})
