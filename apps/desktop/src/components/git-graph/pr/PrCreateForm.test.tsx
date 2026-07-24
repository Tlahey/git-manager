import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { GitBranch } from '@git-manager/git-types'

vi.mock('@git-manager/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const { usePrTemplateMock, generateMock, useBranchesMock } = vi.hoisted(() => ({
  usePrTemplateMock: vi.fn(),
  generateMock: vi.fn(),
  useBranchesMock: vi.fn(),
}))
vi.mock('../../../hooks/usePrTemplate', () => ({ usePrTemplate: usePrTemplateMock }))
vi.mock('../../../hooks/usePrDescriptionGeneration', () => ({
  usePrDescriptionGeneration: () => ({
    generate: generateMock,
    status: 'idle',
    cancel: vi.fn(),
    error: null,
  }),
}))
vi.mock('../../../hooks/useBranches', () => ({ useBranches: useBranchesMock }))

import { PrCreateForm } from './PrCreateForm'
import { useSettingsStore } from '../../../stores/settings.store'

const INITIAL_SETTINGS = useSettingsStore.getState()

function branch(overrides: Partial<GitBranch> = {}): GitBranch {
  return {
    name: 'refs/heads/main',
    shortName: 'main',
    isHead: false,
    isRemote: false,
    commitOid: '',
    commitMessage: '',
    commitTimestamp: 0,
    aheadCount: 0,
    behindCount: 0,
    ...overrides,
  }
}

function renderForm(props: Partial<React.ComponentProps<typeof PrCreateForm>> = {}) {
  return render(
    <PrCreateForm
      repoPath="/repo"
      currentBranch="feat/x"
      defaultBase="main"
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
  useBranchesMock.mockReturnValue({
    data: [
      branch({ name: 'refs/heads/main', shortName: 'main' }),
      branch({ name: 'refs/heads/feat/x', shortName: 'feat/x', isHead: true }),
      branch({ name: 'refs/remotes/origin/main', shortName: 'origin/main', isRemote: true }),
    ],
  })
})

describe('PrCreateForm', () => {
  it('defaults head to the current branch and base to the default branch, and creates the PR', async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn()
    renderForm({ onCreate })

    expect(screen.getByTestId('pr-create-head')).toHaveValue('feat/x')
    expect(screen.getByTestId('pr-create-base')).toHaveValue('main')
    expect(screen.getByTestId('pr-create-title')).toHaveValue('feat/x')

    await user.clear(screen.getByTestId('pr-create-title'))
    await user.type(screen.getByTestId('pr-create-title'), 'My PR')
    await user.type(screen.getByTestId('pr-create-body'), 'body text')
    await user.click(screen.getByTestId('pr-create-draft'))
    await user.click(screen.getByTestId('pr-create-submit'))

    expect(onCreate).toHaveBeenCalledWith({
      head: 'feat/x',
      base: 'main',
      title: 'My PR',
      body: 'body text',
      draft: true,
    })
  })

  it('only lists local branches in the selectors', () => {
    renderForm()
    const options = Array.from(
      screen.getByTestId('pr-create-head').querySelectorAll('option')
    ).map((o) => o.textContent)
    expect(options).toEqual(['main', 'feat/x'])
  })

  it('disables submit when title is empty', async () => {
    const user = userEvent.setup()
    renderForm()
    expect(screen.getByTestId('pr-create-submit')).toBeEnabled()
    await user.clear(screen.getByTestId('pr-create-title'))
    expect(screen.getByTestId('pr-create-submit')).toBeDisabled()
  })

  it('defaults title to head branch and updates when head branch changes if untouched', async () => {
    const user = userEvent.setup()
    renderForm({ currentBranch: 'feat/x' })
    expect(screen.getByTestId('pr-create-title')).toHaveValue('feat/x')

    await user.selectOptions(screen.getByTestId('pr-create-head'), 'main')
    expect(screen.getByTestId('pr-create-title')).toHaveValue('main')

    // Once user types in title, changing head should not overwrite title
    await user.type(screen.getByTestId('pr-create-title'), ' - custom')
    await user.selectOptions(screen.getByTestId('pr-create-head'), 'feat/x')
    expect(screen.getByTestId('pr-create-title')).toHaveValue('main - custom')
  })

  it('triggers AI generation with the base ref and template content', async () => {
    const user = userEvent.setup()
    renderForm()
    await user.click(screen.getByTestId('pr-create-ai'))
    expect(generateMock).toHaveBeenCalledWith(
      'main',
      null,
      expect.any(Function),
      expect.any(Function)
    )
  })

  it('pre-fills the body from a single template', async () => {
    usePrTemplateMock.mockReturnValue({
      template: { kind: 'single', source: '.github/PULL_REQUEST_TEMPLATE.md', content: '## Checklist' },
      isLoading: false,
    })
    renderForm()
    await waitFor(() => expect(screen.getByTestId('pr-create-body')).toHaveValue('## Checklist'))
  })

  it('surfaces a create error inline', () => {
    renderForm({ error: 'GitHub API 422: A pull request already exists' })
    expect(screen.getByTestId('pr-create-error')).toHaveTextContent('already exists')
  })

  it('hides the AI button when AI is disabled', () => {
    useSettingsStore.setState((s) => ({
      settings: { ...s.settings, ai: { ...s.settings.ai, enabled: false } },
    }))
    renderForm()
    expect(screen.queryByTestId('pr-create-ai')).not.toBeInTheDocument()
    expect(screen.getByTestId('pr-create-submit')).toBeInTheDocument()
  })
})
