import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { GhPrFile } from '../../../api/github.api'

vi.mock('@git-manager/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

const { usePrFilesMock } = vi.hoisted(() => ({ usePrFilesMock: vi.fn() }))
vi.mock('../../../hooks/usePrFiles', () => ({ usePrFiles: usePrFilesMock }))

import { PrFilesPanel } from './PrFilesPanel'
import { useRepoUIStore } from '../../../stores/repoUI.store'

function file(overrides: Partial<GhPrFile> = {}): GhPrFile {
  return { filename: 'src/a.ts', status: 'modified', additions: 1, deletions: 0, changes: 1, ...overrides }
}

beforeEach(() => {
  vi.clearAllMocks()
  useRepoUIStore.getState().setActivePrFile(null)
  usePrFilesMock.mockReturnValue({
    files: [file(), file({ filename: 'src/b.ts' })],
    isLoading: false,
  })
})

describe('PrFilesPanel', () => {
  it('lists the PR files', () => {
    render(<PrFilesPanel repoPath="/repo" prNumber={7} />)
    expect(screen.getByTestId('pr-files-panel')).toBeInTheDocument()
    expect(screen.getByTestId('pr-file-src/a.ts')).toBeInTheDocument()
    expect(screen.getByTestId('pr-file-src/b.ts')).toBeInTheDocument()
  })

  it('selects a file into the store (drives the center diff)', async () => {
    const user = userEvent.setup()
    render(<PrFilesPanel repoPath="/repo" prNumber={7} />)
    await user.click(screen.getByTestId('pr-file-src/b.ts'))
    expect(useRepoUIStore.getState().activePrFile).toBe('src/b.ts')
  })
})
