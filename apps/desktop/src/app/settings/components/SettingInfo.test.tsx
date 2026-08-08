import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SettingInfo } from './SettingInfo'

const props = {
  summary: 'Height of each commit row in the central graph.',
  scope: 'Applies to the commit graph only.',
  label: 'More information: Row height',
  testId: 'setting-info-row-height',
}

describe('SettingInfo', () => {
  it('names the trigger for assistive tech without exposing raw tooltip text upfront', () => {
    render(<SettingInfo {...props} />)
    expect(screen.getByRole('button', { name: 'More information: Row height' })).toBeInTheDocument()
    expect(screen.queryByText(props.summary)).not.toBeInTheDocument()
  })

  it('reveals both the effect and its scope on hover', async () => {
    const user = userEvent.setup()
    render(<SettingInfo {...props} />)
    await user.hover(screen.getByTestId('setting-info-row-height'))
    expect(await screen.findByText(props.summary)).toBeVisible()
    expect(screen.getByText(props.scope)).toBeVisible()
  })

  it('lets the bubble wrap, instead of running two sentences off the window', async () => {
    const user = userEvent.setup()
    render(<SettingInfo {...props} />)
    await user.hover(screen.getByTestId('setting-info-row-height'))
    const bubble = await screen.findByRole('tooltip')
    expect(bubble.className).toContain('whitespace-normal')
    expect(bubble.className).not.toContain('whitespace-nowrap')
  })

  it('reveals it on keyboard focus too, so the explanation is not mouse-only', async () => {
    const user = userEvent.setup()
    render(<SettingInfo {...props} />)
    await user.tab()
    expect(screen.getByTestId('setting-info-row-height')).toHaveFocus()
    expect(await screen.findByText(props.summary)).toBeVisible()
  })
})
