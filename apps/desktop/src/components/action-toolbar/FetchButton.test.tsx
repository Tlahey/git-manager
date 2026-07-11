import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@git-manager/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

import { FetchButton } from './FetchButton'

describe('FetchButton', () => {
  it('calls onFetch when the main button is clicked', async () => {
    const user = userEvent.setup()
    const onFetch = vi.fn()
    render(<FetchButton onFetch={onFetch} onFetchAll={vi.fn()} onFetchPrune={vi.fn()} />)
    await user.click(screen.getByTitle('remote.fetch'))
    expect(onFetch).toHaveBeenCalledOnce()
  })

  it('disables both the main button and the dropdown trigger while loading', () => {
    render(<FetchButton loading onFetch={vi.fn()} onFetchAll={vi.fn()} onFetchPrune={vi.fn()} />)
    expect(screen.getByTitle('remote.fetch')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'toolbar.fetchAll' })).toBeDisabled()
  })

  it('opens the dropdown and calls onFetchAll/onFetchPrune from their menu items', async () => {
    const user = userEvent.setup()
    const onFetchAll = vi.fn()
    const onFetchPrune = vi.fn()
    render(<FetchButton onFetch={vi.fn()} onFetchAll={onFetchAll} onFetchPrune={onFetchPrune} />)

    await user.click(screen.getByRole('button', { name: 'toolbar.fetchAll' }))
    await user.click(screen.getByRole('menuitem', { name: /toolbar.fetchAll/ }))
    expect(onFetchAll).toHaveBeenCalledOnce()

    await user.click(screen.getByRole('button', { name: 'toolbar.fetchAll' }))
    await user.click(screen.getByRole('menuitem', { name: /toolbar.fetchPrune/ }))
    expect(onFetchPrune).toHaveBeenCalledOnce()
  })
})
