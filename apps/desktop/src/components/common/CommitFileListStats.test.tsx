import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CommitFileListStats } from './CommitFileListStats'

const zeroStats = { added: 0, modified: 0, deleted: 0, renamed: 0 }

describe('CommitFileListStats', () => {
  it('shows one tag per non-zero status', () => {
    render(
      <CommitFileListStats
        fileStats={{ added: 2, modified: 1, deleted: 1, renamed: 1 }}
        filteredCount={5}
        isEmpty={false}
        emptyMessage="No changes"
      />
    )
    expect(screen.getByTitle(/2 .*added/)).toBeInTheDocument()
    expect(screen.getByTitle(/1 .*modified/)).toBeInTheDocument()
    expect(screen.getByTitle(/1 .*deleted/)).toBeInTheDocument()
    expect(screen.getByTitle(/1 .*renamed/)).toBeInTheDocument()
    expect(screen.getByText('5 files changed')).toBeInTheDocument()
  })

  it('shows the singular "file changed" label for exactly one file', () => {
    render(
      <CommitFileListStats
        fileStats={zeroStats}
        filteredCount={1}
        isEmpty={false}
        emptyMessage="No changes"
      />
    )
    expect(screen.getByText('1 file changed')).toBeInTheDocument()
  })

  it('shows the empty message only when isEmpty is set', () => {
    const { rerender } = render(
      <CommitFileListStats
        fileStats={zeroStats}
        filteredCount={0}
        isEmpty={true}
        emptyMessage="All clear!"
      />
    )
    expect(screen.getByText('All clear!')).toBeInTheDocument()

    rerender(
      <CommitFileListStats
        fileStats={{ ...zeroStats, added: 1 }}
        filteredCount={1}
        isEmpty={false}
        emptyMessage="All clear!"
      />
    )
    expect(screen.queryByText('All clear!')).not.toBeInTheDocument()
  })

  it('omits a tag for a status with a zero count', () => {
    render(
      <CommitFileListStats
        fileStats={{ ...zeroStats, added: 1 }}
        filteredCount={1}
        isEmpty={false}
        emptyMessage="No changes"
      />
    )
    expect(screen.queryByTitle(/modified/)).not.toBeInTheDocument()
  })
})
