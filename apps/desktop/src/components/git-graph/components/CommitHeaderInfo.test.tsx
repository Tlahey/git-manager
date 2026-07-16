import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { GitGraphNode, GitStash } from '@git-manager/git-types'

vi.mock('@git-manager/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('./CommitDetailsAvatar', () => ({
  CommitDetailsAvatar: () => <div data-testid="avatar" />,
}))

const { useGitStashes, useCommitMessageEdit, apiOpenUrl, useCommitPullRequest } = vi.hoisted(() => ({
  useGitStashes: vi.fn(),
  useCommitMessageEdit: vi.fn(),
  apiOpenUrl: vi.fn(),
  useCommitPullRequest: vi.fn(),
}))
vi.mock('../../../hooks/useGitStashes', () => ({ useGitStashes }))
vi.mock('../../../hooks/useCommitMessageEdit', () => ({ useCommitMessageEdit }))
vi.mock('../../../api/shell.api', () => ({ apiOpenUrl }))
vi.mock('../../../hooks/useCommitPullRequest', () => ({ useCommitPullRequest }))

import { CommitHeaderInfo } from './CommitHeaderInfo'

function commit(overrides: Partial<GitGraphNode['commit']> = {}): GitGraphNode['commit'] {
  return {
    oid: 'abcdef1234567890',
    shortOid: 'abcdef1',
    message: 'Subject\n\nBody line',
    subject: 'Subject line',
    body: '',
    author: { name: 'Ada Lovelace', email: 'ada@example.com', timestamp: 1700000000 },
    committer: { name: 'Ada Lovelace', email: 'ada@example.com', timestamp: 1700000000 },
    parentOids: [],
    ...overrides,
  }
}

function editState(overrides: Partial<ReturnType<typeof useCommitMessageEdit>> = {}) {
  return {
    copied: false,
    handleCopySha: vi.fn(),
    isEditingMessage: false,
    setIsEditingMessage: vi.fn(),
    editSubject: '',
    setEditSubject: vi.fn(),
    editBody: '',
    setEditBody: vi.fn(),
    isSavingMessage: false,
    handleUpdateCommitMessage: vi.fn(),
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  useGitStashes.mockReturnValue({ data: undefined })
  useCommitMessageEdit.mockReturnValue(editState())
  useCommitPullRequest.mockReturnValue(null)
})

function baseProps(
  overrides: Partial<React.ComponentProps<typeof CommitHeaderInfo>> = {}
): React.ComponentProps<typeof CommitHeaderInfo> {
  return {
    isWip: false,
    commit: commit(),
    isHead: false,
    repoPath: '/repo',
    remoteUrl: null,
    ...overrides,
  }
}

describe('CommitHeaderInfo — header title', () => {
  it('shows the working-tree title for WIP', () => {
    render(<CommitHeaderInfo {...baseProps({ isWip: true })} />)
    expect(screen.getByText('workingTree.title')).toBeInTheDocument()
  })

  it('shows the stash title for a stash entry', () => {
    render(<CommitHeaderInfo {...baseProps({ isStash: true })} />)
    expect(screen.getByText('stash.title')).toBeInTheDocument()
  })

  it('shows the commit-details title otherwise', () => {
    render(<CommitHeaderInfo {...baseProps()} />)
    expect(screen.getByText('commitDetails.title')).toBeInTheDocument()
  })

  it('renders a close button only when onClose is given, and calls it when clicked', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    const { rerender } = render(<CommitHeaderInfo {...baseProps()} />)
    expect(screen.queryByTestId('commit-details-close-button')).not.toBeInTheDocument()

    rerender(<CommitHeaderInfo {...baseProps({ onClose })} />)
    await user.click(screen.getByTestId('commit-details-close-button'))
    expect(onClose).toHaveBeenCalledOnce()
  })
})

describe('CommitHeaderInfo — author block', () => {
  it('hides the author block for WIP', () => {
    render(<CommitHeaderInfo {...baseProps({ isWip: true })} />)
    expect(screen.queryByTestId('avatar')).not.toBeInTheDocument()
  })

  it('shows the author name/email for a real commit', () => {
    render(
      <CommitHeaderInfo
        {...baseProps({
          commit: commit({
            author: { name: 'Ada Lovelace', email: 'ada@example.com', timestamp: 1700000000 },
          }),
        })}
      />
    )
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument()
    expect(screen.getByText('<ada@example.com>')).toBeInTheDocument()
  })
})

