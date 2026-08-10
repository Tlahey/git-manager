import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithLanguage } from '../../../test/i18n'

const { useRepoReadme } = vi.hoisted(() => ({ useRepoReadme: vi.fn() }))
vi.mock('../hooks/useRepoReadme', () => ({ useRepoReadme }))
vi.mock('../../../components/Markdown', () => ({
  Markdown: ({ content }: { content: string }) => <div data-testid="markdown">{content}</div>,
}))
vi.mock('../../../api/shell.api', () => ({ apiOpenUrl: vi.fn() }))

import { apiOpenUrl } from '../../../api/shell.api'
import { ReadmePanel } from './ReadmePanel'
import { useRepoDataStore } from '../../../stores/repoData.store'

const mockedOpenUrl = apiOpenUrl as unknown as ReturnType<typeof vi.fn>
const INITIAL_REPO_DATA = useRepoDataStore.getState()

beforeEach(() => {
  vi.clearAllMocks()
  useRepoDataStore.setState(INITIAL_REPO_DATA, true)
  useRepoReadme.mockReturnValue({ data: undefined, isLoading: false, error: undefined })
})

describe('ReadmePanel — header', () => {
  it('shows the repo name derived from the path', () => {
    render(<ReadmePanel path="/Users/me/projects/my-repo" onClose={vi.fn()} />)
    expect(screen.getByText('my-repo')).toBeInTheDocument()
  })

  it('calls onClose from the close button', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<ReadmePanel path="/repo" onClose={onClose} />)
    await user.click(screen.getByTestId('readme-panel-close-button'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('gives the icon-only close button an accessible name, not a title attribute', async () => {
    const user = userEvent.setup()
    render(<ReadmePanel path="/repo" onClose={vi.fn()} />)
    const close = screen.getByTestId('readme-panel-close-button')
    expect(close).toHaveAccessibleName('Close')
    expect(close).not.toHaveAttribute('title')
    await user.hover(close)
    await waitFor(() => expect(screen.getByRole('tooltip')).toHaveTextContent('Close'))
  })

  it('toggles between the rendered and the raw view', async () => {
    useRepoReadme.mockReturnValue({ data: '# Hello', isLoading: false, error: undefined })
    const user = userEvent.setup()
    render(<ReadmePanel path="/repo" onClose={vi.fn()} />)
    expect(screen.getByTestId('markdown')).toBeInTheDocument()

    await user.click(screen.getByTestId('readme-toggle-mode'))
    expect(screen.getByTestId('readme-raw-content')).toHaveTextContent('# Hello')
    expect(screen.queryByTestId('markdown')).not.toBeInTheDocument()
  })

  it('names the view toggle for whichever mode it will switch to', async () => {
    useRepoReadme.mockReturnValue({ data: '# Hello', isLoading: false, error: undefined })
    const user = userEvent.setup()
    render(<ReadmePanel path="/repo" onClose={vi.fn()} />)
    const toggle = screen.getByTestId('readme-toggle-mode')
    expect(toggle).toHaveAccessibleName('Show the raw markdown')

    await user.click(toggle)
    expect(screen.getByTestId('readme-toggle-mode')).toHaveAccessibleName(
      'Show the rendered README'
    )
  })
})

describe('ReadmePanel — remote link', () => {
  it('hides the remote button when there is no cached remote', () => {
    render(<ReadmePanel path="/repo" onClose={vi.fn()} />)
    expect(screen.queryByTestId('github-repo-button')).not.toBeInTheDocument()
  })

  it('shows a GitHub button and opens the remote URL when clicked', async () => {
    useRepoDataStore.setState({
      repoCache: {
        '/repo': {
          path: '/repo',
          name: 'repo',
          head: 'main',
          isDetached: false,
          isDirty: false,
          remotes: ['git@github.com:owner/repo.git'],
        },
      },
    })
    const user = userEvent.setup()
    render(<ReadmePanel path="/repo" onClose={vi.fn()} />)
    expect(screen.getByText('GitHub')).toBeInTheDocument()
    await user.click(screen.getByTestId('github-repo-button'))
    expect(mockedOpenUrl).toHaveBeenCalledWith('https://github.com/owner/repo')
  })

  it('names the remote button from the git namespace, not a title attribute', () => {
    useRepoDataStore.setState({
      repoCache: {
        '/repo': {
          path: '/repo',
          name: 'repo',
          head: 'main',
          isDetached: false,
          isDirty: false,
          remotes: ['git@github.com:owner/repo.git'],
        },
      },
    })
    render(<ReadmePanel path="/repo" onClose={vi.fn()} />)
    const button = screen.getByTestId('github-repo-button')
    expect(button).toHaveAccessibleName('Open in GitHub/GitLab')
    expect(button).not.toHaveAttribute('title')
  })

  it('shows a GitLab button for a gitlab remote', () => {
    useRepoDataStore.setState({
      repoCache: {
        '/repo': {
          path: '/repo',
          name: 'repo',
          head: 'main',
          isDetached: false,
          isDirty: false,
          remotes: ['https://gitlab.com/owner/repo.git'],
        },
      },
    })
    render(<ReadmePanel path="/repo" onClose={vi.fn()} />)
    expect(screen.getByText('GitLab')).toBeInTheDocument()
  })
})

describe('ReadmePanel — content states', () => {
  it('shows a loading indicator while fetching', () => {
    useRepoReadme.mockReturnValue({ data: undefined, isLoading: true, error: undefined })
    render(<ReadmePanel path="/repo" onClose={vi.fn()} />)
    expect(screen.getByText('Loading README…')).toBeInTheDocument()
  })

  it('treats undefined content (without an explicit error) as still loading', () => {
    useRepoReadme.mockReturnValue({ data: undefined, isLoading: false, error: undefined })
    render(<ReadmePanel path="/repo" onClose={vi.fn()} />)
    expect(screen.getByText('Loading README…')).toBeInTheDocument()
  })

  it('translates the loading message', () => {
    useRepoReadme.mockReturnValue({ data: undefined, isLoading: true, error: undefined })
    renderWithLanguage(<ReadmePanel path="/repo" onClose={vi.fn()} />, 'fr')
    expect(screen.getByText('Chargement du README…')).toBeInTheDocument()
  })

  it('shows a "no readme" message on error', () => {
    useRepoReadme.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('not found'),
    })
    render(<ReadmePanel path="/repo" onClose={vi.fn()} />)
    expect(screen.getByText('No README file found.')).toBeInTheDocument()
  })

  it('renders the README content via Markdown once loaded', () => {
    useRepoReadme.mockReturnValue({ data: '# Hello', isLoading: false, error: undefined })
    render(<ReadmePanel path="/repo" onClose={vi.fn()} />)
    expect(screen.getByTestId('markdown')).toHaveTextContent('# Hello')
  })
})
