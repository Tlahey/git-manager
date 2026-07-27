import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { GitGraphNode } from '@git-manager/git-types'

const { useCommitRecompose } = vi.hoisted(() => ({ useCommitRecompose: vi.fn() }))
vi.mock('../../../hooks/useCommitRecompose', () => ({ useCommitRecompose }))

import { RecomposeDialog } from './RecomposeDialog'

function node(oid: string): GitGraphNode {
  return {
    commit: { oid, shortOid: oid, parentOids: [], message: `old ${oid}` },
    refs: [],
  } as unknown as GitGraphNode
}

/** Newest first, as the graph holds them: ccc is the tip, aaa the oldest. */
const nodes = [node('ccc'), node('bbb'), node('aaa')]

function proposal(oid: string, overrides = {}) {
  return {
    oid,
    shortOid: oid,
    previousMessage: `old ${oid}`,
    proposedMessage: 'feat: rewritten',
    accepted: true,
    ...overrides,
  }
}

function recomposeState(overrides = {}) {
  return {
    status: 'idle' as const,
    error: null,
    proposals: [proposal('aaa')],
    progress: { done: 1, total: 1 },
    validations: {},
    setMessage: vi.fn(),
    toggleAccepted: vi.fn(),
    generate: vi.fn(),
    apply: vi.fn(),
    reset: vi.fn(),
    acceptedCount: 1,
    canApply: true,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  useCommitRecompose.mockReturnValue(recomposeState())
})

function renderDialog(props: Partial<React.ComponentProps<typeof RecomposeDialog>> = {}) {
  return render(
    <RecomposeDialog
      repoPath="/repo"
      nodes={nodes}
      targetOid="aaa"
      includeChildren={false}
      open
      onClose={vi.fn()}
      onSuccess={vi.fn()}
      {...props}
    />
  )
}

describe('RecomposeDialog', () => {
  it('warns that history is being rewritten, above the button that does it', () => {
    // The consequence invisible from the menu entry: every commit after the target gets a new SHA,
    // so an already-pushed branch needs a force-push.
    renderDialog()
    expect(screen.getByTestId('recompose-warning')).toHaveTextContent('rewrites history')
    expect(screen.getByTestId('recompose-warning')).toHaveTextContent('force-push')
  })

  it('generates for the clicked commit alone by default', () => {
    renderDialog()
    expect(useCommitRecompose.mock.results[0].value.generate).toHaveBeenCalledWith([
      { oid: 'aaa', shortOid: 'aaa', message: 'old aaa' },
    ])
  })

  it('includes every descendant, oldest first, when asked to', async () => {
    // Oldest-first is what the rebase needs; the graph holds them newest-first.
    renderDialog({ includeChildren: true })
    const { generate } = useCommitRecompose.mock.results[0].value
    expect(generate).toHaveBeenCalledWith([
      { oid: 'aaa', shortOid: 'aaa', message: 'old aaa' },
      { oid: 'bbb', shortOid: 'bbb', message: 'old bbb' },
      { oid: 'ccc', shortOid: 'ccc', message: 'old ccc' },
    ])
  })

  it('says how many further commits are rewritten without being edited', () => {
    // Rewording aaa alone still rewrites bbb and ccc — stated, because it is not otherwise visible.
    renderDialog({ targetOid: 'aaa', includeChildren: false })
    expect(screen.getByTestId('recompose-carried-along')).toHaveTextContent(
      '2 further commits are rewritten too'
    )
  })

  it('says nothing about carried-along commits when they are all on screen', () => {
    renderDialog({ includeChildren: true })
    expect(screen.queryByTestId('recompose-carried-along')).not.toBeInTheDocument()
  })

  it('shows the current message beside the proposed one', () => {
    renderDialog()
    expect(screen.getByText(/old aaa/)).toBeInTheDocument()
    expect(screen.getByTestId('recompose-message-aaa')).toHaveValue('feat: rewritten')
  })

  it('lets a commit keep its message', async () => {
    const toggleAccepted = vi.fn()
    useCommitRecompose.mockReturnValue(recomposeState({ toggleAccepted }))
    renderDialog()
    await userEvent.setup().click(screen.getByTestId('recompose-keep-aaa'))
    expect(toggleAccepted).toHaveBeenCalledWith('aaa')
  })

  it('cannot apply when nothing would change', () => {
    useCommitRecompose.mockReturnValue(recomposeState({ acceptedCount: 0, canApply: false }))
    renderDialog()
    expect(screen.getByTestId('recompose-apply')).toBeDisabled()
    expect(screen.getByTestId('recompose-nothing')).toBeInTheDocument()
  })

  it('reports progress while the model works', () => {
    useCommitRecompose.mockReturnValue(
      recomposeState({ status: 'generating', progress: { done: 1, total: 3 } })
    )
    renderDialog()
    expect(screen.getByTestId('recompose-progress')).toHaveTextContent('commit 2 of 3')
  })

  it('surfaces a failure rather than an empty list', () => {
    useCommitRecompose.mockReturnValue(recomposeState({ error: 'provider down' }))
    renderDialog()
    expect(screen.getByTestId('recompose-error')).toHaveTextContent('provider down')
  })

  it('applies on confirm', async () => {
    const apply = vi.fn()
    useCommitRecompose.mockReturnValue(recomposeState({ apply }))
    renderDialog()
    await userEvent.setup().click(screen.getByTestId('recompose-apply'))
    expect(apply).toHaveBeenCalledOnce()
  })

  it('cannot be cancelled mid-write', () => {
    useCommitRecompose.mockReturnValue(recomposeState({ status: 'applying' }))
    renderDialog()
    expect(screen.getByTestId('recompose-apply')).toBeDisabled()
    expect(screen.getByTestId('recompose-regenerate')).toBeDisabled()
  })

  it('flags a proposal that breaks the project convention, without blocking it', () => {
    useCommitRecompose.mockReturnValue(
      recomposeState({
        validations: {
          aaa: { valid: false, problems: [{ code: 'format', message: 'Missing a type prefix' }] },
        },
      })
    )
    renderDialog()
    expect(screen.getByTestId('recompose-validation-aaa')).toHaveTextContent('Missing a type prefix')
    expect(screen.getByTestId('recompose-apply')).toBeEnabled()
  })
})
