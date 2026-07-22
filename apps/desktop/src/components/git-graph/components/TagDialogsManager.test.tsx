import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('../AnnotateTagDialog', () => ({
  AnnotateTagDialog: (p: { tagName: string }) => <div data-testid="annotate">{p.tagName}</div>,
}))
vi.mock('../DeleteRemoteTagDialog', () => ({
  DeleteRemoteTagDialog: (p: { tagName: string; remote: string }) => (
    <div data-testid="delete-remote">{`${p.tagName}@${p.remote}`}</div>
  ),
}))

import { TagDialogsManager } from './TagDialogsManager'

describe('TagDialogsManager', () => {
  it('renders nothing when there is no pending tag action', () => {
    const { container } = render(
      <TagDialogsManager repoPath="/repo" pendingTagAction={null} onClearPendingTagAction={vi.fn()} />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the annotate dialog for an annotate action', () => {
    render(
      <TagDialogsManager
        repoPath="/repo"
        pendingTagAction={{ kind: 'annotate', tagName: 'v1', oid: 'abc', shortOid: 'abc' }}
        onClearPendingTagAction={vi.fn()}
      />
    )
    expect(screen.getByTestId('annotate')).toHaveTextContent('v1')
    expect(screen.queryByTestId('delete-remote')).not.toBeInTheDocument()
  })

  it('renders the remote-delete dialog for a deleteRemote action', () => {
    render(
      <TagDialogsManager
        repoPath="/repo"
        pendingTagAction={{ kind: 'deleteRemote', tagName: 'v1', oid: 'abc', remote: 'origin' }}
        onClearPendingTagAction={vi.fn()}
      />
    )
    expect(screen.getByTestId('delete-remote')).toHaveTextContent('v1@origin')
    expect(screen.queryByTestId('annotate')).not.toBeInTheDocument()
  })
})
