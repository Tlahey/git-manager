import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

vi.mock('@git-manager/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

import { AiCommitSection } from './AiCommitSection'
import { useSettingsStore } from '../../../stores/settings.store'
import { useRepoUIStore } from '../../../stores/repoUI.store'

const INITIAL = useSettingsStore.getState()

beforeEach(() => {
  useSettingsStore.setState(INITIAL, true)
  useRepoUIStore.setState({ activeRepo: null })
})

describe('AiCommitSection', () => {
  it('edits the global commit instructions', async () => {
    const user = userEvent.setup()
    render(<AiCommitSection />)
    await user.type(screen.getByTestId('commit-instructions-input'), 'imperative mood')
    expect(useSettingsStore.getState().settings.git.commitInstructions).toBe('imperative mood')
  })

  it('edits the global commit pattern', async () => {
    const user = userEvent.setup()
    render(<AiCommitSection />)
    await user.type(screen.getByTestId('commit-pattern-input'), '^feat')
    expect(useSettingsStore.getState().settings.git.commitPattern).toBe('^feat')
  })

  it('shows the overridden tag when the active repo overrides commit instructions', () => {
    useRepoUIStore.setState({ activeRepo: '/repo' })
    useSettingsStore.getState().setRepoSetting('/repo', 'commitInstructions', 'x')
    render(<AiCommitSection />)
    expect(screen.getByTestId('overridden-badge-commitInstructions')).toBeInTheDocument()
  })
})
