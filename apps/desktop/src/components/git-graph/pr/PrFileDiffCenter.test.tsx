import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { GhPrFile } from '../../../api/github.api'

vi.mock('@git-manager/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

const { usePrFilesMock } = vi.hoisted(() => ({ usePrFilesMock: vi.fn() }))
vi.mock('../../../hooks/usePrFiles', () => ({ usePrFiles: usePrFilesMock }))

import { PrFileDiffCenter } from './PrFileDiffCenter'

function file(overrides: Partial<GhPrFile> = {}): GhPrFile {
  return {
    filename: 'src/a.ts',
    status: 'modified',
    additions: 3,
    deletions: 1,
    changes: 4,
    patch: ['@@ -1,1 +1,1 @@', '-old', '+new'].join('\n'),
    ...overrides,
  }
}

beforeEach(() => vi.clearAllMocks())

describe('PrFileDiffCenter', () => {
  it('renders the selected file diff with its stats', () => {
    usePrFilesMock.mockReturnValue({ files: [file()], isLoading: false })
    render(
      <PrFileDiffCenter repoPath="/repo" prNumber={7} filename="src/a.ts" onClose={vi.fn()} />
    )
    expect(screen.getByTestId('pr-file-diff-center')).toHaveTextContent('src/a.ts')
    expect(screen.getByTestId('pr-file-diff')).toHaveTextContent('new')
    expect(screen.getByText('+3')).toBeInTheDocument()
  })

  it('calls onClose from the back button', async () => {
    usePrFilesMock.mockReturnValue({ files: [file()], isLoading: false })
    const onClose = vi.fn()
    render(
      <PrFileDiffCenter repoPath="/repo" prNumber={7} filename="src/a.ts" onClose={onClose} />
    )
    await userEvent.setup().click(screen.getByTestId('pr-file-diff-back'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('shows a not-found message when the file is not part of the PR', () => {
    usePrFilesMock.mockReturnValue({ files: [file()], isLoading: false })
    render(
      <PrFileDiffCenter repoPath="/repo" prNumber={7} filename="gone.ts" onClose={vi.fn()} />
    )
    expect(screen.getByText('pr.diff.notFound')).toBeInTheDocument()
  })
})
