import { describe, it, expect } from 'vitest'
import { makeBoard, makeCard } from '../test/boardFactories'
import { boardColumnLabel } from './remoteCardMapping'
import {
  bodyForTrackedCard,
  isTrackedManagedLabel,
  mergeTrackedIssue,
  parseIssueReference,
  reconcileTrackedLabels,
  splitPatch,
  trackedLabelsFor,
  type RawTrackedIssue,
} from './trackedIssueMapping'

const board = makeBoard({
  tags: [
    { id: 't-bug', name: 'bug', color: '#ff0000' },
    { id: 't-ux', name: 'ux', color: '#00ff00' },
  ],
})

function issue(overrides: Partial<RawTrackedIssue> = {}): RawTrackedIssue {
  return {
    number: 42,
    title: 'Header overlaps on mobile',
    body: 'It covers the logo.',
    updatedAt: '2026-08-04T10:00:00Z',
    labels: [],
    assignees: [],
    state: 'open',
    ...overrides,
  }
}

describe('mergeTrackedIssue', () => {
  it('takes the content from the issue', () => {
    const merged = mergeTrackedIssue(
      board,
      makeCard({ title: 'stale', description: 'stale' }),
      issue({ assignees: ['ada'], labels: ['priority:high', 'bug'] })
    )

    expect(merged.title).toBe('Header overlaps on mobile')
    expect(merged.description).toBe('It covers the logo.')
    expect(merged.assignee).toBe('ada')
    expect(merged.priority).toBe('high')
    expect(merged.tagIds).toEqual(['t-bug'])
    expect(merged.issueState).toBe('open')
  })

  /** The placement is the one thing a tracked card keeps locally — it is what buys the drag-reorder
   * the remote backend cannot persist. */
  it('keeps the local placement, identity and archive flag', () => {
    const card = makeCard({
      id: 'c9',
      columnId: 'review',
      order: 7,
      number: 3,
      archivedAt: '2026-08-01T00:00:00Z',
    })
    const merged = mergeTrackedIssue(board, card, issue())

    expect(merged.id).toBe('c9')
    expect(merged.columnId).toBe('review')
    expect(merged.order).toBe(7)
    expect(merged.number).toBe(3)
    expect(merged.archivedAt).toBe('2026-08-01T00:00:00Z')
  })

  it('reads the fields GitHub has no home for out of the body marker', () => {
    const merged = mergeTrackedIssue(
      board,
      makeCard(),
      issue({
        body: [
          'Prose.',
          '',
          '## Definition of Done',
          '',
          '- [x] Tested',
          '',
          '<!-- git-manager:meta {"dueDate":"2026-09-01","blockedReason":"Waiting on design"} -->',
        ].join('\n'),
      })
    )

    expect(merged.description).toBe('Prose.')
    expect(merged.dod).toBe('- [x] Tested')
    expect(merged.dueDate).toBe('2026-09-01')
    expect(merged.blockedReason).toBe('Waiting on design')
  })

  it('reports a closed issue', () => {
    expect(mergeTrackedIssue(board, makeCard(), issue({ state: 'closed' })).issueState).toBe(
      'closed'
    )
  })
})

describe('splitPatch', () => {
  it('sends content to the issue and placement to the local board', () => {
    const { issuePatch, localPatch } = splitPatch({
      title: 'New title',
      priority: 'high',
      columnId: 'done',
      order: 2,
      archivedAt: '2026-08-04T00:00:00Z',
    })

    expect(issuePatch).toEqual({ title: 'New title', priority: 'high' })
    expect(localPatch).toEqual({
      columnId: 'done',
      order: 2,
      archivedAt: '2026-08-04T00:00:00Z',
    })
  })

  /** A `null` clearing a field has to reach the issue as a `null`, not be dropped as falsy. */
  it('keeps a cleared field rather than dropping it', () => {
    const { issuePatch } = splitPatch({ dueDate: null, assignee: null })
    expect(issuePatch).toEqual({ dueDate: null, assignee: null })
    expect('dueDate' in issuePatch).toBe(true)
  })
})

