import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CommitReorderDialog } from './CommitReorderDialog'
import type { PendingCommitReorder } from '../hooks/useCommitReorderDrag'

function summary(oid: string, subject = `subject ${oid}`) {
  return { oid, shortOid: oid, subject }
}

function pending(overrides: Partial<PendingCommitReorder> = {}): PendingCommitReorder {
  return {
    operation: {
      kind: 'reorder',
      sourceOids: ['aaa'],
      target: { kind: 'gap', oid: 'ccc', edge: 'above' },
      baseOid: 'ccc',
      affectedOids: ['aaa', 'bbb', 'ccc'],
      resultOids: ['bbb', 'aaa', 'ccc'],
    },
    sources: [summary('aaa')],
    target: summary('ccc'),
    preview: [summary('bbb'), summary('aaa'), summary('ccc')],
    rewritesPublished: false,
    ...overrides,
  }
}

function combining(overrides: Partial<PendingCommitReorder> = {}): PendingCommitReorder {
  return pending({
    operation: {
      kind: 'combine',
      sourceOids: ['aaa'],
      target: { kind: 'combine', oid: 'ccc' },
      baseOid: 'ccc',
      affectedOids: ['aaa', 'bbb', 'ccc'],
      resultOids: ['bbb', 'ccc', 'aaa'],
    },
    preview: [summary('bbb'), summary('ccc'), summary('aaa')],
    ...overrides,
  })
}

function renderDialog(props: Partial<React.ComponentProps<typeof CommitReorderDialog>> = {}) {
  const onConfirm = vi.fn()
  const onCancel = vi.fn()
  render(
    <CommitReorderDialog
      pending={pending()}
      busy={false}
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...props}
    />
  )
  return { onConfirm, onCancel }
}

describe('CommitReorderDialog', () => {
  it('renders nothing without a pending drop', () => {
    renderDialog({ pending: null })
    expect(screen.queryByTestId('commit-reorder-dialog')).not.toBeInTheDocument()
  })

  it('names the reorder and previews the resulting order', () => {
    renderDialog()
    expect(screen.getByText('Reorder commits')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Move this commit next to "subject ccc". Your branch will be rewritten from there up.'
      )
    ).toBeInTheDocument()
    const rows = screen.getByTestId('commit-reorder-preview').querySelectorAll('li')
    expect([...rows].map((li) => li.textContent)).toEqual([
      'bbbsubject bbb',
      'aaasubject aaa',
      'cccsubject ccc',
    ])
    expect(screen.getByTestId('commit-reorder-preview-aaa')).toHaveAttribute('data-moved', 'true')
  })

  it('offers no message mode for a reorder — nothing is being merged', () => {
    renderDialog()
    expect(screen.queryByTestId('commit-reorder-mode-squash')).not.toBeInTheDocument()
  })

  it('confirms a combine with fixup by default, and squash once picked', async () => {
    const user = userEvent.setup()
    const { onConfirm } = renderDialog({ pending: combining() })
    expect(screen.getByText('Combine commits')).toBeInTheDocument()

    await user.click(screen.getByTestId('commit-reorder-confirm'))
    expect(onConfirm).toHaveBeenCalledWith('fixup')

    await user.click(screen.getByTestId('commit-reorder-mode-squash'))
    await user.click(screen.getByTestId('commit-reorder-confirm'))
    expect(onConfirm).toHaveBeenLastCalledWith('squash')
  })

  it('warns when the rewrite reaches commits that are already pushed', () => {
    renderDialog({ pending: pending({ rewritesPublished: true }) })
    expect(screen.getByTestId('commit-reorder-published-warning')).toHaveTextContent(
      'has to be a force-push'
    )
  })

  it('keeps the warning away when nothing is published', () => {
    renderDialog()
    expect(screen.queryByTestId('commit-reorder-published-warning')).not.toBeInTheDocument()
  })

  it('says how many commits get replayed, so a conflict is not a surprise', () => {
    renderDialog()
    expect(screen.getByText(/3 commits will be replayed/)).toBeInTheDocument()
  })

  it('locks both buttons while the rebase runs', () => {
    renderDialog({ busy: true })
    expect(screen.getByTestId('commit-reorder-confirm')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  })

  it('cancels on the cancel button', async () => {
    const user = userEvent.setup()
    const { onCancel } = renderDialog()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalled()
  })
})
