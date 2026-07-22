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
  RevertDialog: (p: { commitOid: string; commitSubject: string; onClose: () => void }) => (
    <div data-testid="revert-dialog" data-oid={p.commitOid} data-subject={p.commitSubject}>
      <button onClick={p.onClose}>close-revert</button>
    </div>
  ),
}))
vi.mock('../TagDialog', () => ({
  TagDialog: (p: { oid: string; shortOid: string; annotated: boolean; onClose: () => void }) => (
    <div
      data-testid="tag-dialog"
      data-oid={p.oid}
      data-short-oid={p.shortOid}
      data-annotated={String(p.annotated)}
    >
      <button onClick={p.onClose}>close-tag</button>
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

  it('opens the tag dialog, forwarding the "annotated" flag', () => {
    renderManager({ kind: 'tag', annotated: true })
    expect(screen.getByTestId('tag-dialog').dataset.annotated).toBe('true')
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
