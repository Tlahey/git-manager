import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { usePrTemplateMock, generateMock, aiState } = vi.hoisted(() => ({
  usePrTemplateMock: vi.fn(),
  generateMock: vi.fn(),
  aiState: { status: 'idle' as string, error: null as string | null },
}))
vi.mock('../../../hooks/usePrTemplate', () => ({ usePrTemplate: usePrTemplateMock }))
vi.mock('../../../hooks/usePrDescriptionGeneration', () => ({
  usePrDescriptionGeneration: () => ({
    generate: generateMock,
    cancel: vi.fn(),
    status: aiState.status,
    error: aiState.error,
  }),
}))
vi.mock('./PrBaseBranchDialog', () => ({ PrBaseBranchDialog: () => <div data-testid="stub-base-dialog" /> }))

const openUrl = vi.fn()
vi.mock('../../../lib/openUrl', () => ({ openUrl: (...a: unknown[]) => openUrl(...a) }))
const toastInfo = vi.fn()
vi.mock('@git-manager/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@git-manager/ui')>()
  return { ...actual, toast: { ...actual.toast, info: (...a: unknown[]) => toastInfo(...a) } }
})

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
  aiState.status = 'idle'
  aiState.error = null
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

  it('reports a failed generation instead of just clearing the body', () => {
    aiState.status = 'error'
    aiState.error = 'AI_PROVIDER_NOT_RUNNING'
    renderComposer()
    expect(screen.getByTestId('pr-composer-ai-error')).toHaveTextContent(
      'The AI provider is not running.'
    )
  })

  it('keeps the generation error separate from the publish error', () => {
    aiState.status = 'error'
    aiState.error = 'AI_PROVIDER_NOT_RUNNING'
    renderComposer({ error: 'GitHub API 422' })
    expect(screen.getByTestId('pr-composer-ai-error')).toBeInTheDocument()
    expect(screen.getByTestId('pr-composer-error')).toHaveTextContent('GitHub API 422')
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

  it('only explains why on an image drop, without opening a browser (no PR exists yet)', () => {
    renderComposer()

    fireEvent.drop(screen.getByTestId('pr-composer-body'), {
      dataTransfer: { types: ['Files'], files: [{ type: 'image/png' }] } as unknown as DataTransfer,
    })

    expect(openUrl).not.toHaveBeenCalled()
    expect(toastInfo).toHaveBeenCalled()
  })
})
