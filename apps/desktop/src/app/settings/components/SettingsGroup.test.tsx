import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SettingsGroup } from './SettingsGroup'

describe('SettingsGroup', () => {
  it('titles the block and renders what is put in it', () => {
    render(
      <SettingsGroup title="Models" testId="group">
        <input data-testid="field" />
      </SettingsGroup>
    )

    expect(screen.getByRole('heading', { name: 'Models' })).toBeInTheDocument()
    expect(screen.getByTestId('field')).toBeInTheDocument()
  })

  it('omits the description rather than reserving empty space for it', () => {
    render(
      <SettingsGroup title="Models" testId="group">
        <span />
      </SettingsGroup>
    )
    expect(screen.getByTestId('group').querySelector('p')).toBeNull()
  })

  it('frames the group when given a description', () => {
    render(
      <SettingsGroup title="Models" description="Which model does what." testId="group">
        <span />
      </SettingsGroup>
    )
    expect(screen.getByText('Which model does what.')).toBeInTheDocument()
  })

  /** A page must not open on a rule with nothing above it. */
  it('draws no rule for the first group on a page', () => {
    render(
      <SettingsGroup title="Provider" divided={false} testId="group">
        <span />
      </SettingsGroup>
    )
    expect(screen.getByTestId('group').className).not.toContain('border-t')
  })

  it('draws one for every group after it', () => {
    render(
      <SettingsGroup title="Models" testId="group">
        <span />
      </SettingsGroup>
    )
    expect(screen.getByTestId('group').className).toContain('border-t')
  })
})
