import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithLanguage } from '../../test/i18n'

let aiEnabled = true
vi.mock('../../hooks/useAiEnabled', () => ({ useAiEnabled: () => aiEnabled }))

import { AiMenu } from './AiMenu'
import { useRepoUIStore } from '../../stores/repoUI.store'
import { useSettingsStore } from '../../stores/settings.store'

const INITIAL_SETTINGS = useSettingsStore.getState()

async function openMenu(repoPath: string | null = '/repo') {
  const user = userEvent.setup()
  render(<AiMenu repoPath={repoPath} />)
  await user.click(screen.getByTestId('toolbar-ai-button'))
  return user
}

beforeEach(() => {
  aiEnabled = true
  useSettingsStore.setState(INITIAL_SETTINGS, true)
  useRepoUIStore.setState({ aiPanelTarget: null, activeDiffFile: null, activePrNumber: null })
})

describe('AiMenu', () => {
  it('names its trigger for assistive tech', () => {
    render(<AiMenu repoPath="/repo" />)
    expect(screen.getByTestId('toolbar-ai-button')).toHaveAccessibleName('AI')
  })

  /**
   * A toolbar menu is opened with nothing selected, so it holds only actions that work that way.
   * Explaining a commit or reviewing a branch needs a selection and stays on the row that carries
   * it — listing them here would mean a menu that is mostly greyed out.
   */
  it('offers the daily summaries, and nothing that needs a selection', async () => {
    await openMenu()
    expect(screen.getByTestId('ai-menu-summaries')).toHaveTextContent('Daily summaries (LLM)')
    expect(screen.queryByTestId('ai-menu-explain-working')).not.toBeInTheDocument()
    expect(screen.queryByTestId('ai-menu-review-working')).not.toBeInTheDocument()
  })

  /**
   * The entry opens into the graph's single right-hand slot, and has to clear the centre slot's
   * other claimants — otherwise the panel opens behind a diff the user then closes by hand.
   */
  it('opens the summaries panel and clears the other claimants', async () => {
    useRepoUIStore.setState({
      activeDiffFile: { path: 'src/a.ts', staged: false },
      activePrNumber: 12,
    })
    const user = await openMenu()
    await user.click(screen.getByTestId('ai-menu-summaries'))

    expect(useRepoUIStore.getState().aiPanelTarget).toEqual({ kind: 'summaries' })
    expect(useRepoUIStore.getState().activeDiffFile).toBeNull()
    expect(useRepoUIStore.getState().activePrNumber).toBeNull()
  })

  /** An empty or fully greyed-out menu is worse than no menu. */
  it('renders nothing at all when the AI provider is off', () => {
    aiEnabled = false
    const { container } = render(<AiMenu repoPath="/repo" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when the summaries feature alone is off', () => {
    useSettingsStore.setState({
      settings: {
        ...INITIAL_SETTINGS.settings,
        dailySummary: { enabled: false, autoGenerate: false },
      },
    })
    const { container } = render(<AiMenu repoPath="/repo" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('disables the trigger with no repository open', () => {
    render(<AiMenu repoPath={null} />)
    expect(screen.getByTestId('toolbar-ai-button')).toBeDisabled()
  })

  it('renders the French copy when the app is in French', () => {
    renderWithLanguage(<AiMenu repoPath="/repo" />, 'fr')
    expect(screen.getByTestId('toolbar-ai-button')).toHaveAccessibleName('IA')
  })
})