describe('CommitHeaderInfo — message editing form', () => {
  it('shows the amend form pre-filled with the hook state', () => {
    useCommitMessageEdit.mockReturnValue(
      editState({ isEditingMessage: true, editSubject: 'New subject', editBody: 'New body' })
    )
    render(<CommitHeaderInfo {...baseProps()} />)
    expect(screen.getByTestId('commit-subject-input')).toHaveValue('New subject')
    expect(screen.getByTestId('commit-body-textarea')).toHaveValue('New body')
  })

  it('shows the remaining-characters counter, turning destructive under 10 left', () => {
    useCommitMessageEdit.mockReturnValue(
      editState({ isEditingMessage: true, editSubject: 'x'.repeat(65) })
    )
    render(<CommitHeaderInfo {...baseProps()} />)
    const counter = screen.getByTestId('commit-subject-counter')
    expect(counter).toHaveTextContent('7 chars remaining')
    expect(counter.className).toContain('text-destructive')
  })

  it('disables submit when the subject is empty or saving is in progress', () => {
    useCommitMessageEdit.mockReturnValue(editState({ isEditingMessage: true, editSubject: '' }))
    const { rerender } = render(<CommitHeaderInfo {...baseProps()} />)
    expect(screen.getByTestId('commit-amend-submit')).toBeDisabled()

    useCommitMessageEdit.mockReturnValue(
      editState({ isEditingMessage: true, editSubject: 'ok', isSavingMessage: true })
    )
    rerender(<CommitHeaderInfo {...baseProps()} />)
    expect(screen.getByTestId('commit-amend-submit')).toBeDisabled()

    useCommitMessageEdit.mockReturnValue(
      editState({ isEditingMessage: true, editSubject: 'ok', isSavingMessage: false })
    )
    rerender(<CommitHeaderInfo {...baseProps()} />)
    expect(screen.getByTestId('commit-amend-submit')).toBeEnabled()
  })

  it('submits via handleUpdateCommitMessage and cancels via setIsEditingMessage(false)', async () => {
    const handleUpdateCommitMessage = vi.fn()
    const setIsEditingMessage = vi.fn()
    useCommitMessageEdit.mockReturnValue(
      editState({
        isEditingMessage: true,
        editSubject: 'ok',
        handleUpdateCommitMessage,
        setIsEditingMessage,
      })
    )
    const user = userEvent.setup()
    render(<CommitHeaderInfo {...baseProps()} />)
    await user.click(screen.getByTestId('commit-amend-submit'))
    expect(handleUpdateCommitMessage).toHaveBeenCalledOnce()
    await user.click(screen.getByTestId('commit-amend-cancel'))
    expect(setIsEditingMessage).toHaveBeenCalledWith(false)
  })
})

describe('CommitHeaderInfo — message display (not editing)', () => {
  it('shows an editable HEAD message with parsed bullet/plain body lines', async () => {
    const setIsEditingMessage = vi.fn()
    useCommitMessageEdit.mockReturnValue(editState({ setIsEditingMessage }))
    const user = userEvent.setup()
    render(
      <CommitHeaderInfo
        {...baseProps({
          isHead: true,
          commit: commit({ subject: 'Head subject', body: '- bullet one\nplain line' }),
        })}
      />
    )
    expect(screen.getByTestId('commit-subject-display')).toHaveTextContent('Head subject')
    expect(screen.getByText('bullet one')).toBeInTheDocument()
    expect(screen.getByText('plain line')).toBeInTheDocument()

    await user.click(screen.getByTestId('commit-message-clickable'))
    expect(setIsEditingMessage).toHaveBeenCalledWith(true)
  })

  it('enters edit mode on Enter/Space when the message block is keyboard-focused', async () => {
    const setIsEditingMessage = vi.fn()
    useCommitMessageEdit.mockReturnValue(editState({ setIsEditingMessage }))
    const user = userEvent.setup()
    render(<CommitHeaderInfo {...baseProps({ isHead: true })} />)
    screen.getByTestId('commit-message-clickable').focus()
    await user.keyboard('{Enter}')
    expect(setIsEditingMessage).toHaveBeenCalledWith(true)
  })

  it('shows the stash message split into title/body when a matching stash is found', () => {
    const stash: GitStash = {
      index: 0,
      message: 'Stash title\n\nStash body',
      branch: 'main',
      commitOid: 'abcdef1234567890',
      timestamp: 0,
      filesCount: 1,
      additions: 1,
      deletions: 0,
    }
    useGitStashes.mockReturnValue({ data: [stash] })
    render(
      <CommitHeaderInfo
        {...baseProps({ isStash: true, commit: commit({ oid: 'abcdef1234567890' }) })}
      />
    )
    expect(screen.getByText('Stash title')).toBeInTheDocument()
    expect(screen.getByText('Stash body')).toBeInTheDocument()
  })

  it('falls back to the commit subject/body for a stash with no matching entry', () => {
    useGitStashes.mockReturnValue({ data: [] })
    render(
      <CommitHeaderInfo
        {...baseProps({
          isStash: true,
          commit: commit({ subject: 'Fallback subject', body: 'Fallback body' }),
        })}
      />
    )
    expect(screen.getByText('Fallback subject')).toBeInTheDocument()
    expect(screen.getByText('Fallback body')).toBeInTheDocument()
  })

  it('shows a plain readonly message block when neither HEAD nor stash', () => {
    render(
      <CommitHeaderInfo
        {...baseProps({ isHead: false, commit: commit({ subject: 'Plain subject' }) })}
      />
    )
    expect(screen.getByTestId('commit-message-readonly')).toHaveTextContent('Plain subject')
  })
})

