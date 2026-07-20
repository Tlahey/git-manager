import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@git-manager/i18n', () => ({ useTranslation: () => ({ t: (k: string) => k }) }))
vi.mock('../../hooks/useFileRawContents', () => ({
  useFileRawContents: vi.fn(() => ({ data: { original: 'HEAD', modified: 'WORK' } })),
}))
vi.mock('../merge-editor/ThreeWayMergeEditor', () => ({
  ThreeWayMergeEditor: ({ original, modified }: { original: string; modified: string }) => (
    <div data-testid="two-way-diff" data-original={original} data-modified={modified} />
  ),
}))

import { PatchWorkspaceCenter } from './PatchWorkspaceCenter'
import { usePatchWorkspaceStore } from '../../stores/patchWorkspace.store'

beforeEach(() => usePatchWorkspaceStore.getState().open('create'))

describe('PatchWorkspaceCenter', () => {
  it('shows a hint when no file is selected', () => {
    render(<PatchWorkspaceCenter repoPath="/repo" />)
    expect(screen.getByText('patch.selectFileHint')).toBeInTheDocument()
  })

  it('renders reconstructed sides through the two-pane editor', () => {
    usePatchWorkspaceStore.getState().setActiveFile({ path: 'a.ts', original: 'x', modified: 'y' })
    render(<PatchWorkspaceCenter repoPath="/repo" />)
    const diff = screen.getByTestId('two-way-diff')
    expect(diff).toHaveAttribute('data-original', 'x')
    expect(diff).toHaveAttribute('data-modified', 'y')
  })

  it('falls back to fetched working-tree contents when no sides are provided', () => {
    usePatchWorkspaceStore.getState().setActiveFile({ path: 'a.ts' })
    render(<PatchWorkspaceCenter repoPath="/repo" />)
    const diff = screen.getByTestId('two-way-diff')
    expect(diff).toHaveAttribute('data-original', 'HEAD')
    expect(diff).toHaveAttribute('data-modified', 'WORK')
  })

  it('shows the active file path as a caption', () => {
    usePatchWorkspaceStore.getState().setActiveFile({ path: 'src/deep/a.ts' })
    render(<PatchWorkspaceCenter repoPath="/repo" />)
    expect(screen.getByText('src/deep/a.ts')).toBeInTheDocument()
  })
})
