import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { lastRepoRowProps } = vi.hoisted(() => ({
  lastRepoRowProps: { current: [] as Record<string, unknown>[] },
}))
vi.mock('../../../api/git.api', () => ({
  apiFetchRemote: vi.fn().mockResolvedValue(undefined),
  apiPullBranch: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../../../api/repo.api', () => ({
  apiOpenInEditor: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('./RepoRow', () => ({
  RepoRow: (props: Record<string, unknown>) => {
    lastRepoRowProps.current.push(props)
    return (
      <div data-testid={`repo-row-${props.path}`} data-selected={String(props.isSelected)}>
        <button onClick={props.onToggleSelected as () => void}>select-{props.path as string}</button>
      </div>
    )
  },
}))

import { apiFetchRemote, apiPullBranch } from '../../../api/git.api'
import { RepoSection } from './RepoSection'
import { useRepoDataStore } from '../../../stores/repoData.store'
import { useRepoUIStore } from '../../../stores/repoUI.store'
import { useDashboardStore } from '../../../stores/dashboard.store'

const INITIAL_REPO_DATA = useRepoDataStore.getState()
const INITIAL_REPO_UI = useRepoUIStore.getState()

const REPOS = [
  { path: '/repo/a', name: 'alpha' },
  { path: '/repo/b', name: 'beta' },
]

function renderSection(props: Partial<React.ComponentProps<typeof RepoSection>> = {}) {
  const defaults: React.ComponentProps<typeof RepoSection> = {
    id: 'favorites',
    icon: <span />,
    title: 'Favorites',
    repos: REPOS,
    emptyLabel: 'No favorite repositories.',
    onToggleReadme: vi.fn(),
    selectedReadmePath: null,
    onToggleSummary: vi.fn(),
    selectedSummaryPath: null,
    summaryEnabled: true,
  }
  return render(<RepoSection {...defaults} {...props} />)
}

beforeEach(() => {
  vi.clearAllMocks()
  lastRepoRowProps.current = []
  useRepoDataStore.setState(INITIAL_REPO_DATA, true)
  useRepoUIStore.setState(INITIAL_REPO_UI, true)
  useDashboardStore.setState({ collapsedSections: {} })
  useRepoDataStore.setState({
    savedRepos: [{ path: '/repo/a', name: 'alpha', pinned: true }],
  })
})

describe('RepoSection — rendering', () => {
  it('renders one row per repo', () => {
    renderSection()
    expect(screen.getByTestId('repo-row-/repo/a')).toBeInTheDocument()
    expect(screen.getByTestId('repo-row-/repo/b')).toBeInTheDocument()
  })

  it('shows the empty label instead of a list when there is no repo', () => {
    renderSection({ repos: [] })
    expect(screen.getByText('No favorite repositories.')).toBeInTheDocument()
    expect(screen.queryByTestId('repo-row-/repo/a')).toBeNull()
  })

  it('marks a saved repo as saved and pinned, and an unsaved one as neither', () => {
    renderSection()
    const byPath = new Map(lastRepoRowProps.current.map((p) => [p.path, p]))
    expect(byPath.get('/repo/a')).toMatchObject({ isSaved: true, isPinned: true })
    expect(byPath.get('/repo/b')).toMatchObject({ isSaved: false, isPinned: false })
  })

  it('flags the row whose README panel is open', () => {
    renderSection({ selectedReadmePath: '/repo/b' })
    const byPath = new Map(lastRepoRowProps.current.map((p) => [p.path, p]))
    expect(byPath.get('/repo/b')).toMatchObject({ isReadmeActive: true })
    expect(byPath.get('/repo/a')).toMatchObject({ isReadmeActive: false })
  })
})

describe('RepoSection — folding', () => {
  it('hides the rows when the section is collapsed', async () => {
    const user = userEvent.setup()
    renderSection()
    await user.click(screen.getByTestId('dashboard-section-toggle-favorites'))
    expect(screen.queryByTestId('repo-row-/repo/a')).toBeNull()
    expect(useDashboardStore.getState().collapsedSections.favorites).toBe(true)
  })

  it('keeps the header — and its count — visible while collapsed', () => {
    useDashboardStore.setState({ collapsedSections: { favorites: true } })
    renderSection()
    expect(screen.getByTestId('dashboard-section-header-favorites')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.queryByTestId('repo-row-/repo/a')).toBeNull()
  })

  it('folds each section independently', () => {
    useDashboardStore.setState({ collapsedSections: { open: true } })
    renderSection({ id: 'favorites' })
    expect(screen.getByTestId('repo-row-/repo/a')).toBeInTheDocument()
  })
})

describe('RepoSection — selection wiring', () => {
  it('selects a row and reflects it in the header', async () => {
    const user = userEvent.setup()
    renderSection()
    await user.click(screen.getByText('select-/repo/a'))
    expect(screen.getByTestId('repo-row-/repo/a')).toHaveAttribute('data-selected', 'true')
    expect(screen.getByTestId('dashboard-section-selected-count-favorites')).toHaveTextContent(
      '1 selected'
    )
  })

  it('selects every row from the header checkbox', async () => {
    const user = userEvent.setup()
    renderSection()
    await user.click(screen.getByTestId('dashboard-section-select-all-favorites'))
    expect(screen.getByTestId('dashboard-section-selected-count-favorites')).toHaveTextContent(
      '2 selected'
    )
  })
})

describe('RepoSection — bulk git actions', () => {
  it('fetches every repo of the section when nothing is checked', async () => {
    const user = userEvent.setup()
    renderSection()
    await user.click(screen.getByTestId('dashboard-section-fetch-favorites'))
    await waitFor(() => expect(apiFetchRemote).toHaveBeenCalledTimes(2))
    expect((apiFetchRemote as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0])).toEqual([
      '/repo/a',
      '/repo/b',
    ])
  })

  it('fetches only the checked repos', async () => {
    const user = userEvent.setup()
    renderSection()
    await user.click(screen.getByText('select-/repo/a'))
    await user.click(screen.getByTestId('dashboard-section-fetch-favorites'))
    await waitFor(() => expect(apiFetchRemote).toHaveBeenCalledTimes(1))
    expect(apiFetchRemote).toHaveBeenCalledWith('/repo/a')
  })

  it('pulls with the strategy chosen in the menu', async () => {
    const user = userEvent.setup()
    renderSection()
    await user.click(screen.getByTestId('dashboard-section-pull-favorites'))
    await user.click(await screen.findByTestId('dashboard-section-pull-favorites-rebase'))
    await waitFor(() => expect(apiPullBranch).toHaveBeenCalledTimes(2))
    expect(apiPullBranch).toHaveBeenCalledWith('/repo/a', undefined, 'rebase')
  })
})

describe('RepoSection — hiding', () => {
  it('renders nothing at all once the section is hidden', () => {
    useDashboardStore.setState({ hiddenSections: { favorites: true } })
    const { container } = renderSection()
    expect(container).toBeEmptyDOMElement()
  })

  it('is unaffected by another section being hidden', () => {
    useDashboardStore.setState({ hiddenSections: { open: true } })
    renderSection({ id: 'favorites' })
    expect(screen.getByTestId('dashboard-section-favorites')).toBeInTheDocument()
  })
})
