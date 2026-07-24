import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../../../hooks/useIssueEdit', () => ({ useIssueEdit: vi.fn() }))

import { useIssueEdit } from '../../../hooks/useIssueEdit'
import { IssueTitle } from './IssueTitle'

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

describe('IssueTitle', () => {
  it('shows the title and number', () => {
    render(<IssueTitle repoPath="org/repo" issueNumber={7} title="A bug" />)
    expect(screen.getByTestId('issue-title')).toHaveTextContent('A bug')
    expect(screen.getByText('#7')).toBeInTheDocument()
  })

  it('edits and saves the title', async () => {
    const user = userEvent.setup()
    render(<IssueTitle repoPath="org/repo" issueNumber={7} title="A bug" />)
    await user.click(screen.getByTestId('issue-title'))
    const input = screen.getByTestId('issue-title-input')
    await user.clear(input)
    await user.type(input, 'A worse bug')
    await act(async () => {
      await user.click(screen.getByTestId('issue-title-save'))
    })
    expect(update).toHaveBeenCalledWith({ title: 'A worse bug' })
  })

  it('is read-only when editing is not allowed', async () => {
    const user = userEvent.setup()
    mockEdit(false)
    render(<IssueTitle repoPath="org/repo" issueNumber={7} title="A bug" />)
    await user.click(screen.getByTestId('issue-title'))
    expect(screen.queryByTestId('issue-title-input')).not.toBeInTheDocument()
  })
})
