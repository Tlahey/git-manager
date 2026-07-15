import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@git-manager/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const { usePrTemplateMock, generateMock } = vi.hoisted(() => ({
  usePrTemplateMock: vi.fn(),
  generateMock: vi.fn(),
}))
vi.mock('../../../hooks/usePrTemplate', () => ({ usePrTemplate: usePrTemplateMock }))
vi.mock('../../../hooks/usePrDescriptionGeneration', () => ({
  usePrDescriptionGeneration: () => ({ generate: generateMock, status: 'idle', cancel: vi.fn(), error: null }),
}))
vi.mock('./PrBaseBranchDialog', () => ({ PrBaseBranchDialog: () => <div data-testid="stub-base-dialog" /> }))

import { PrComposerExpander } from './PrComposerExpander'
import { useSettingsStore } from '../../../stores/settings.store'

const INITIAL_SETTINGS = useSettingsStore.getState()

function renderComposer(props: Partial<React.ComponentProps<typeof PrComposerExpander>> = {}) {
  return render(
    <PrComposerExpander
      repoPath="/repo"
      defaultTitle="feat: x"
      defaultBaseRef="main"
      isSubmitting={false}
      onCreate={vi.fn()}
      onCancel={vi.fn()}
      {...props}
    />
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  useSettingsStore.setState(INITIAL_SETTINGS, true)
  usePrTemplateMock.mockReturnValue({ template: { kind: 'none' }, isLoading: false })
})

describe('PrComposerExpander', () => {
  it('pre-fills the title and base ref, and creates the PR', async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn()
    renderComposer({ onCreate })
    expect(screen.getByTestId('pr-composer-title')).toHaveValue('feat: x')
    expect(screen.getByTestId('pr-composer-base')).toHaveTextContent('main')

    await user.type(screen.getByTestId('pr-composer-body'), 'the description')
    await user.click(screen.getByTestId('pr-composer-create'))
    expect(onCreate).toHaveBeenCalledWith({
      title: 'feat: x',
      body: 'the description',
      baseRef: 'main',
    })
  })

  it('pre-fills the body from a single template', async () => {
    usePrTemplateMock.mockReturnValue({
      template: { kind: 'single', source: '.github/PULL_REQUEST_TEMPLATE.md', content: '## Checklist' },
      isLoading: false,
    })
    renderComposer()
    await waitFor(() =>
      expect(screen.getByTestId('pr-composer-body')).toHaveValue('## Checklist')
    )
  })

  it('shows a template chooser for a multi-template repo', () => {
    usePrTemplateMock.mockReturnValue({
      template: {
        kind: 'multiple',
        options: [
          { name: 'bug.md', content: 'bug' },
          { name: 'feature.md', content: 'feature' },
        ],
      },
      isLoading: false,
    })
    renderComposer()
    expect(screen.getByTestId('pr-composer-template-select')).toBeInTheDocument()
  })

  it('triggers AI generation with the base ref and template content', async () => {
    const user = userEvent.setup()
    renderComposer()
    await user.click(screen.getByTestId('pr-composer-ai-fill'))
    expect(generateMock).toHaveBeenCalledWith('main', null, expect.any(Function), expect.any(Function))
  })

  it('surfaces a publish error inline', () => {
    renderComposer({ error: 'GitHub API 422: No commits between main and feature-x' })
    expect(screen.getByTestId('pr-composer-error')).toHaveTextContent('No commits between main')
  })

  it('hides the AI-fill button when AI is disabled', () => {
    useSettingsStore.setState((s) => ({
      settings: { ...s.settings, ai: { ...s.settings.ai, enabled: false } },
    }))
    renderComposer()
    expect(screen.queryByTestId('pr-composer-ai-fill')).not.toBeInTheDocument()
    // The composer itself still works without AI.
    expect(screen.getByTestId('pr-composer-create')).toBeInTheDocument()
  })
})
