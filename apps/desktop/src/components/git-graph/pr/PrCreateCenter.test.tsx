import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@git-manager/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

const { flow } = vi.hoisted(() => ({
  flow: {
    ownerRepo: { owner: 'o', repo: 'r' } as { owner: string; repo: string } | null,
    token: 't' as string | null,
    currentBranch: 'feat/x' as string | null,
    defaultBase: 'main' as string | null,
    busy: false,
    error: null as string | null,
    createPr: vi.fn(),
    cancel: vi.fn(),
  },
}))
vi.mock('../../../hooks/usePrCreateFlow', () => ({ usePrCreateFlow: () => flow }))

// Keep this test on the center wrapper's wiring; the form has its own test.
vi.mock('./PrCreateForm', () => ({
  PrCreateForm: (props: {
    currentBranch: string | null
    defaultBase: string | null
    onCreate: (i: { head: string; base: string; title: string; body: string; draft: boolean }) => void
    onCancel: () => void
  }) => (
    <div data-testid="stub-form">
      <span data-testid="stub-head">{props.currentBranch}</span>
      <span data-testid="stub-base">{props.defaultBase}</span>
      <button
        data-testid="stub-create"
        onClick={() =>
          props.onCreate({ head: 'feat/x', base: 'main', title: 'T', body: 'B', draft: true })
        }
      />
      <button data-testid="stub-cancel" onClick={props.onCancel} />
    </div>
  ),
}))

import { PrCreateCenter } from './PrCreateCenter'

beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(flow, {
    ownerRepo: { owner: 'o', repo: 'r' },
    token: 't',
    currentBranch: 'feat/x',
    defaultBase: 'main',
    busy: false,
    error: null,
  })
  flow.createPr.mockResolvedValue(undefined)
})

describe('PrCreateCenter', () => {
  it('renders the create view with the current/default branches', () => {
    render(<PrCreateCenter repoPath="/repo" />)
    expect(screen.getByTestId('pr-create-center')).toBeInTheDocument()
    expect(screen.getByTestId('stub-head')).toHaveTextContent('feat/x')
    expect(screen.getByTestId('stub-base')).toHaveTextContent('main')
  })

  it('drives createPr from the form submit', async () => {
    render(<PrCreateCenter repoPath="/repo" />)
    await userEvent.setup().click(screen.getByTestId('stub-create'))
    expect(flow.createPr).toHaveBeenCalledWith({
      head: 'feat/x',
      base: 'main',
      title: 'T',
      body: 'B',
      draft: true,
    })
  })

  it('cancels from the header close button', async () => {
    render(<PrCreateCenter repoPath="/repo" />)
    await userEvent.setup().click(screen.getByTestId('pr-create-close'))
    expect(flow.cancel).toHaveBeenCalledOnce()
  })
})
