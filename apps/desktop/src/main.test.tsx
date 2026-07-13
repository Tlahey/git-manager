import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'

const initI18nMock = vi.fn(() => Promise.resolve())
vi.mock('@git-manager/i18n', () => ({ initI18n: initI18nMock }))

vi.mock('./App', () => ({ default: () => <div data-testid="fake-app" /> }))
vi.mock('./components/merge-editor/ConflictMergeWindow', () => ({
  ConflictMergeWindow: (props: { repoPath: string; filePath: string }) => (
    <div
      data-testid="fake-merge-window"
      data-repo-path={props.repoPath}
      data-file-path={props.filePath}
    />
  ),
}))
vi.mock('./components/git-graph/fixup/FixupCommitWindow', () => ({
  FixupCommitWindow: (props: {
    repoPath: string
    targetOid: string
    targetShortOid: string
    targetSubject: string
  }) => (
    <div
      data-testid="fake-fixup-window"
      data-repo-path={props.repoPath}
      data-target-oid={props.targetOid}
      data-target-short-oid={props.targetShortOid}
      data-target-subject={props.targetSubject}
    />
  ),
}))
vi.mock('./components/rebase-editor/RebasingCommitWindow', () => ({
  RebasingCommitWindow: (props: { repoPath: string; baseOid: string }) => (
    <div
      data-testid="fake-rebase-window"
      data-repo-path={props.repoPath}
      data-base-oid={props.baseOid}
    />
  ),
}))

function setSearch(search: string) {
  window.history.pushState({}, '', `/${search}`)
}

describe('main entry', () => {
  beforeEach(() => {
    vi.resetModules()
    initI18nMock.mockClear()
    document.body.innerHTML = '<div id="root"></div>'
  })

  it('initializes i18n in french and renders App when no window params are set', async () => {
    setSearch('')
    await import('./main')
    await waitFor(() => expect(screen.getByTestId('fake-app')).toBeInTheDocument())
    expect(initI18nMock).toHaveBeenCalledWith('fr')
  })

  it('renders the merge window when windowKind=merge with repoPath and filePath', async () => {
    setSearch('?window=merge&repoPath=%2Ftmp%2Frepo&filePath=src%2Ffoo.ts')
    await import('./main')
    const el = await waitFor(() => screen.getByTestId('fake-merge-window'))
    expect(el).toHaveAttribute('data-repo-path', '/tmp/repo')
    expect(el).toHaveAttribute('data-file-path', 'src/foo.ts')
  })

  it('falls back to App when windowKind=merge is missing filePath', async () => {
    setSearch('?window=merge&repoPath=%2Ftmp%2Frepo')
    await import('./main')
    await waitFor(() => expect(screen.getByTestId('fake-app')).toBeInTheDocument())
  })

  it('renders the rebase window when windowKind=rebase with repoPath and baseOid', async () => {
    setSearch('?window=rebase&repoPath=%2Ftmp%2Frepo&baseOid=abc123')
    await import('./main')
    const el = await waitFor(() => screen.getByTestId('fake-rebase-window'))
    expect(el).toHaveAttribute('data-repo-path', '/tmp/repo')
    expect(el).toHaveAttribute('data-base-oid', 'abc123')
  })

  it('falls back to App when windowKind=rebase is missing baseOid', async () => {
    setSearch('?window=rebase&repoPath=%2Ftmp%2Frepo')
    await import('./main')
    await waitFor(() => expect(screen.getByTestId('fake-app')).toBeInTheDocument())
  })

  it('renders the fixup window with provided shortOid and subject', async () => {
    setSearch(
      '?window=fixup&repoPath=%2Ftmp%2Frepo&oid=abcdef1234567890&shortOid=abcdef1&subject=Fix%20bug'
    )
    await import('./main')
    const el = await waitFor(() => screen.getByTestId('fake-fixup-window'))
    expect(el).toHaveAttribute('data-target-oid', 'abcdef1234567890')
    expect(el).toHaveAttribute('data-target-short-oid', 'abcdef1')
    expect(el).toHaveAttribute('data-target-subject', 'Fix bug')
  })

  it('derives shortOid and subject fallbacks when omitted for the fixup window', async () => {
    setSearch('?window=fixup&repoPath=%2Ftmp%2Frepo&oid=abcdef1234567890')
    await import('./main')
    const el = await waitFor(() => screen.getByTestId('fake-fixup-window'))
    expect(el).toHaveAttribute('data-target-short-oid', 'abcdef1')
    expect(el).toHaveAttribute('data-target-subject', '')
  })

  it('falls back to App when windowKind=fixup is missing oid', async () => {
    setSearch('?window=fixup&repoPath=%2Ftmp%2Frepo')
    await import('./main')
    await waitFor(() => expect(screen.getByTestId('fake-app')).toBeInTheDocument())
  })

  it('fades out and removes the static splash markup once the app mounts', async () => {
    document.body.innerHTML = '<div id="root"></div><div id="app-splash"></div>'
    setSearch('')
    await import('./main')
    await waitFor(() => expect(screen.getByTestId('fake-app')).toBeInTheDocument())
    await waitFor(() =>
      expect(document.getElementById('app-splash')).toHaveClass('is-hidden')
    )
  })

  it('does nothing when the splash markup is absent (e.g. secondary windows in tests)', async () => {
    setSearch('')
    await expect(import('./main')).resolves.not.toThrow()
    await waitFor(() => expect(screen.getByTestId('fake-app')).toBeInTheDocument())
  })
})
