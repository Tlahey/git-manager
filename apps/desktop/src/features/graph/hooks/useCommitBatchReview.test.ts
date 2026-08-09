import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { ProcessedFileItem } from '../../../components/common/CommitFileList'

vi.mock('../../../api/git.api', () => ({
  apiUnstageAll: vi.fn(),
  apiStageFile: vi.fn(),
  apiCreateCommit: vi.fn(),
  apiGetPendingOperation: vi.fn(),
}))

const { apiGetAiContext, fileSummaryRun, summaryGroupingRun } = vi.hoisted(() => ({
  apiGetAiContext: vi.fn(),
  fileSummaryRun: vi.fn(),
  summaryGroupingRun: vi.fn(),
}))
vi.mock('../../../api/ai.api', () => ({
  apiGetAiContext,
  fileSummaryService: { run: fileSummaryRun },
  summaryGroupingService: { run: summaryGroupingRun },
}))

import {
  apiUnstageAll,
  apiStageFile,
  apiCreateCommit,
  apiGetPendingOperation,
} from '../../../api/git.api'
import { useCommitBatchReview } from './useCommitBatchReview'
import { useSettingsStore } from '../../../stores/settings.store'

function setCommitPattern(pattern: string) {
  useSettingsStore.setState((s) => ({
    settings: { ...s.settings, git: { ...s.settings.git, commitPattern: pattern } },
  }))
}

const mocked = {
  apiUnstageAll: apiUnstageAll as unknown as ReturnType<typeof vi.fn>,
  apiStageFile: apiStageFile as unknown as ReturnType<typeof vi.fn>,
  apiCreateCommit: apiCreateCommit as unknown as ReturnType<typeof vi.fn>,
  apiGetPendingOperation: apiGetPendingOperation as unknown as ReturnType<typeof vi.fn>,
}

const t = (key: string) => key

function file(path: string, status = 'modified'): ProcessedFileItem {
  return { path, status, staged: false } as ProcessedFileItem
}

const aiContext = {
  diff: 'diff body',
  repoName: 'demo',
  branch: 'main',
  files: [
    { path: 'src/a.ts', status: 'modified' },
    { path: 'src/a.test.ts', status: 'added' },
    { path: 'docs/x.md', status: 'modified' },
  ],
  // Conventional history so the adaptive validator enforces the format in the validation test.
  recentCommits: ['feat: one', 'fix: two', 'chore: three', 'refactor: four'],
}

beforeEach(() => {
  vi.clearAllMocks()
  apiGetAiContext.mockResolvedValue(aiContext)
  mocked.apiGetPendingOperation.mockResolvedValue(null)
  fileSummaryRun.mockResolvedValue({ intent: 'changes it', area: 'demo area' })
  setCommitPattern('')
})

