import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@git-manager/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

import { PatchMenu } from './PatchMenu'
import { usePatchWorkspaceStore } from '../../stores/patchWorkspace.store'
import { useRepoUIStore } from '../../stores/repoUI.store'

beforeEach(() => {
  vi.clearAllMocks()
  usePatchWorkspaceStore.getState().close()
})

describe('PatchMenu', () => {
  it('disables the trigger without an active repo', () => {
    render(<PatchMenu repoPath={null} />)
    expect(screen.getByTestId('toolbar-patch-button')).toBeDisabled()
  })

  it('enables the trigger with an active repo', () => {
    render(<PatchMenu repoPath="/repo" />)
    expect(screen.getByTestId('toolbar-patch-button')).not.toBeDisabled()
  })

  it('opens the create patch workspace and clears the diff/PR center views', async () => {
    const user = userEvent.setup()
    useRepoUIStore.setState({ activeDiffFile: { path: 'x', staged: false }, activePrNumber: 7 })
    render(<PatchMenu repoPath="/repo" />)

    await user.click(screen.getByTestId('toolbar-patch-button'))
    await user.click(screen.getByTestId('patch-menu-create'))

    expect(usePatchWorkspaceStore.getState().mode).toBe('create')
    expect(useRepoUIStore.getState().activeDiffFile).toBeNull()
    expect(useRepoUIStore.getState().activePrNumber).toBeNull()
  })

  it('opens the dependency workspace from its menu item', async () => {
    const user = userEvent.setup()
    render(<PatchMenu repoPath="/repo" />)
    await user.click(screen.getByTestId('toolbar-patch-button'))
    await user.click(screen.getByTestId('patch-menu-dependency'))
    expect(usePatchWorkspaceStore.getState().mode).toBe('dependency')
  })
})
