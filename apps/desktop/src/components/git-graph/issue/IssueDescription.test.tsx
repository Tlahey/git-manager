import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../../../hooks/useIssueEdit', () => ({ useIssueEdit: vi.fn() }))

const openUrl = vi.fn()
vi.mock('../../../lib/openUrl', () => ({ openUrl: (...a: unknown[]) => openUrl(...a) }))

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

  it('ticks a task-list item straight from the rendered body', async () => {
    const user = userEvent.setup()
    render(<IssueDescription repoPath="org/repo" issueNumber={7} body={'- [ ] one\n- [x] two'} />)

    await user.click(screen.getAllByRole('checkbox')[0])

    expect(update).toHaveBeenCalledWith({ body: '- [x] one\n- [x] two' })
  })

  it('leaves the checkboxes read-only when editing is not allowed', async () => {
    const user = userEvent.setup()
    mockEdit(false)
    render(<IssueDescription repoPath="org/repo" issueNumber={7} body="- [ ] one" />)

    const box = screen.getByRole('checkbox')
    expect(box).toBeDisabled()
    await user.click(box)

    expect(update).not.toHaveBeenCalled()
  })

  it('opens the issue on GitHub when an image is dropped on the editor, since uploads have no API', async () => {
    const user = userEvent.setup()
    render(
      <IssueDescription
        repoPath="org/repo"
        issueNumber={7}
        body="old"
        issueUrl="https://github.com/org/repo/issues/7"
      />
    )
    await user.click(screen.getByTestId('issue-description-edit'))

    fireEvent.drop(screen.getByTestId('issue-description-input'), {
      dataTransfer: { types: ['Files'], files: [{ type: 'image/png' }] } as unknown as DataTransfer,
    })

    expect(openUrl).toHaveBeenCalledWith('https://github.com/org/repo/issues/7')
  })
})
