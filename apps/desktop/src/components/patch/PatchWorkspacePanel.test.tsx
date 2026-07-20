import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('@git-manager/i18n', () => ({ useTranslation: () => ({ t: (k: string) => k }) }))
vi.mock('./CreatePatchPanel', () => ({ CreatePatchPanel: () => <div data-testid="create-panel" /> }))
vi.mock('./ApplyPatchPanel', () => ({ ApplyPatchPanel: () => <div data-testid="apply-panel" /> }))
vi.mock('./DependencyPatchPanel', () => ({
  DependencyPatchPanel: () => <div data-testid="dependency-panel" />,
}))

import { PatchWorkspacePanel } from './PatchWorkspacePanel'
import { usePatchWorkspaceStore } from '../../stores/patchWorkspace.store'

beforeEach(() => usePatchWorkspaceStore.getState().close())

describe('PatchWorkspacePanel', () => {
  it('renders nothing when no mode is active', () => {
    const { container } = render(<PatchWorkspacePanel repoPath="/repo" />)
    expect(container).toBeEmptyDOMElement()
  })

  it.each([
    ['create', 'create-panel', 'patch.create.title'],
    ['apply', 'apply-panel', 'patch.apply.title'],
    ['dependency', 'dependency-panel', 'patch.dependency.title'],
  ] as const)('renders the %s panel under its title header', (mode, testid, title) => {
    usePatchWorkspaceStore.getState().open(mode)
    render(<PatchWorkspacePanel repoPath="/repo" />)
    expect(screen.getByTestId(testid)).toBeInTheDocument()
    expect(screen.getByTestId('patch-panel-title')).toHaveTextContent(title)
  })

  it('closes the workspace via the header close button', () => {
    usePatchWorkspaceStore.getState().open('create')
    render(<PatchWorkspacePanel repoPath="/repo" />)
    fireEvent.click(screen.getByTestId('patch-workspace-close'))
    expect(usePatchWorkspaceStore.getState().mode).toBeNull()
  })
})
