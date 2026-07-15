import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@git-manager/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

import { ResetToDefaultButton } from './ResetToDefaultButton'

describe('ResetToDefaultButton', () => {
  it('requires a confirming second click before resetting', async () => {
    const user = userEvent.setup()
    const onReset = vi.fn()
    render(<ResetToDefaultButton onReset={onReset} />)

    await user.click(screen.getByTestId('reset-to-default'))
    expect(onReset).not.toHaveBeenCalled()
    expect(screen.getByText('settings.reset.confirm')).toBeInTheDocument()

    await user.click(screen.getByTestId('reset-to-default-confirm'))
    expect(onReset).toHaveBeenCalledOnce()
  })

  it('cancels without resetting and returns to the idle button', async () => {
    const user = userEvent.setup()
    const onReset = vi.fn()
    render(<ResetToDefaultButton onReset={onReset} />)

    await user.click(screen.getByTestId('reset-to-default'))
    await user.click(screen.getByTestId('reset-to-default-cancel'))
    expect(onReset).not.toHaveBeenCalled()
    expect(screen.getByText('settings.reset.button')).toBeInTheDocument()
  })
})
