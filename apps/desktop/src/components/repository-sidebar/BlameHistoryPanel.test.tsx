import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BlameHistoryPanel } from './BlameHistoryPanel'

describe('BlameHistoryPanel — mode', () => {
  it('shows the Git Blame heading and copy in blame mode', () => {
    render(<BlameHistoryPanel mode="blame" file={null} onClose={vi.fn()} />)
    expect(screen.getByText('Git Blame')).toBeInTheDocument()
    expect(screen.getByText('Git Blame Panel')).toBeInTheDocument()
  })

  it('shows the File History heading and copy in history mode', () => {
    render(<BlameHistoryPanel mode="history" file={null} onClose={vi.fn()} />)
    expect(screen.getByText('File History')).toBeInTheDocument()
    expect(screen.getByText('File History Panel')).toBeInTheDocument()
  })
})

describe('BlameHistoryPanel — file banner', () => {
  it('hides the file banner when there is no file', () => {
    render(<BlameHistoryPanel mode="blame" file={null} onClose={vi.fn()} />)
    expect(screen.queryByText('Unknown file')).not.toBeInTheDocument()
  })

  it('splits a nested path into a dimmed directory and the file name', () => {
    render(
      <BlameHistoryPanel
        mode="blame"
        file={{ path: 'src/components/Button.tsx', staged: false }}
        onClose={vi.fn()}
      />
    )
    expect(screen.getByText('src/components/')).toBeInTheDocument()
    expect(screen.getByText('Button.tsx')).toBeInTheDocument()
  })

  it('shows just the file name, no directory, for a top-level file', () => {
    render(
      <BlameHistoryPanel
        mode="blame"
        file={{ path: 'README.md', staged: false }}
        onClose={vi.fn()}
      />
    )
    expect(screen.getByText('README.md')).toBeInTheDocument()
  })
})

describe('BlameHistoryPanel — close', () => {
  it('calls onClose when the close button is clicked', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<BlameHistoryPanel mode="blame" file={null} onClose={onClose} />)
    await user.click(screen.getByTitle('Close panel'))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