describe('useCommitBatchReview', () => {
  const files = [file('src/a.ts'), file('src/a.test.ts'), file('docs/x.md')]

  it('opens, generates a plan, and maps proposals (all accepted by default)', async () => {
    summaryGroupingRun.mockResolvedValue([
      { commitMessage: 'feat(a): add a', files: ['src/a.ts', 'src/a.test.ts'] },
      { commitMessage: 'docs: update x', files: ['docs/x.md'] },
    ])
    const { result } = renderHook(() => useCommitBatchReview('/repo', files, t))

    await act(async () => result.current.openAndGenerate())

    expect(result.current.isOpen).toBe(true)
    expect(result.current.proposals).toHaveLength(2)
    expect(result.current.proposals[0].commitMessage).toBe('feat(a): add a')
    expect(result.current.proposals[0].files.map((f) => f.path)).toEqual([
      'src/a.ts',
      'src/a.test.ts',
    ])
    expect(result.current.proposals.every((p) => p.accepted)).toBe(true)
    expect(result.current.canApply).toBe(true)
  })

  it('adds omitted files as a rejected-by-default trailing group', async () => {
    summaryGroupingRun.mockResolvedValue([{ commitMessage: 'feat(a): add a', files: ['src/a.ts'] }])
    const { result } = renderHook(() => useCommitBatchReview('/repo', files, t))

    await act(async () => result.current.openAndGenerate())

    const leftover = result.current.proposals[result.current.proposals.length - 1]
    expect(leftover.accepted).toBe(false)
    expect(leftover.files.map((f) => f.path).sort()).toEqual(['docs/x.md', 'src/a.test.ts'])
    // Tagged rather than left for the view to guess from its position and empty message — that
    // guess breaks as soon as the user clears a real proposal's message.
    expect(leftover.kind).toBe('unplaced')
    expect(result.current.proposals[0].kind).toBe('proposed')
  })

  it('applies only accepted proposals: unstage-all, stage each group, commit in order', async () => {
    summaryGroupingRun.mockResolvedValue([
      { commitMessage: 'feat(a): add a', files: ['src/a.ts', 'src/a.test.ts'] },
      { commitMessage: 'docs: update x', files: ['docs/x.md'] },
    ])
    const onRefresh = vi.fn()
    const { result } = renderHook(() => useCommitBatchReview('/repo', files, t, onRefresh))
    await act(async () => result.current.openAndGenerate())

    // Reject the second proposal.
    act(() => result.current.toggleAccepted(1))
    await act(async () => result.current.applyAccepted())

    expect(mocked.apiUnstageAll).toHaveBeenCalledWith('/repo')
    expect(mocked.apiStageFile).toHaveBeenCalledWith('/repo', 'src/a.ts')
    expect(mocked.apiStageFile).toHaveBeenCalledWith('/repo', 'src/a.test.ts')
    expect(mocked.apiStageFile).not.toHaveBeenCalledWith('/repo', 'docs/x.md')
    expect(mocked.apiCreateCommit).toHaveBeenCalledTimes(1)
    expect(mocked.apiCreateCommit).toHaveBeenCalledWith('/repo', 'feat(a): add a')
    expect(result.current.isOpen).toBe(false)
    expect(onRefresh).toHaveBeenCalledOnce()
  })

  it('an edited message is used verbatim (trimmed) at commit time', async () => {
    summaryGroupingRun.mockResolvedValue([{ commitMessage: 'feat: a', files: ['src/a.ts'] }])
    const { result } = renderHook(() => useCommitBatchReview('/repo', files, t))
    await act(async () => result.current.openAndGenerate())

    act(() => result.current.setMessage(0, '  fix: better message  '))
    await act(async () => result.current.applyAccepted())

    expect(mocked.apiCreateCommit).toHaveBeenCalledWith('/repo', 'fix: better message')
  })

  it('surfaces an error when the grouping service fails and keeps the dialog open', async () => {
    summaryGroupingRun.mockRejectedValue(new Error('ai provider down'))
    const { result } = renderHook(() => useCommitBatchReview('/repo', files, t))

    await act(async () => result.current.openAndGenerate())

    expect(result.current.error).toContain('ai provider down')
    expect(result.current.isOpen).toBe(true)
    expect(result.current.canApply).toBe(false)
  })

  it('validates each proposal against the convention (default types when none configured)', async () => {
    summaryGroupingRun.mockResolvedValue([
      { commitMessage: 'feat: valid one', files: ['src/a.ts'] },
      { commitMessage: 'not conventional', files: ['docs/x.md'] },
    ])
    const { result } = renderHook(() => useCommitBatchReview('/repo', files, t))
    await act(async () => result.current.openAndGenerate())

    expect(result.current.validations[0].valid).toBe(true)
    expect(result.current.validations[1].valid).toBe(false)
  })

  it("flags proposals that violate the user's configured commit pattern from Settings", async () => {
    setCommitPattern('^[A-Z]+-\\d+: .+')
    summaryGroupingRun.mockResolvedValue([
      { commitMessage: 'ABC-12: do the thing', files: ['src/a.ts'] },
      { commitMessage: 'feat: no ticket id', files: ['docs/x.md'] },
    ])
    const { result } = renderHook(() => useCommitBatchReview('/repo', files, t))
    await act(async () => result.current.openAndGenerate())

    expect(result.current.validations[0].valid).toBe(true)
    expect(result.current.validations[1].valid).toBe(false)
    expect(result.current.validations[1].problems[0].code).toBe('pattern')
  })

  it('flags a staged selection only when there is one to lose', () => {
    const { result: none } = renderHook(() => useCommitBatchReview('/repo', files, t))
    expect(none.current.hasStagedChanges).toBe(false)

    const staged = [{ ...file('src/a.ts'), staged: true }, file('docs/x.md')]
    const { result } = renderHook(() => useCommitBatchReview('/repo', staged, t))
    expect(result.current.hasStagedChanges).toBe(true)
  })

  it('reports nothing when the plan maps cleanly onto the working tree', async () => {
    summaryGroupingRun.mockResolvedValue([
      { commitMessage: 'feat(a): add a', files: ['src/a.ts', 'src/a.test.ts'] },
      { commitMessage: 'docs: update x', files: ['docs/x.md'] },
    ])
    const { result } = renderHook(() => useCommitBatchReview('/repo', files, t))
    await act(async () => result.current.openAndGenerate())

    expect(result.current.reconciliation).toBeNull()
  })

  /**
   * The silent-loss bug: a proposal whose every path was invented or already taken used to vanish
   * with its message, leaving a plan that no longer said what the model proposed. The files are
   * still rescued by the leftovers pass — what was missing was any sign it had happened.
   */
  it('counts the proposals it had to discard whole, instead of dropping them silently', async () => {
    summaryGroupingRun.mockResolvedValue([
      { commitMessage: 'feat(a): add a', files: ['src/a.ts'] },
      // Invented path — nothing in the working tree matches.
      { commitMessage: 'feat(b): add b', files: ['src/ghost.ts'] },
      // Every path already claimed by the first proposal.
      { commitMessage: 'refactor(a): tidy a', files: ['src/a.ts'] },
    ])
    const { result } = renderHook(() => useCommitBatchReview('/repo', files, t))
    await act(async () => result.current.openAndGenerate())

    expect(result.current.reconciliation).toEqual({
      discardedProposals: 2,
      unknownPaths: ['src/ghost.ts'],
      duplicatePaths: ['src/a.ts'],
    })
    // Only the surviving proposal, plus the leftovers group holding what nobody placed.
    expect(result.current.proposals.map((p) => p.commitMessage)).toEqual(['feat(a): add a', ''])
    expect(result.current.proposals[1].files.map((f) => f.path).sort()).toEqual([
      'docs/x.md',
      'src/a.test.ts',
    ])
  })

  it('reports a partial loss even when the proposal itself survives', async () => {
    summaryGroupingRun.mockResolvedValue([
      { commitMessage: 'feat(a): add a', files: ['src/a.ts', 'src/ghost.ts'] },
      { commitMessage: 'docs: update x', files: ['docs/x.md'] },
    ])
    const { result } = renderHook(() => useCommitBatchReview('/repo', files, t))
    await act(async () => result.current.openAndGenerate())

    expect(result.current.reconciliation).toEqual({
      discardedProposals: 0,
      unknownPaths: ['src/ghost.ts'],
      duplicatePaths: [],
    })
    expect(result.current.proposals[0].files.map((f) => f.path)).toEqual(['src/a.ts'])
  })

  it('clears the previous run reconciliation when regenerating', async () => {
    summaryGroupingRun.mockResolvedValueOnce([
      { commitMessage: 'feat(a): add a', files: ['src/ghost.ts', 'src/a.ts'] },
    ])
    const { result } = renderHook(() => useCommitBatchReview('/repo', files, t))
    await act(async () => result.current.openAndGenerate())
    expect(result.current.reconciliation).not.toBeNull()

    summaryGroupingRun.mockResolvedValueOnce([
      { commitMessage: 'feat(a): add a', files: ['src/a.ts', 'src/a.test.ts', 'docs/x.md'] },
    ])
    await act(async () => result.current.regenerate())

    expect(result.current.reconciliation).toBeNull()
  })

  it('refuses to generate while a merge is in progress, before spending a generation', async () => {
    mocked.apiGetPendingOperation.mockResolvedValue('merge')
    const { result } = renderHook(() => useCommitBatchReview('/repo', files, t))

    await act(async () => result.current.openAndGenerate())

    expect(result.current.error).toBe('commitDetails.pendingOperation')
    expect(apiGetAiContext).not.toHaveBeenCalled()
    expect(summaryGroupingRun).not.toHaveBeenCalled()
  })

  it('refuses to apply when the repo entered a merge after the plan was generated', async () => {
    summaryGroupingRun.mockResolvedValue([{ commitMessage: 'feat: a', files: ['src/a.ts'] }])
    const { result } = renderHook(() => useCommitBatchReview('/repo', files, t))
    await act(async () => result.current.openAndGenerate())

    mocked.apiGetPendingOperation.mockResolvedValue('rebase')
    await act(async () => result.current.applyAccepted())

    expect(result.current.error).toBe('commitDetails.pendingOperation')
    // Nothing was written — in particular the index was left alone, since unstaging during a
    // paused rebase throws away the user's conflict resolution.
    expect(mocked.apiUnstageAll).not.toHaveBeenCalled()
    expect(mocked.apiCreateCommit).not.toHaveBeenCalled()
    expect(result.current.isOpen).toBe(true)
  })

  it('drops the commits that landed after a partial failure, so a retry does not duplicate them', async () => {
    summaryGroupingRun.mockResolvedValue([
      { commitMessage: 'feat(a): add a', files: ['src/a.ts'] },
      { commitMessage: 'test(a): cover a', files: ['src/a.test.ts'] },
      { commitMessage: 'docs: update x', files: ['docs/x.md'] },
    ])
    const onRefresh = vi.fn()
    const { result } = renderHook(() => useCommitBatchReview('/repo', files, t, onRefresh))
    await act(async () => result.current.openAndGenerate())

    // The second commit fails; the first one is already in the repo.
    mocked.apiCreateCommit
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('hook rejected the commit'))
    await act(async () => result.current.applyAccepted())

    expect(result.current.error).toContain('commitDetails.aiBatch.partialFailure')
    expect(result.current.isOpen).toBe(true)
    // The applied proposal is gone; the two that never ran are still on screen.
    expect(result.current.proposals.map((p) => p.commitMessage)).toEqual([
      'test(a): cover a',
      'docs: update x',
    ])
    // The new commit exists, so the graph and the WIP list have to be re-read.
    expect(onRefresh).toHaveBeenCalledOnce()

    // Retrying replays only what is left — no empty duplicate of 'feat(a): add a'.
    mocked.apiCreateCommit.mockReset().mockResolvedValue(undefined)
    await act(async () => result.current.applyAccepted())

    expect(mocked.apiCreateCommit).toHaveBeenCalledTimes(2)
    expect(mocked.apiCreateCommit).not.toHaveBeenCalledWith('/repo', 'feat(a): add a')
  })

  it('skips an accepted group with no message rather than committing it subjectless', async () => {
    summaryGroupingRun.mockResolvedValue([{ commitMessage: 'feat(a): add a', files: ['src/a.ts'] }])
    const { result } = renderHook(() => useCommitBatchReview('/repo', files, t))
    await act(async () => result.current.openAndGenerate())

    // Accept the leftovers group, which the model left without a message.
    expect(result.current.proposals[1].commitMessage).toBe('')
    act(() => result.current.toggleAccepted(1))

    expect(result.current.acceptedCount).toBe(1)
    await act(async () => result.current.applyAccepted())

    expect(mocked.apiCreateCommit).toHaveBeenCalledTimes(1)
    expect(mocked.apiCreateCommit).toHaveBeenCalledWith('/repo', 'feat(a): add a')
  })

  describe('the two-phase planner', () => {
    const manyPaths = Array.from({ length: 14 }, (_, i) => `src/f${i}.ts`)
    const manyFiles = manyPaths.map((p) => file(p))

    beforeEach(() => {
      apiGetAiContext.mockResolvedValue({
        ...aiContext,
        files: manyPaths.map((path) => ({ path, status: 'modified' })),
      })
      summaryGroupingRun.mockResolvedValue([
        { commitMessage: 'feat: everything', files: manyPaths },
      ])
    })

    it('summarizes every file, whatever the size of the changeset', async () => {
      const { result } = renderHook(() => useCommitBatchReview('/repo', manyFiles, t))

      await act(async () => result.current.openAndGenerate())

      expect(fileSummaryRun).toHaveBeenCalledTimes(14)
      expect(summaryGroupingRun).toHaveBeenCalledTimes(1)
    })

    it('summarizes even a three-file changeset — there is no threshold', async () => {
      apiGetAiContext.mockResolvedValue(aiContext)
      summaryGroupingRun.mockResolvedValue([{ commitMessage: 'feat: a', files: ['src/a.ts'] }])
      const { result } = renderHook(() => useCommitBatchReview('/repo', files, t))

      await act(async () => result.current.openAndGenerate())

      expect(fileSummaryRun).toHaveBeenCalledTimes(3)
    })

    it('clears progress once the run finishes', async () => {
      const { result } = renderHook(() => useCommitBatchReview('/repo', manyFiles, t))

      await act(async () => result.current.openAndGenerate())

      expect(result.current.progress).toBeNull()
      expect(result.current.isGenerating).toBe(false)
    })

    /**
     * Closing the panel sets a ref the planner polls between calls. It has to be a ref: the planner
     * loop closed over the render that started it, so a state value would read `false` forever.
     */
    it('stops summarizing mid-run when the user closes the panel, and reports no error', async () => {
      let started = 0
      const { result } = renderHook(() => useCommitBatchReview('/repo', manyFiles, t))
      // Close the panel from inside the fourth call, so cancellation is observed *during* the map
      // phase rather than before it starts.
      fileSummaryRun.mockImplementation(async () => {
        started += 1
        if (started === 4) result.current.close()
        return { intent: 'changes it', area: 'demo' }
      })

      await act(async () => result.current.openAndGenerate())

      // The in-flight call finished (nothing can abort it), then the loop stopped at the boundary.
      expect(started).toBe(4)
      expect(summaryGroupingRun).not.toHaveBeenCalled()
      // A cancellation is not a failure — an error here would be waiting on the next open.
      expect(result.current.error).toBeNull()
      expect(result.current.isGenerating).toBe(false)
      expect(result.current.progress).toBeNull()
    })

    it('still surfaces the unplaced group when the grouping call drops files', async () => {
      summaryGroupingRun.mockResolvedValue([
        { commitMessage: 'feat: most of it', files: manyPaths.slice(0, 12) },
      ])
      const { result } = renderHook(() => useCommitBatchReview('/repo', manyFiles, t))

      await act(async () => result.current.openAndGenerate())

      // The backstop stays necessary: nothing about summaries forces the reduce call to be complete.
      const last = result.current.proposals[result.current.proposals.length - 1]
      expect(last.kind).toBe('unplaced')
      expect(last.files.map((f) => f.path)).toEqual(['src/f12.ts', 'src/f13.ts'])
    })
  })

  it('reports no-changes when the working tree is empty', async () => {
    apiGetAiContext.mockResolvedValue({ ...aiContext, files: [] })
    const { result } = renderHook(() => useCommitBatchReview('/repo', [], t))

    await act(async () => result.current.openAndGenerate())

    expect(result.current.error).toBe('commitDetails.aiBatch.noChanges')
    expect(summaryGroupingRun).not.toHaveBeenCalled()
  })
})
