import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@git-manager/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

import { OverriddenBadge } from './OverriddenBadge'
import { useSettingsStore } from '../../../stores/settings.store'
import { useRepoUIStore } from '../../../stores/repoUI.store'

const INITIAL = useSettingsStore.getState()

beforeEach(() => {
  useSettingsStore.setState(INITIAL, true)
  useRepoUIStore.setState({ activeRepo: null })
})

describe('OverriddenBadge', () => {
  it('renders nothing when there is no active repo', () => {
    render(<OverriddenBadge field="theme" />)
    expect(screen.queryByTestId('overridden-badge-theme')).not.toBeInTheDocument()
  })

  it('renders nothing when the active repo does not override the field', () => {
    useRepoUIStore.setState({ activeRepo: '/repo' })
    render(<OverriddenBadge field="theme" />)
    expect(screen.queryByTestId('overridden-badge-theme')).not.toBeInTheDocument()
  })

  it('shows the tag when the active repo overrides the field', () => {
    useRepoUIStore.setState({ activeRepo: '/repo' })
    useSettingsStore.getState().setRepoSetting('/repo', 'theme', 'dracula')
    render(<OverriddenBadge field="theme" />)
    expect(screen.getByTestId('overridden-badge-theme')).toHaveTextContent(
      'settings.repository.overriddenTag'
    )
  })

  it('is field-specific (a protectedBranches override does not tag theme)', () => {
    useRepoUIStore.setState({ activeRepo: '/repo' })
    useSettingsStore.getState().setRepoSetting('/repo', 'protectedBranches', ['x'])
    render(<OverriddenBadge field="theme" />)
    expect(screen.queryByTestId('overridden-badge-theme')).not.toBeInTheDocument()
  })
})
