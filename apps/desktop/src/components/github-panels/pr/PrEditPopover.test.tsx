import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { PrEditOption } from './PrEditPopover'

vi.mock('@git-manager/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

import { PrEditPopover } from './PrEditPopover'

const OPTIONS: PrEditOption[] = [
  { key: 'alice', label: 'alice', avatarUrl: '' },
  { key: 'bob', label: 'bob', avatarUrl: '' },
  { key: 'carol', label: 'carol', avatarUrl: '' },
]

function renderPopover(props: Partial<React.ComponentProps<typeof PrEditPopover>> = {}) {
  return render(
    <PrEditPopover
      title="Reviewers"
      options={OPTIONS}
      selectedKeys={['alice']}
      onAdd={vi.fn()}
      onRemove={vi.fn()}
      onClose={vi.fn()}
      {...props}
    />
  )
}

beforeEach(() => vi.clearAllMocks())

describe('PrEditPopover', () => {
  it('lists candidates excluding the already-selected ones', () => {
    renderPopover()
    expect(screen.getByTestId('pr-edit-add-bob')).toBeInTheDocument()
    expect(screen.getByTestId('pr-edit-add-carol')).toBeInTheDocument()
    expect(screen.queryByTestId('pr-edit-add-alice')).not.toBeInTheDocument()
    // Selected chip is shown instead.
    expect(screen.getByTestId('pr-edit-selected-alice')).toBeInTheDocument()
  })

  it('filters candidates by the search query', async () => {
    const user = userEvent.setup()
    renderPopover()
    await user.type(screen.getByTestId('pr-edit-search'), 'car')
    expect(screen.getByTestId('pr-edit-add-carol')).toBeInTheDocument()
    expect(screen.queryByTestId('pr-edit-add-bob')).not.toBeInTheDocument()
  })

  it('calls onAdd / onRemove / onClose', async () => {
    const onAdd = vi.fn()
    const onRemove = vi.fn()
    const onClose = vi.fn()
    const user = userEvent.setup()
    renderPopover({ onAdd, onRemove, onClose })
    await user.click(screen.getByTestId('pr-edit-add-bob'))
    expect(onAdd).toHaveBeenCalledWith('bob')
    await user.click(screen.getByTestId('pr-edit-remove-alice'))
    expect(onRemove).toHaveBeenCalledWith('alice')
    await user.click(screen.getByTestId('pr-edit-close'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('shows a loading state and an empty state', () => {
    const { rerender } = renderPopover({ loading: true })
    expect(screen.getByText('pr.edit.loading')).toBeInTheDocument()

    rerender(
      <PrEditPopover
        title="Reviewers"
        options={[]}
        selectedKeys={[]}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
        onClose={vi.fn()}
      />
    )
    expect(screen.getByText('pr.edit.noResults')).toBeInTheDocument()
  })
})
