import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CreateIssueDialog } from './CreateIssueDialog'

const { createIssue, useRepoGitHub } = vi.hoisted(() => ({
  createIssue: vi.fn(),
  useRepoGitHub: vi.fn(),
}))
vi.mock('../../../api/github.api', () => ({ createIssue }))
vi.mock('../../../hooks/useRepoGitHub', () => ({ useRepoGitHub }))

const openUrl = vi.fn()
vi.mock('../../../lib/openUrl', () => ({ openUrl: (...a: unknown[]) => openUrl(...a) }))

const OWNER_REPO = { owner: 'owner', repo: 'repo' }

beforeEach(() => {
  createIssue.mockReset().mockResolvedValue({ number: 99 })
  useRepoGitHub.mockReturnValue({ ownerRepo: OWNER_REPO, token: 'tok' })
  openUrl.mockReset()
})

function renderDialog(props: Partial<React.ComponentProps<typeof CreateIssueDialog>> = {}) {
  const onClose = vi.fn()
  const onCreated = vi.fn()
  render(
    <CreateIssueDialog repoPath="/repo" open onClose={onClose} onCreated={onCreated} {...props} />
  )
  return { onClose, onCreated }
}

describe('CreateIssueDialog — form', () => {
  it('names the repository the issue will be filed on', () => {
    renderDialog()
    expect(screen.getByText('On owner/repo')).toBeInTheDocument()
  })

  it('keeps the submit button disabled until a title is typed', async () => {
    const user = userEvent.setup()
    renderDialog()
    const submit = screen.getByTestId('issue-create-confirm-button')
    expect(submit).toBeDisabled()

    await user.type(screen.getByTestId('issue-create-title-input'), 'Something broke')
    expect(submit).toBeEnabled()
  })

  // A body-only issue has no subject line on GitHub, so the title is the one required field.
  it('treats a whitespace-only title as no title', async () => {
    const user = userEvent.setup()
    renderDialog()
    await user.type(screen.getByTestId('issue-create-title-input'), '   ')
    expect(screen.getByTestId('issue-create-confirm-button')).toBeDisabled()
  })

  it('opens the new-issue page on GitHub when an image is dropped, since uploads have no API', () => {
    renderDialog()

    fireEvent.drop(screen.getByTestId('issue-create-body-input'), {
      dataTransfer: { types: ['Files'], files: [{ type: 'image/png' }] } as unknown as DataTransfer,
    })

    expect(openUrl).toHaveBeenCalledWith('https://github.com/owner/repo/issues/new')
  })
})

describe('CreateIssueDialog — submission', () => {
  it('creates the issue, refreshes the list and closes', async () => {
    const user = userEvent.setup()
    const { onClose, onCreated } = renderDialog()

    await user.type(screen.getByTestId('issue-create-title-input'), '  Something broke  ')
    await user.type(screen.getByTestId('issue-create-body-input'), 'Steps to reproduce')
    await user.click(screen.getByTestId('issue-create-confirm-button'))

    await waitFor(() =>
      expect(createIssue).toHaveBeenCalledWith(
        'owner',
        'repo',
        { title: 'Something broke', body: 'Steps to reproduce' },
        'tok'
      )
    )
    expect(onCreated).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('surfaces a failure and keeps the dialog open so the text is not lost', async () => {
    const user = userEvent.setup()
    createIssue.mockRejectedValue(new Error('GitHub 403'))
    const { onClose } = renderDialog()

    await user.type(screen.getByTestId('issue-create-title-input'), 'Something broke')
    await user.click(screen.getByTestId('issue-create-confirm-button'))

    await waitFor(() => expect(screen.getByTestId('issue-create-error')).toHaveTextContent('403'))
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByTestId('issue-create-title-input')).toHaveValue('Something broke')
  })
})

describe('CreateIssueDialog — unavailable states', () => {
  it('explains that the repo is not on GitHub and blocks the form', () => {
    useRepoGitHub.mockReturnValue({ ownerRepo: null, token: 'tok' })
    renderDialog()
    expect(screen.getByTestId('issue-create-no-github')).toBeInTheDocument()
    expect(screen.getByTestId('issue-create-title-input')).toBeDisabled()
    expect(screen.getByTestId('issue-create-confirm-button')).toBeDisabled()
  })

  it('asks the user to sign in when there is no token', async () => {
    const user = userEvent.setup()
    useRepoGitHub.mockReturnValue({ ownerRepo: OWNER_REPO, token: null })
    renderDialog()

    expect(screen.getByTestId('issue-create-no-token')).toBeInTheDocument()
    await user.type(screen.getByTestId('issue-create-title-input'), 'Something broke')
    expect(screen.getByTestId('issue-create-confirm-button')).toBeDisabled()
  })
})
