import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@git-manager/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const { mergeMock } = vi.hoisted(() => ({ mergeMock: vi.fn() }))
vi.mock('../../../hooks/usePrActions', () => ({
  usePrActions: () => ({ merge: mergeMock, pending: false, comment: vi.fn(), submitReview: vi.fn(), error: null }),
}))

import { PrMergeButton } from './PrMergeButton'

function renderButton(props: Partial<React.ComponentProps<typeof PrMergeButton>> = {}) {
  return render(
    <PrMergeButton
      repoPath="/repo"
      prNumber={7}
      mergeState="CLEAN"
      prState="open"
      isDraft={false}
      merged={false}
      mergeable={true}
      {...props}
    />
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('PrMergeButton — gating', () => {
  it('is enabled when the merge state is clean and the PR is open + not draft', () => {
    renderButton()
    expect(screen.getByTestId('pr-merge-button')).toBeEnabled()
  })

  it('is enabled when only non-required checks fail (UNSTABLE)', () => {
    renderButton({ mergeState: 'UNSTABLE' })
    expect(screen.getByTestId('pr-merge-button')).toBeEnabled()
  })

  it('is disabled when merging is blocked', () => {
    renderButton({ mergeState: 'BLOCKED' })
    expect(screen.getByTestId('pr-merge-button')).toBeDisabled()
  })

  it('is disabled when the branch is behind the base', () => {
    renderButton({ mergeState: 'BEHIND' })
    expect(screen.getByTestId('pr-merge-button')).toBeDisabled()
  })

  it('is disabled for a draft PR', () => {
    renderButton({ isDraft: true, mergeState: 'DRAFT' })
    expect(screen.getByTestId('pr-merge-button')).toBeDisabled()
  })

  it('is disabled when known unmergeable', () => {
    renderButton({ mergeable: false })
    expect(screen.getByTestId('pr-merge-button')).toBeDisabled()
  })

  it('shows a merged message instead of the button', () => {
    renderButton({ merged: true })
    expect(screen.queryByTestId('pr-merge-button')).not.toBeInTheDocument()
    expect(screen.getByText('pr.merge.merged')).toBeInTheDocument()
  })

  it('shows a closed message for a closed PR', () => {
    renderButton({ prState: 'closed' })
    expect(screen.getByText('pr.merge.closed')).toBeInTheDocument()
  })
})

describe('PrMergeButton — bypass branch protections', () => {
  it('does not show the bypass checkbox when the viewer lacks bypass rights', () => {
    renderButton({ mergeState: 'BLOCKED', viewerCanMergeAsAdmin: false })
    expect(screen.queryByTestId('pr-merge-bypass-rules')).not.toBeInTheDocument()
    expect(screen.getByTestId('pr-merge-button')).toBeDisabled()
  })

  it('does not show the bypass checkbox for a non-BLOCKED disabled state (e.g. BEHIND)', () => {
    renderButton({ mergeState: 'BEHIND', viewerCanMergeAsAdmin: true })
    expect(screen.queryByTestId('pr-merge-bypass-rules')).not.toBeInTheDocument()
  })

  it('shows the bypass checkbox when blocked and the viewer can bypass, unchecked by default', () => {
    renderButton({ mergeState: 'BLOCKED', viewerCanMergeAsAdmin: true })
    const checkbox = screen.getByTestId('pr-merge-bypass-rules')
    expect(checkbox).not.toBeChecked()
    expect(screen.getByTestId('pr-merge-button')).toBeDisabled()
  })

  it('checking the bypass checkbox enables the merge button and merge proceeds normally', async () => {
    const user = userEvent.setup()
    renderButton({ mergeState: 'BLOCKED', viewerCanMergeAsAdmin: true })
    await user.click(screen.getByTestId('pr-merge-bypass-rules'))
    const button = screen.getByTestId('pr-merge-button')
    expect(button).toBeEnabled()
    await user.click(button)
    expect(mergeMock).toHaveBeenCalledWith({ mergeMethod: 'merge' })
  })
})

describe('PrMergeButton — split-button method dropdown', () => {
  it('defaults to a merge commit (main button reflects the method)', () => {
    renderButton()
    expect(screen.getByTestId('pr-merge-button')).toHaveTextContent('pr.merge.button')
    // The method menu is closed until the caret is clicked.
    expect(screen.queryByTestId('pr-merge-method-menu')).not.toBeInTheDocument()
  })

  it('opens the dropdown and lists methods with their descriptions', async () => {
    const user = userEvent.setup()
    renderButton()
    await user.click(screen.getByTestId('pr-merge-method'))
    const menu = screen.getByTestId('pr-merge-method-menu')
    expect(menu).toHaveTextContent('pr.merge.methodSquash')
    expect(menu).toHaveTextContent('pr.merge.methodSquashDesc')
    expect(menu).toHaveTextContent('pr.merge.methodRebaseDesc')
  })

  it('picks a method: the main button relabels and merges with it', async () => {
    const user = userEvent.setup()
    renderButton()
    await user.click(screen.getByTestId('pr-merge-method'))
    await user.click(screen.getByTestId('pr-merge-method-rebase'))
    // Menu closes and the main button now shows the chosen method.
    expect(screen.queryByTestId('pr-merge-method-menu')).not.toBeInTheDocument()
    expect(screen.getByTestId('pr-merge-button')).toHaveTextContent('pr.merge.methodRebase')

    await user.click(screen.getByTestId('pr-merge-button'))
    expect(mergeMock).toHaveBeenCalledWith({ mergeMethod: 'rebase' })
  })
})
