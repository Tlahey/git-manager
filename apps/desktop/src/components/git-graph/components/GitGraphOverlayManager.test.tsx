import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { GitGraphNode } from '@git-manager/git-types'
import type { PendingAction } from '../../../hooks/useGitGraphActions'

vi.mock('../CreateBranchHereDialog', () => ({
  CreateBranchHereDialog: (p: { oid: string; shortOid: string; onClose: () => void }) => (
    <div data-testid="branch-dialog" data-oid={p.oid} data-short-oid={p.shortOid}>
      <button onClick={p.onClose}>close-branch</button>
    </div>
  ),
}))
vi.mock('../../rollback/ResetDialog', () => ({
  ResetDialog: (p: {
    targetOid: string
    targetSubject: string
    initialMode: string
    onClose: () => void
    onSuccess: () => void
  }) => (
    <div
      data-testid="reset-dialog"
      data-target-oid={p.targetOid}
      data-target-subject={p.targetSubject}
      data-mode={p.initialMode}
    >
      <button onClick={p.onClose}>close-reset</button>
      <button onClick={p.onSuccess}>success-reset</button>
    </div>
  ),
}))
vi.mock('../../rollback/RevertDialog', () => ({
  RevertDialog: (p: {
    commitOid: string
    commitSubject: string
    parents?: { oid: string; shortOid: string; subject: string }[]
    onClose: () => void
  }) => (
    <div
      data-testid="revert-dialog"
      data-oid={p.commitOid}
      data-subject={p.commitSubject}
      data-parents={JSON.stringify(p.parents ?? [])}
    >
      <button onClick={p.onClose}>close-revert</button>
    </div>
  ),
}))
vi.mock('../CompareToWorkdirDialog', () => ({
  CompareToWorkdirDialog: (p: { oid: string; shortOid: string; onClose: () => void }) => (
    <div data-testid="compare-dialog" data-oid={p.oid} data-short-oid={p.shortOid}>
      <button onClick={p.onClose}>close-compare</button>
    </div>
  ),
}))
vi.mock('../CompareToParentDialog', () => ({
  CompareToParentDialog: (p: {
    oid: string
    shortOid: string
    parentNumber: number
    parentShortOid?: string
    onClose: () => void
  }) => (
    <div
      data-testid="compare-parent-dialog"
      data-oid={p.oid}
      data-parent-number={String(p.parentNumber)}
      data-parent-short-oid={p.parentShortOid ?? ''}
    >
      <button onClick={p.onClose}>close-compare-parent</button>
    </div>
  ),
}))

vi.mock('../RenameBranchDialog', () => ({
  RenameBranchDialog: (p: { branch: string; onClose: () => void }) => (
    <div data-testid="rename-branch-dialog" data-branch={p.branch}>
      <button onClick={p.onClose}>close-rename</button>
    </div>
  ),
}))

import { GitGraphOverlayManager } from './GitGraphOverlayManager'

function node(oid: string, overrides: Partial<GitGraphNode['commit']> = {}): GitGraphNode {
  return {
    commit: {
      oid,
      shortOid: oid.slice(0, 7),
      message: 'msg',
      subject: `Subject ${oid}`,
      body: '',
      author: {} as never,
      committer: {} as never,
      parentOids: [],
      ...overrides,
    },
    column: 0,
    color: '#000',
    connections: [],
    refs: [],
  }
}

const NODES = [node('aaa1111'), node('bbb2222')]

/** A merge whose two parents are the nodes above, so the manager can resolve both from the page. */
const MERGE_NODES = [node('mmm0000', { parentOids: ['aaa1111', 'bbb2222'] }), ...NODES]

function renderManager(
  pendingAction: PendingAction,
  overrides: Partial<React.ComponentProps<typeof GitGraphOverlayManager>> = {}
) {
  const onClearPendingAction = vi.fn()
  const utils = render(
    <GitGraphOverlayManager
      repoPath="/repo"
      nodes={NODES}
      primaryOid="aaa1111"
      protectedBranches={['main']}
      pendingAction={pendingAction}
      onClearPendingAction={onClearPendingAction}
      {...overrides}
    />
  )
  return { ...utils, onClearPendingAction }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GitGraphOverlayManager — gating', () => {
  it('renders nothing when there is no pending action', () => {
    const { container } = renderManager(null)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when there is no primary oid, even with a pending action', () => {
    const { container } = renderManager({ kind: 'branch' }, { primaryOid: null })
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when the primary oid does not match any known node', () => {
    const { container } = renderManager({ kind: 'branch' }, { primaryOid: 'unknown-oid' })
    expect(container).toBeEmptyDOMElement()
  })

  it('clears the pending action once consumed', () => {
    const { onClearPendingAction } = renderManager({ kind: 'branch' })
    expect(onClearPendingAction).toHaveBeenCalledOnce()
  })
})

