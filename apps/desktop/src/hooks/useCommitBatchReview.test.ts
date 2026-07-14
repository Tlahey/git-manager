import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { ProcessedFileItem } from '../components/git-graph/components/CommitFileList'

vi.mock('../api/git.api', () => ({
  apiUnstageAll: vi.fn(),
  apiStageFile: vi.fn(),
  apiCreateCommit: vi.fn(),
}))

const { apiGetAiContext, fileGroupingRun } = vi.hoisted(() => ({
  apiGetAiContext: vi.fn(),
  fileGroupingRun: vi.fn(),
}))
vi.mock('../api/ai.api', () => ({
  apiGetAiContext,
  fileGroupingService: { run: fileGroupingRun },
}))

import { apiUnstageAll, apiStageFile, apiCreateCommit } from '../api/git.api'
import { useCommitBatchReview } from './useCommitBatchReview'
import { useSettingsStore } from '../stores/settings.store'

function setCommitPattern(pattern: string) {
  useSettingsStore.setState((s) => ({
    settings: { ...s.settings, git: { ...s.settings.git, commitPattern: pattern } },
  }))
}

const mocked = {
  apiUnstageAll: apiUnstageAll as unknown as ReturnType<typeof vi.fn>,
  apiStageFile: apiStageFile as unknown as ReturnType<typeof vi.fn>,
  apiCreateCommit: apiCreateCommit as unknown as ReturnType<typeof vi.fn>,
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
  setCommitPattern('')
})

describe('useCommitBatchReview', () => {
  const files = [file('src/a.ts'), file('src/a.test.ts'), file('docs/x.md')]

  it('opens, generates a plan, and maps proposals (all accepted by default)', async () => {
    fileGroupingRun.mockResolvedValue([
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
    fileGroupingRun.mockResolvedValue([{ commitMessage: 'feat(a): add a', files: ['src/a.ts'] }])
    const { result } = renderHook(() => useCommitBatchReview('/repo', files, t))

    await act(async () => result.current.openAndGenerate())

    const leftover = result.current.proposals[result.current.proposals.length - 1]
    expect(leftover.accepted).toBe(false)
    expect(leftover.files.map((f) => f.path).sort()).toEqual(['docs/x.md', 'src/a.test.ts'])
  })

  it('applies only accepted proposals: unstage-all, stage each group, commit in order', async () => {
    fileGroupingRun.mockResolvedValue([
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
    fileGroupingRun.mockResolvedValue([{ commitMessage: 'feat: a', files: ['src/a.ts'] }])
    const { result } = renderHook(() => useCommitBatchReview('/repo', files, t))
    await act(async () => result.current.openAndGenerate())

    act(() => result.current.setMessage(0, '  fix: better message  '))
    await act(async () => result.current.applyAccepted())

    expect(mocked.apiCreateCommit).toHaveBeenCalledWith('/repo', 'fix: better message')
  })

  it('surfaces an error when the grouping service fails and keeps the dialog open', async () => {
    fileGroupingRun.mockRejectedValue(new Error('ai provider down'))
    const { result } = renderHook(() => useCommitBatchReview('/repo', files, t))

    await act(async () => result.current.openAndGenerate())

    expect(result.current.error).toContain('ai provider down')
    expect(result.current.isOpen).toBe(true)
    expect(result.current.canApply).toBe(false)
  })

  it('validates each proposal against the convention (default types when none configured)', async () => {
    fileGroupingRun.mockResolvedValue([
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
    fileGroupingRun.mockResolvedValue([
      { commitMessage: 'ABC-12: do the thing', files: ['src/a.ts'] },
      { commitMessage: 'feat: no ticket id', files: ['docs/x.md'] },
    ])
    const { result } = renderHook(() => useCommitBatchReview('/repo', files, t))
    await act(async () => result.current.openAndGenerate())

    expect(result.current.validations[0].valid).toBe(true)
    expect(result.current.validations[1].valid).toBe(false)
    expect(result.current.validations[1].problems[0].code).toBe('pattern')
  })

  it('reports no-changes when the working tree is empty', async () => {
    apiGetAiContext.mockResolvedValue({ ...aiContext, files: [] })
    const { result } = renderHook(() => useCommitBatchReview('/repo', [], t))

    await act(async () => result.current.openAndGenerate())

    expect(result.current.error).toBe('commitDetails.aiBatch.noChanges')
    expect(fileGroupingRun).not.toHaveBeenCalled()
  })
})
