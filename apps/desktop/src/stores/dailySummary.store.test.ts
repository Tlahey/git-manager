import { describe, it, expect, beforeEach, vi } from 'vitest'

const { apiListDailySummaries, apiDeleteDailySummary } = vi.hoisted(() => ({
  apiListDailySummaries: vi.fn(),
  apiDeleteDailySummary: vi.fn(),
}))
vi.mock('../api/dailySummary.api', () => ({ apiListDailySummaries, apiDeleteDailySummary }))

import {
  useDailySummaryStore,
  selectAllSummaries,
  selectLatestSummary,
  selectSummariesFor,
  type StoredDailySummary,
} from './dailySummary.store'

function stored(overrides: Partial<StoredDailySummary> = {}): StoredDailySummary {
  return {
    repoPath: '/repo/a',
    repoName: 'a',
    date: '2026-07-27',
    branch: 'origin/main',
    generatedAt: 1,
    commitCount: 2,
    fileCount: 3,
    filePath: '/archive/a/2026-07-27.md',
    summary: { headline: 'Shipped the thing', highlights: ['did a'] },
    ...overrides,
  }
}

/** A file as `list_daily_summaries` returns it, with rendered front matter. */
function file(date: string, repoPath: string, repoName: string, headline: string) {
  return {
    repoPath,
    repoName,
    date,
    filePath: `/archive/${repoName}/${date}.md`,
    markdown: `---\nrepo: ${repoName}\nrepoPath: ${repoPath}\ndate: ${date}\nbranch: origin/main\ngeneratedAt: 2026-07-27T08:00:00.000Z\ncommits: 2\nfiles: 3\n---\n\n# ${date} — ${repoName}\n\n${headline}\n\n## Yesterday\n\n- did a\n\n## Today\n\n- do b\n`,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  useDailySummaryStore.setState({ entries: {}, hydrated: false })
  apiListDailySummaries.mockResolvedValue([])
})

describe('useDailySummaryStore', () => {
  it('indexes an archived briefing by repo and day', () => {
    useDailySummaryStore.getState().setSummary(stored())
    expect(useDailySummaryStore.getState().entries['/repo/a']['2026-07-27'].summary.headline).toBe(
      'Shipped the thing'
    )
  })

  it('keeps briefings isolated per project and per day', () => {
    const { setSummary } = useDailySummaryStore.getState()
    setSummary(stored())
    setSummary(stored({ date: '2026-07-26' }))
    setSummary(stored({ repoPath: '/repo/b', repoName: 'b' }))

    const { entries } = useDailySummaryStore.getState()
    expect(Object.keys(entries['/repo/a'])).toEqual(['2026-07-27', '2026-07-26'])
    expect(Object.keys(entries['/repo/b'])).toEqual(['2026-07-27'])
  })

  it('regenerating the same day overwrites rather than duplicating it', () => {
    const { setSummary } = useDailySummaryStore.getState()
    setSummary(stored())
    setSummary(stored({ summary: { headline: 'Rewritten', highlights: [] } }))

    const byDate = useDailySummaryStore.getState().entries['/repo/a']
    expect(Object.keys(byDate)).toHaveLength(1)
    expect(byDate['2026-07-27'].summary.headline).toBe('Rewritten')
  })

  it('hydrates from the on-disk archive, parsing each file', async () => {
    apiListDailySummaries.mockResolvedValue([
      file('2026-07-27', '/repo/a', 'a', 'Newest'),
      file('2026-07-20', '/repo/a', 'a', 'Older'),
    ])

    await useDailySummaryStore.getState().hydrate()

    const state = useDailySummaryStore.getState()
    expect(state.hydrated).toBe(true)
    expect(selectSummariesFor(state, '/repo/a').map((e) => e.summary.headline)).toEqual([
      'Newest',
      'Older',
    ])
    expect(state.entries['/repo/a']['2026-07-27'].filePath).toBe('/archive/a/2026-07-27.md')
    expect(state.entries['/repo/a']['2026-07-27'].commitCount).toBe(2)
  })

  /** One hand-edited file must not take the whole archive down with it. */
  it('skips a file with no usable date instead of failing the hydration', async () => {
    apiListDailySummaries.mockResolvedValue([
      { repoPath: '', repoName: '', date: '', filePath: '/archive/junk.md', markdown: 'hello' },
      file('2026-07-27', '/repo/a', 'a', 'Fine'),
    ])

    await useDailySummaryStore.getState().hydrate()
    expect(selectAllSummaries(useDailySummaryStore.getState())).toHaveLength(1)
  })

  it('deletes a briefing from disk and from the index', async () => {
    useDailySummaryStore.getState().setSummary(stored())
    await useDailySummaryStore.getState().removeSummary('/repo/a', '2026-07-27')

    expect(apiDeleteDailySummary).toHaveBeenCalledWith('/archive/a/2026-07-27.md')
    expect(useDailySummaryStore.getState().entries['/repo/a']['2026-07-27']).toBeUndefined()
  })

  it('does not touch the disk when deleting an unknown day', async () => {
    await useDailySummaryStore.getState().removeSummary('/repo/missing', '2026-07-27')
    expect(apiDeleteDailySummary).not.toHaveBeenCalled()
  })
})

describe('selectors', () => {
  it('selectLatestSummary returns the newest day for a repo', () => {
    const { setSummary } = useDailySummaryStore.getState()
    setSummary(stored({ date: '2026-07-20' }))
    setSummary(stored({ date: '2026-07-27' }))
    expect(selectLatestSummary(useDailySummaryStore.getState(), '/repo/a')?.date).toBe('2026-07-27')
  })

  it('selectLatestSummary is undefined for a repo with no briefing', () => {
    expect(selectLatestSummary(useDailySummaryStore.getState(), '/nope')).toBeUndefined()
  })

  it('selectAllSummaries sorts newest day first, then repo name', () => {
    const { setSummary } = useDailySummaryStore.getState()
    setSummary(stored({ repoPath: '/repo/z', repoName: 'z' }))
    setSummary(stored({ repoPath: '/repo/b', repoName: 'b' }))
    setSummary(stored({ date: '2026-07-20' }))

    expect(
      selectAllSummaries(useDailySummaryStore.getState()).map((e) => `${e.date}/${e.repoName}`)
    ).toEqual(['2026-07-27/b', '2026-07-27/z', '2026-07-20/a'])
  })
})