describe('CommitHeaderInfo — SHA / remote link / parents', () => {
  it('copies the SHA and reflects "copied" via the icon', async () => {
    const handleCopySha = vi.fn()
    useCommitMessageEdit.mockReturnValue(editState({ handleCopySha }))
    const user = userEvent.setup()
    const { container, rerender } = render(<CommitHeaderInfo {...baseProps()} />)
    expect(container.querySelector('.lucide-copy')).toBeTruthy()
    await user.click(screen.getByTitle('gitTree.detailPanel.copy'))
    expect(handleCopySha).toHaveBeenCalledOnce()

    useCommitMessageEdit.mockReturnValue(editState({ copied: true }))
    rerender(<CommitHeaderInfo {...baseProps()} />)
    expect(container.querySelector('.lucide-check')).toBeTruthy()
  })

  it('hides the remote link when there is no remote URL', () => {
    render(<CommitHeaderInfo {...baseProps({ remoteUrl: null })} />)
    expect(screen.queryByTestId('github-commit-link')).not.toBeInTheDocument()
  })

  it('shows a GitHub link and opens the commit URL when clicked', async () => {
    apiOpenUrl.mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(
      <CommitHeaderInfo
        {...baseProps({
          remoteUrl: 'https://github.com/owner/repo',
          commit: commit({ oid: 'sha1' }),
        })}
      />
    )
    expect(screen.getByText('GitHub')).toBeInTheDocument()
    await user.click(screen.getByTestId('github-commit-link'))
    expect(apiOpenUrl).toHaveBeenCalledWith('https://github.com/owner/repo/commit/sha1')
  })

  it('shows a GitLab link for a gitlab remote', () => {
    render(<CommitHeaderInfo {...baseProps({ remoteUrl: 'https://gitlab.com/owner/repo' })} />)
    expect(screen.getByText('GitLab')).toBeInTheDocument()
  })

  it('hides the parents section when there are none', () => {
    render(<CommitHeaderInfo {...baseProps({ commit: commit({ parentOids: [] }) })} />)
    expect(screen.queryByText('commitDetails.parents')).not.toBeInTheDocument()
  })

  it('renders a button per parent oid and navigates on click', async () => {
    const onSelectCommit = vi.fn()
    const user = userEvent.setup()
    render(
      <CommitHeaderInfo
        {...baseProps({
          commit: commit({ parentOids: ['parent1234567', 'parent7654321'] }),
          onSelectCommit,
        })}
      />
    )
    expect(screen.getByText('parent1')).toBeInTheDocument()
    expect(screen.getByText('parent7')).toBeInTheDocument()
    await user.click(screen.getByText('parent1'))
    expect(onSelectCommit).toHaveBeenCalledWith('parent1234567')
  })

  it('hides SHA/remote/parents entirely for WIP', () => {
    render(
      <CommitHeaderInfo
        {...baseProps({ isWip: true, remoteUrl: 'https://github.com/owner/repo' })}
      />
    )
    expect(screen.queryByTestId('github-commit-link')).not.toBeInTheDocument()
    expect(screen.queryByTitle('gitTree.detailPanel.copy')).not.toBeInTheDocument()
  })
})

describe('CommitHeaderInfo — pull request label', () => {
  it('shows no PR label when the commit has no associated PR', () => {
    useCommitPullRequest.mockReturnValue(null)
    render(<CommitHeaderInfo {...baseProps()} />)
    expect(screen.queryByTestId('commit-pr-label')).not.toBeInTheDocument()
  })

  it('shows the PR number and title, and opens the PR on click', async () => {
    useCommitPullRequest.mockReturnValue({
      number: 89,
      url: 'https://github.com/owner/repo/pull/89',
      title: 'feat(splash): enlarge mascot, title, spinner',
      state: 'closed',
      merged: true,
    })
    apiOpenUrl.mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<CommitHeaderInfo {...baseProps()} />)

    const label = screen.getByTestId('commit-pr-label')
    expect(label).toHaveTextContent('#89')
    expect(label).toHaveTextContent('feat(splash): enlarge mascot, title, spinner')
    await user.click(label)
    expect(apiOpenUrl).toHaveBeenCalledWith('https://github.com/owner/repo/pull/89')
  })

  it('does not query a PR for WIP or stash rows', () => {
    render(<CommitHeaderInfo {...baseProps({ isWip: true })} />)
    expect(useCommitPullRequest).toHaveBeenCalledWith('/repo', null)
  })
})
