import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { GhPrFile } from '../../../api/github.api'

vi.mock('@git-manager/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

const { usePrFilesMock } = vi.hoisted(() => ({ usePrFilesMock: vi.fn() }))
vi.mock('../../../hooks/usePrFiles', () => ({ usePrFiles: usePrFilesMock }))

import { PrFilesList } from './PrFilesList'

function file(overrides: Partial<GhPrFile> = {}): GhPrFile {
  return { filename: 'src/a.ts', status: 'modified', additions: 3, deletions: 1, changes: 4, ...overrides }
}

beforeEach(() => {
  vi.clearAllMocks()
  usePrFilesMock.mockReturnValue({
    files: [file(), file({ filename: 'src/b.ts', status: 'added' })],
    isLoading: false,
  })
})

describe('PrFilesList', () => {
  it('shows the file count and rows', () => {
    render(<PrFilesList repoPath="/repo" prNumber={7} />)
    expect(screen.getByTestId('pr-files-count')).toHaveTextContent('2')
    expect(screen.getByTestId('pr-file-src/a.ts')).toBeInTheDocument()
  })

  it('calls onSelect with the filename when a row is clicked', async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()
    render(<PrFilesList repoPath="/repo" prNumber={7} onSelect={onSelect} />)
    await user.click(screen.getByTestId('pr-file-src/b.ts'))
    expect(onSelect).toHaveBeenCalledWith('src/b.ts')
  })

  it('disables rows when not selectable and highlights the active file', () => {
    const { rerender } = render(<PrFilesList repoPath="/repo" prNumber={7} />)
    expect(screen.getByTestId('pr-file-src/a.ts')).toBeDisabled()

    rerender(<PrFilesList repoPath="/repo" prNumber={7} onSelect={vi.fn()} activeFile="src/a.ts" />)
    expect(screen.getByTestId('pr-file-src/a.ts')).toHaveClass('bg-accent')
    expect(screen.getByTestId('pr-file-src/a.ts')).toBeEnabled()
  })
})
