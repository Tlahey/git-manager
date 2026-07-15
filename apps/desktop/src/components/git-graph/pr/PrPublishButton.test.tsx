import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@git-manager/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const { flow } = vi.hoisted(() => ({
  flow: {
    mode: 'feature' as string,
    busy: false,
    error: null as string | null,
    composer: null as { head: string; baseRef: string; title: string } | null,
    defaultBaseRef: 'main' as string | null,
    commitAndPrepare: vi.fn(),
    createPr: vi.fn(),
    cancel: vi.fn(),
  },
}))
vi.mock('../../../hooks/usePrPublishFlow', () => ({ usePrPublishFlow: () => flow }))

import { PrPublishButton } from './PrPublishButton'

beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(flow, {
    mode: 'feature',
    busy: false,
    error: null,
    composer: null,
    defaultBaseRef: 'main',
  })
  flow.commitAndPrepare.mockResolvedValue(undefined)
})

describe('PrPublishButton', () => {
  it('renders nothing when the flow is unavailable', () => {
    flow.mode = 'unavailable'
    const { container } = render(<PrPublishButton repoPath="/repo" commitMessage="feat: x" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the feature-branch label and commits directly', async () => {
    flow.mode = 'feature'
    render(<PrPublishButton repoPath="/repo" commitMessage="feat: x" />)
    expect(screen.getByText('pr.publish.feature')).toBeInTheDocument()
    await userEvent.setup().click(screen.getByTestId('pr-publish-button'))
    expect(flow.commitAndPrepare).toHaveBeenCalledWith({ commitMessage: 'feat: x' })
  })

  it('collects a branch name before committing on a protected branch', async () => {
    const user = userEvent.setup()
    flow.mode = 'protected'
    render(<PrPublishButton repoPath="/repo" commitMessage="feat: x" />)
    expect(screen.getByText('pr.publish.protected')).toBeInTheDocument()

    // First click reveals the branch-name input; nothing committed yet.
    await user.click(screen.getByTestId('pr-publish-button'))
    expect(flow.commitAndPrepare).not.toHaveBeenCalled()
    const input = screen.getByTestId('pr-publish-branch-name')
    await user.type(input, 'feat/x')
    await user.click(screen.getByTestId('pr-publish-button'))
    expect(flow.commitAndPrepare).toHaveBeenCalledWith({
      commitMessage: 'feat: x',
      newBranchName: 'feat/x',
    })
  })

  it('hides the trigger once a composer is open (the center panel takes over)', () => {
    flow.composer = { head: 'feat/x', baseRef: 'main', title: 'feat: x' }
    const { container } = render(<PrPublishButton repoPath="/repo" commitMessage="feat: x" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('surfaces an error from the flow (e.g. the commit failed)', () => {
    flow.error = 'boom'
    render(<PrPublishButton repoPath="/repo" commitMessage="feat: x" />)
    expect(screen.getByTestId('pr-publish-error')).toHaveTextContent('boom')
  })
})