describe('label reconciliation', () => {
  it('derives tags, priority and blocked — and never a column label', () => {
    const labels = trackedLabelsFor(
      board,
      makeCard({ tagIds: ['t-bug'], priority: 'low', blockedReason: 'Stuck' })
    )
    expect(labels).toEqual(['bug', 'priority:low', 'blocked'])
    expect(labels.some((l) => l.startsWith('board:'))).toBe(false)
  })

  it('adds no label for normal priority', () => {
    expect(trackedLabelsFor(board, makeCard({ priority: 'normal' }))).toEqual([])
  })

  /**
   * The invariant this whole module exists for: the same issue can be on a remote board *and*
   * tracked here, and a local edit must not evict it from that board.
   */
  it('leaves a remote board’s column label alone', () => {
    const columnLabel = boardColumnLabel('remote-board', 'in-progress')
    expect(isTrackedManagedLabel(board, columnLabel)).toBe(false)

    const { toRemove } = reconcileTrackedLabels(board, [columnLabel, 'bug'], [])
    expect(toRemove).toEqual(['bug'])
    expect(toRemove).not.toContain(columnLabel)
  })

  it('leaves labels the repo owns alone', () => {
    const { toAdd, toRemove } = reconcileTrackedLabels(
      board,
      ['good first issue', 'priority:high'],
      ['bug']
    )
    expect(toAdd).toEqual(['bug'])
    expect(toRemove).toEqual(['priority:high'])
    expect(toRemove).not.toContain('good first issue')
  })
})

describe('bodyForTrackedCard', () => {
  it('round-trips through parse without losing anything', () => {
    const card = makeCard({
      description: 'Prose.',
      dod: '- [ ] Tested',
      dueDate: '2026-09-01',
      blockedReason: 'Waiting',
      linkedBranch: 'feature/x',
    })
    const merged = mergeTrackedIssue(board, card, issue({ body: bodyForTrackedCard(card) }))

    expect(merged.description).toBe('Prose.')
    expect(merged.dod).toBe('- [ ] Tested')
    expect(merged.dueDate).toBe('2026-09-01')
    expect(merged.blockedReason).toBe('Waiting')
    expect(merged.linkedBranch).toBe('feature/x')
  })

  it('writes no marker when there is nothing extra to store', () => {
    const body = bodyForTrackedCard(makeCard({ description: 'Just prose.', dod: '' }))
    expect(body).toBe('Just prose.')
    expect(body).not.toContain('git-manager:meta')
  })
})

describe('parseIssueReference', () => {
  it.each([
    ['42', 42],
    ['#42', 42],
    ['  42  ', 42],
    ['https://github.com/acme/widgets/issues/42', 42],
    ['https://github.com/acme/widgets/pull/42', 42],
  ])('reads %s as %i', (input, expected) => {
    expect(parseIssueReference(input)).toBe(expected)
  })

  it.each(['', '   ', 'abc', '0', '-3', '4.5', 'https://github.com/acme/widgets'])(
    'rejects %s',
    (input) => {
      expect(parseIssueReference(input)).toBeNull()
    }
  )
})

describe('bodyForTrackedCard — what the card does not own', () => {
  /**
   * The marker is rewritten whole and the same issue can also be a *remote board* card, whose
   * identifier and relations live in it. Dropping them meant renaming a tracked card silently
   * stripped the other card's `GM-7` and every link it declared.
   */
  it('carries a foreign prefix and links across an edit', () => {
    const existing = `Old text\n\n<!-- git-manager:meta ${JSON.stringify({
      prefix: 'GM',
      links: [{ targetBoardId: 'b1', targetCardId: '9', kind: 'blocks' }],
    })} -->`

    const body = bodyForTrackedCard(makeCard({ description: 'New text' }), existing)

    expect(body).toContain('New text')
    expect(body).toContain('"prefix":"GM"')
    expect(body).toContain('"targetCardId":"9"')
  })

  it('still replaces the fields the tracked card does own', () => {
    const existing = `Text\n\n<!-- git-manager:meta ${JSON.stringify({
      prefix: 'GM',
      dueDate: '2020-01-01',
    })} -->`

    const body = bodyForTrackedCard(
      makeCard({ dueDate: '2030-12-31', blockedReason: 'Waiting on the API' }),
      existing
    )

    expect(body).toContain('"dueDate":"2030-12-31"')
    expect(body).not.toContain('2020-01-01')
    expect(body).toContain('Waiting on the API')
    expect(body).toContain('"prefix":"GM"')
  })

  it('writes no marker at all for a card with nothing extra, on a bare issue', () => {
    expect(bodyForTrackedCard(makeCard({ description: 'Just prose' }), 'Just prose')).toBe(
      'Just prose'
    )
  })
})
