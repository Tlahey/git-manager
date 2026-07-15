import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@git-manager/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const { useBranchesMock } = vi.hoisted(() => ({ useBranchesMock: vi.fn() }))
vi.mock('../../../hooks/useBranches', () => ({ useBranches: useBranchesMock }))

import { PrBaseBranchDialog } from './PrBaseBranchDialog'

beforeEach(() => {
  vi.clearAllMocks()
  useBranchesMock.mockReturnValue({
    data: [
      { name: 'main', shortName: 'main', isRemote: false },
      { name: 'develop', shortName: 'develop', isRemote: false },
      { name: 'origin/main', shortName: 'origin/main', isRemote: true },
    ],
  })
})

describe('PrBaseBranchDialog', () => {
  it('lists only local branches and confirms a new selection', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    const onClose = vi.fn()
    render(
      <PrBaseBranchDialog
        repoPath="/repo"
        open
        currentBase="main"
        onSelect={onSelect}
        onClose={onClose}
      />
    )
    // Remote branch excluded.
    expect(screen.queryByRole('option', { name: 'origin/main' })).not.toBeInTheDocument()

    await user.selectOptions(screen.getByTestId('pr-base-branch-select'), 'develop')
    await user.click(screen.getByTestId('pr-base-branch-confirm'))
    expect(onSelect).toHaveBeenCalledWith('develop')
    expect(onClose).toHaveBeenCalled()
  })
})
