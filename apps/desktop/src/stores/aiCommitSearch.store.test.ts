import { describe, it, expect, beforeEach } from 'vitest'
import {
  MAX_RUNS_PER_REPO,
  useAiCommitSearchStore,
  type StoredSearchRun,
} from './aiCommitSearch.store'

function run(overrides: Partial<StoredSearchRun> = {}): StoredSearchRun {
  return {
    id: 'run-1',
    question: 'Has the Button changed?',
    answer: '**Yes.**',
    matches: [],
    scanned: 42,
    failed: 0,
    truncated: false,
    sinceHours: 720,
    sinceEpoch: 1_781_395_200,
    ranAt: 1_784_000_000_000,
    model: 'qwen3',
    ...overrides,
  }
}

describe('useAiCommitSearchStore', () => {
  beforeEach(() => {
    useAiCommitSearchStore.setState({ runs: {} })
  })

  it('keeps the newest run first, so the panel lists history in the order it happened', () => {
    const { addRun } = useAiCommitSearchStore.getState()
    addRun('/repo', run({ id: 'old' }))
    addRun('/repo', run({ id: 'new' }))

    expect(useAiCommitSearchStore.getState().runs['/repo'].map((r) => r.id)).toEqual([
      'new',
      'old',
    ])
  })

  it('keeps each repository apart', () => {
    const { addRun } = useAiCommitSearchStore.getState()
    addRun('/a', run({ id: 'a1' }))
    addRun('/b', run({ id: 'b1' }))

    const { runs } = useAiCommitSearchStore.getState()
    expect(runs['/a'].map((r) => r.id)).toEqual(['a1'])
    expect(runs['/b'].map((r) => r.id)).toEqual(['b1'])
  })

  it('evicts the oldest past the cap, since these entries are large and decay fast', () => {
    const { addRun } = useAiCommitSearchStore.getState()
    for (let i = 0; i <= MAX_RUNS_PER_REPO; i++) addRun('/repo', run({ id: `run-${i}` }))

    const stored = useAiCommitSearchStore.getState().runs['/repo']
    expect(stored).toHaveLength(MAX_RUNS_PER_REPO)
    expect(stored[0].id).toBe(`run-${MAX_RUNS_PER_REPO}`)
    expect(stored.some((r) => r.id === 'run-0')).toBe(false)
  })

  it('removes one run by id, leaving the rest', () => {
    const { addRun, removeRun } = useAiCommitSearchStore.getState()
    addRun('/repo', run({ id: 'keep' }))
    addRun('/repo', run({ id: 'drop' }))
    removeRun('/repo', 'drop')

    expect(useAiCommitSearchStore.getState().runs['/repo'].map((r) => r.id)).toEqual(['keep'])
  })

  it('ignores a removal for a repository with no history', () => {
    const { removeRun } = useAiCommitSearchStore.getState()
    removeRun('/unknown', 'whatever')
    expect(useAiCommitSearchStore.getState().runs).toEqual({})
  })

  it('clears a repository without touching the others', () => {
    const { addRun, clearRepo } = useAiCommitSearchStore.getState()
    addRun('/a', run({ id: 'a1' }))
    addRun('/b', run({ id: 'b1' }))
    clearRepo('/a')

    const { runs } = useAiCommitSearchStore.getState()
    expect(runs['/a']).toBeUndefined()
    expect(runs['/b']).toHaveLength(1)
  })

  it('keeps the matches with the answer, which is what makes an old run still useful', () => {
    const { addRun } = useAiCommitSearchStore.getState()
    addRun(
      '/repo',
      run({
        matches: [
          {
            oid: 'a'.repeat(40),
            shortOid: 'aaaaaaa',
            subject: 'feat: loading state',
            author: 'Ada',
            timestamp: 1_783_987_200,
            finding: 'adds a loading state',
            files: ['packages/ui/src/Button.tsx'],
          },
        ],
      })
    )

    const [stored] = useAiCommitSearchStore.getState().runs['/repo']
    expect(stored.matches[0].oid).toHaveLength(40)
    expect(stored.matches[0].files).toEqual(['packages/ui/src/Button.tsx'])
  })
})
