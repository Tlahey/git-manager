import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeBoard, makeCard } from '../test/boardFactories'
import { mergeTrackedIssues, pushCardToIssue } from './trackedIssue.api'

const { fetchIssueDetail, updateIssue, addLabels, removeLabel, addAssignees, removeAssignees, createOrUpdateLabel } =
  vi.hoisted(() => ({
    fetchIssueDetail: vi.fn(),
    updateIssue: vi.fn(),
    addLabels: vi.fn(),
    removeLabel: vi.fn(),
    addAssignees: vi.fn(),
    removeAssignees: vi.fn(),
    createOrUpdateLabel: vi.fn(),
  }))

vi.mock('../../../api/github/github-issues.api', () => ({ fetchIssueDetail, updateIssue }))
vi.mock('../../../api/github/github-labels.api', () => ({
  addLabels,
  removeLabel,
  addAssignees,
  removeAssignees,
  createOrUpdateLabel,
}))

const board = makeBoard({ tags: [{ id: 't-bug', name: 'bug', color: '#ff0000' }] })
const ref = { owner: 'acme', repo: 'widgets', number: 42 }

function rawIssue(overrides: Record<string, unknown> = {}) {
  return {
    number: 42,
    title: 'From GitHub',
    body: 'Issue body',
    state: 'open',
    updated_at: '2026-08-04T10:00:00Z',
    labels: [],
    assignees: [],
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('mergeTrackedIssues', () => {
  it('overlays the issue onto a tracked card and leaves untracked cards alone', async () => {
    fetchIssueDetail.mockResolvedValue(rawIssue())
    const cards = [
      makeCard({ id: 'c1', title: 'local only' }),
      makeCard({ id: 'c2', title: 'stale copy', sourceIssue: ref }),
    ]

    const merged = await mergeTrackedIssues(board, cards, 'tok')

    expect(merged[0].title).toBe('local only')
    expect(merged[1].title).toBe('From GitHub')
    expect(merged[1].issueState).toBe('open')
  })

  it('makes no request when nothing is tracked', async () => {
    await mergeTrackedIssues(board, [makeCard()], 'tok')
    expect(fetchIssueDetail).not.toHaveBeenCalled()
  })

  /**
   * The degradation that matters: GitHub being unreachable must show the last known content, not an
   * empty card. `issueState` staying undefined is the signal the UI reads.
   */
  it('keeps the stored card when its issue cannot be fetched', async () => {
    fetchIssueDetail.mockRejectedValue(new Error('offline'))
    const card = makeCard({ id: 'c2', title: 'last known title', sourceIssue: ref })

    const [merged] = await mergeTrackedIssues(board, [card], 'tok')

    expect(merged.title).toBe('last known title')
    expect(merged.issueState).toBeUndefined()
  })

  it('does not let one unreachable issue blank the others', async () => {
    fetchIssueDetail
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(rawIssue({ number: 7, title: 'Fetched fine' }))

    const merged = await mergeTrackedIssues(
      board,
      [
        makeCard({ id: 'a', title: 'kept', sourceIssue: ref }),
        makeCard({ id: 'b', title: 'replaced', sourceIssue: { ...ref, number: 7 } }),
      ],
      'tok'
    )

    expect(merged[0].title).toBe('kept')
    expect(merged[1].title).toBe('Fetched fine')
  })
})

describe('pushCardToIssue', () => {
  it('writes the title and the composed body', async () => {
    fetchIssueDetail.mockResolvedValue(rawIssue())
    const card = makeCard({ title: 'New title', description: 'Prose.', dod: '- [ ] Done?' })

    await pushCardToIssue(board, card, ref, 'tok')

    expect(updateIssue).toHaveBeenCalledWith(
      'acme',
      'widgets',
      42,
      { title: 'New title', body: 'Prose.\n\n## Definition of Done\n\n- [ ] Done?' },
      'tok'
    )
  })

  it('moves the assignee across', async () => {
    fetchIssueDetail.mockResolvedValue(rawIssue({ assignees: [{ login: 'bob' }] }))

    await pushCardToIssue(board, makeCard({ assignee: 'ada' }), ref, 'tok')

    expect(removeAssignees).toHaveBeenCalledWith('acme', 'widgets', 42, ['bob'], 'tok')
    expect(addAssignees).toHaveBeenCalledWith('acme', 'widgets', 42, ['ada'], 'tok')
  })

  /** The invariant `trackedIssueMapping` exists for, checked at the call layer too. */
  it('never removes a remote board’s column label', async () => {
    fetchIssueDetail.mockResolvedValue(
      rawIssue({
        labels: [{ name: 'board:xyz:status:todo' }, { name: 'priority:high' }],
      })
    )

    await pushCardToIssue(board, makeCard({ priority: 'normal' }), ref, 'tok')

    expect(removeLabel).toHaveBeenCalledWith('acme', 'widgets', 42, 'priority:high', 'tok')
    expect(removeLabel).not.toHaveBeenCalledWith(
      'acme',
      'widgets',
      42,
      'board:xyz:status:todo',
      'tok'
    )
  })

  it('creates a tag’s label with its colour before attaching it', async () => {
    fetchIssueDetail.mockResolvedValue(rawIssue())

    await pushCardToIssue(board, makeCard({ tagIds: ['t-bug'] }), ref, 'tok')

    expect(createOrUpdateLabel).toHaveBeenCalledWith('acme', 'widgets', 'bug', '#ff0000', 'tok')
    expect(addLabels).toHaveBeenCalledWith('acme', 'widgets', 42, ['bug'], 'tok')
  })

  it('touches no label when nothing changed', async () => {
    fetchIssueDetail.mockResolvedValue(rawIssue({ labels: [{ name: 'bug' }] }))

    await pushCardToIssue(board, makeCard({ tagIds: ['t-bug'] }), ref, 'tok')

    expect(addLabels).not.toHaveBeenCalled()
    expect(removeLabel).not.toHaveBeenCalled()
  })
})
