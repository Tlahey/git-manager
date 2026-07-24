import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../../../hooks/useIssueEdit', () => ({ useIssueEdit: vi.fn() }))

import { useIssueEdit } from '../../../hooks/useIssueEdit'
import { IssueDescription } from './IssueDescription'

const mockedEdit = useIssueEdit as unknown as ReturnType<typeof vi.fn>
const update = vi.fn().mockResolvedValue(undefined)

function mockEdit(canEdit = true) {
  mockedEdit.mockReturnValue({ update, pending: false, canEdit })
}

beforeEach(() => {
  vi.clearAllMocks()
  update.mockResolvedValue(undefined)
  mockEdit()
})

describe('IssueDescription', () => {
  it('renders the body as markdown', () => {
    render(<IssueDescription repoPath="org/repo" issueNumber={7} body="Hello world" />)
    expect(screen.getByText('Hello world')).toBeInTheDocument()
  })

  it('shows an empty-state when there is no body', () => {
    render(<IssueDescription repoPath="org/repo" issueNumber={7} body="" />)
    expect(screen.getByText('No description provided.')).toBeInTheDocument()
  })

  it('edits and saves the body', async () => {
    const user = userEvent.setup()
    render(<IssueDescription repoPath="org/repo" issueNumber={7} body="old" />)
    await user.click(screen.getByTestId('issue-description-edit'))
    const input = screen.getByTestId('issue-description-input')
    await user.clear(input)
    await user.type(input, 'new body')
    await act(async () => {
      await user.click(screen.getByTestId('issue-description-save'))
    })
    expect(update).toHaveBeenCalledWith({ body: 'new body' })
  })

  it('hides the edit button when editing is not allowed', () => {
    mockEdit(false)
    render(<IssueDescription repoPath="org/repo" issueNumber={7} body="old" />)
    expect(screen.queryByTestId('issue-description-edit')).not.toBeInTheDocument()
  })
})