describe('GitGraphOverlayManager — routing', () => {
  it('opens the branch dialog with the primary node oid/shortOid', () => {
    renderManager({ kind: 'branch' })
    const dialog = screen.getByTestId('branch-dialog')
    expect(dialog.dataset.oid).toBe('aaa1111')
    expect(dialog.dataset.shortOid).toBe('aaa1111')
  })

  it('opens the rename-branch dialog with the branch carried by the action', () => {
    renderManager({ kind: 'renameBranch', branch: 'feat' })
    expect(screen.getByTestId('rename-branch-dialog').dataset.branch).toBe('feat')
  })

  it('opens the revert dialog with the primary node oid/subject', () => {
    renderManager({ kind: 'revert' })
    const dialog = screen.getByTestId('revert-dialog')
    expect(dialog.dataset.oid).toBe('aaa1111')
    expect(dialog.dataset.subject).toBe('Subject aaa1111')
  })

  it('opens the compare dialog with the primary node oid/shortOid', () => {
    renderManager({ kind: 'compare' })
    expect(screen.getByTestId('compare-dialog')).toBeInTheDocument()
  })

  it('hands the revert dialog every parent of a merge, resolved from the loaded page', () => {
    renderManager({ kind: 'revert' }, { nodes: MERGE_NODES, primaryOid: 'mmm0000' })
    const parents = JSON.parse(screen.getByTestId('revert-dialog').dataset.parents as string)
    expect(parents).toEqual([
      { oid: 'aaa1111', shortOid: 'aaa1111', subject: 'Subject aaa1111' },
      { oid: 'bbb2222', shortOid: 'bbb2222', subject: 'Subject bbb2222' },
    ])
  })

  it('still lists a parent that scrolled out of the loaded page, by sha alone', () => {
    const detached = [node('mmm0000', { parentOids: ['aaa1111', 'ccc3333cccc'] }), ...NODES]
    renderManager({ kind: 'revert' }, { nodes: detached, primaryOid: 'mmm0000' })
    const parents = JSON.parse(screen.getByTestId('revert-dialog').dataset.parents as string)
    expect(parents[1]).toEqual({ oid: 'ccc3333cccc', shortOid: 'ccc3333', subject: '' })
  })

  it('opens the compare-against-parent dialog on the parent the action names', () => {
    renderManager(
      { kind: 'compareParent', parentNumber: 2 },
      { nodes: MERGE_NODES, primaryOid: 'mmm0000' }
    )
    const dialog = screen.getByTestId('compare-parent-dialog')
    expect(dialog.dataset.oid).toBe('mmm0000')
    expect(dialog.dataset.parentNumber).toBe('2')
    expect(dialog.dataset.parentShortOid).toBe('bbb2222')
  })

  it('ignores the tag action — inline tag creation is handled by the graph, not this overlay', () => {
    const { container } = renderManager({ kind: 'tag', annotated: true })
    expect(container).toBeEmptyDOMElement()
  })

  it('opens the reset dialog, falling back to the primary node oid/subject when the action omits a target', () => {
    renderManager({ kind: 'reset', mode: 'mixed' })
    const dialog = screen.getByTestId('reset-dialog')
    expect(dialog.dataset.targetOid).toBe('aaa1111')
    expect(dialog.dataset.targetSubject).toBe('Subject aaa1111')
    expect(dialog.dataset.mode).toBe('mixed')
  })

  it('opens the reset dialog using an explicit target oid/subject over the primary node', () => {
    renderManager({
      kind: 'reset',
      mode: 'hard',
      targetOid: 'bbb2222',
      targetSubject: 'Subject bbb2222',
    })
    const dialog = screen.getByTestId('reset-dialog')
    expect(dialog.dataset.targetOid).toBe('bbb2222')
    expect(dialog.dataset.targetSubject).toBe('Subject bbb2222')
  })
})

describe('GitGraphOverlayManager — closing', () => {
  it('closes the active dialog via onClose', () => {
    renderManager({ kind: 'branch' })
    expect(screen.getByTestId('branch-dialog')).toBeInTheDocument()
    fireEvent.click(screen.getByText('close-branch'))
    expect(screen.queryByTestId('branch-dialog')).not.toBeInTheDocument()
  })

  it('closes the reset dialog via onSuccess too', () => {
    renderManager({ kind: 'reset', mode: 'soft' })
    fireEvent.click(screen.getByText('success-reset'))
    expect(screen.queryByTestId('reset-dialog')).not.toBeInTheDocument()
  })
})
