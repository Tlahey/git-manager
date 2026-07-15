import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@git-manager/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

const { flow } = vi.hoisted(() => ({
  flow: {
    composer: null as { head: string; baseRef: string; title: string } | null,
    defaultBaseRef: 'main' as string | null,
    busy: false,
    error: null as string | null,
    createPr: vi.fn(),
    cancel: vi.fn(),
  },
}))
vi.mock('../../../hooks/usePrPublishFlow', () => ({ usePrPublishFlow: () => flow }))

// Keep the test on the center wrapper's wiring; the composer form has its own test.
vi.mock('./PrComposerExpander', () => ({
  PrComposerExpander: (props: {
    defaultTitle: string
    onCreate: (i: { title: string; body: string; baseRef: string }) => void
    onCancel: () => void
  }) => (
    <div data-testid="stub-composer">
      <span data-testid="stub-title">{props.defaultTitle}</span>
      <button
        data-testid="stub-create"
        onClick={() => props.onCreate({ title: 'T', body: 'B', baseRef: 'main' })}
      />
      <button data-testid="stub-cancel" onClick={props.onCancel} />
    </div>
  ),
}))

import { PrComposerCenter } from './PrComposerCenter'

beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(flow, { composer: null, defaultBaseRef: 'main', busy: false, error: null })
  flow.createPr.mockResolvedValue(undefined)
})

describe('PrComposerCenter', () => {
  it('renders nothing when no composer is prepared', () => {
    flow.composer = null
    const { container } = render(<PrComposerCenter repoPath="/repo" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the composer with the prepared title when one is prepared', () => {
    flow.composer = { head: 'feat/x', baseRef: 'main', title: 'feat: x' }
    render(<PrComposerCenter repoPath="/repo" />)
    expect(screen.getByTestId('pr-composer-center')).toBeInTheDocument()
    expect(screen.getByTestId('stub-title')).toHaveTextContent('feat: x')
  })

  it('drives createPr from the composer submit', async () => {
    flow.composer = { head: 'feat/x', baseRef: 'main', title: 'feat: x' }
    render(<PrComposerCenter repoPath="/repo" />)
    await userEvent.setup().click(screen.getByTestId('stub-create'))
    expect(flow.createPr).toHaveBeenCalledWith({ title: 'T', body: 'B', baseRef: 'main' })
  })

  it('cancels from the header close button', async () => {
    flow.composer = { head: 'feat/x', baseRef: 'main', title: 'feat: x' }
    render(<PrComposerCenter repoPath="/repo" />)
    await userEvent.setup().click(screen.getByTestId('pr-composer-close'))
    expect(flow.cancel).toHaveBeenCalledOnce()
  })
})
