import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { GitBranch, PullRequest } from '@git-manager/git-types'
import { normalizeMenuSpec, type MenuSpecNode } from '../lib/nativeMenuSpec'

const invalidateQueries = vi.fn()
const useQueryMock = vi.fn()
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries }),
  useQuery: () => useQueryMock(),
}))

const toastSuccess = vi.fn()
const toastError = vi.fn()
vi.mock('@git-manager/ui', () => ({
  toast: {
    success: (...a: unknown[]) => toastSuccess(...a),
    error: (...a: unknown[]) => toastError(...a),
  },
}))

const showNativeMenu = vi.fn().mockResolvedValue(undefined)
vi.mock('../api/nativeMenu.api', () => ({
  showNativeMenu: (...a: unknown[]) => showNativeMenu(...a),
}))

vi.mock('../api/git.api', () => ({
  apiCheckoutBranch: vi.fn().mockResolvedValue(undefined),
  apiGetBranches: vi.fn().mockResolvedValue([]),
}))

const openUrl = vi.fn().mockResolvedValue(undefined)
vi.mock('../app/pull-requests/utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../app/pull-requests/utils')>()),
  openUrl: (...a: unknown[]) => openUrl(...a),
}))

const aiEnabledMock = vi.fn()
vi.mock('./useAiEnabled', () => ({ useAiEnabled: () => aiEnabledMock() }))

import * as gitApi from '../api/git.api'
import { useSidebarPrMenu } from './useSidebarPrMenu'
import { useRepoUIStore } from '../stores/repoUI.store'

const mocked = gitApi as unknown as Record<string, ReturnType<typeof vi.fn>>

function branch(shortName: string, isRemote = false): GitBranch {
  return {
    name: `refs/heads/${shortName}`,
    shortName,
    isHead: false,
    isRemote,
    commitOid: 'oid',
    commitMessage: '',
    commitTimestamp: 0,
    aheadCount: 0,
    behindCount: 0,
  }
}

function pr(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    number: 42,
    title: 'Add the thing',
    body: '',
    state: 'open',
    author: 'antoine',
    authorAvatar: '',
    headRef: 'feat/thing',
    baseRef: 'main',
    url: 'https://github.com/owner/repo/pull/42',
    ciStatus: null,
    createdAt: '',
    updatedAt: '',
    isDraft: false,
    assignees: [],
    requestedReviewers: [],
    labels: [],
    ...overrides,
  }
}

const event = () =>
  ({ preventDefault: vi.fn(), stopPropagation: vi.fn() }) as unknown as React.MouseEvent

const onSelectBranch = vi.fn()
const onCreateWorktree = vi.fn()

function openMenu(target = pr()) {
  const { result } = renderHook(() =>
    useSidebarPrMenu({ repoPath: '/repo', onSelectBranch, onCreateWorktree })
  )
  act(() => result.current(event(), target))
  return normalizeMenuSpec(showNativeMenu.mock.calls.at(-1)![0])
}

type ItemNode = Extract<MenuSpecNode, { kind: 'item' }>
const items = (nodes: MenuSpecNode[]) => nodes.filter((n): n is ItemNode => n.kind === 'item')
const item = (nodes: MenuSpecNode[], text: string) => items(nodes).find((n) => n.text === text)

beforeEach(() => {
  vi.clearAllMocks()
  useQueryMock.mockReturnValue({ data: [branch('feat/thing')] })
  aiEnabledMock.mockReturnValue(true)
  showNativeMenu.mockResolvedValue(undefined)
  mocked.apiCheckoutBranch.mockResolvedValue(undefined)
  useRepoUIStore.setState({ aiPanelTarget: null })
})

describe('useSidebarPrMenu — gating', () => {
  it('enables the branch entries when the PR head exists locally', () => {
    const spec = openMenu()
    expect(item(spec, 'Checkout branch')!.enabled).toBe(true)
    expect(item(spec, 'Create worktree from pull request')!.enabled).toBe(true)
  })

  it('disables them when the head has never been fetched', () => {
    useQueryMock.mockReturnValue({ data: [branch('main')] })
    const spec = openMenu()
    expect(item(spec, 'Checkout branch')!.enabled).toBe(false)
  })

  // A remote-tracking ref is not something the backend's checkout can resolve.
  it('does not count a remote branch of the same name as local', () => {
    useQueryMock.mockReturnValue({ data: [branch('feat/thing', true)] })
    expect(item(openMenu(), 'Checkout branch')!.enabled).toBe(false)
  })

  it('disables the review entry when AI is off', () => {
    aiEnabledMock.mockReturnValue(false)
    expect(item(openMenu(), 'Review pull request (LLM)')!.enabled).toBe(false)
  })

  it('suppresses the browser menu so only the native one shows', () => {
    const e = event()
    const { result } = renderHook(() =>
      useSidebarPrMenu({ repoPath: '/repo', onSelectBranch, onCreateWorktree })
    )
    act(() => result.current(e, pr()))
    expect(e.preventDefault).toHaveBeenCalled()
    expect(e.stopPropagation).toHaveBeenCalled()
  })
})

describe('useSidebarPrMenu — actions', () => {
  it('opens the PR in the browser', async () => {
    const spec = openMenu()
    await act(async () => item(spec, 'View pull request #42 on github.com')!.action!())
    expect(openUrl).toHaveBeenCalledWith('https://github.com/owner/repo/pull/42')
  })

  it('copies the PR URL and confirms', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })

    const spec = openMenu()
    await act(async () => item(spec, 'Copy link for pull request #42')!.action!())

    expect(writeText).toHaveBeenCalledWith('https://github.com/owner/repo/pull/42')
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled())
  })

  // The same target the graph's "review branch changes" produces — one panel, one request shape.
  it('points the AI panel at the PR range for a review', () => {
    const spec = openMenu()
    act(() => item(spec, 'Review pull request (LLM)')!.action!())
    expect(useRepoUIStore.getState().aiPanelTarget).toEqual({
      kind: 'reviewBranch',
      branch: 'feat/thing',
      baseRef: 'main',
    })
  })

  it('filters the graph to the head branch', () => {
    const spec = openMenu()
    act(() => item(spec, 'Go to branch in graph')!.action!())
    expect(onSelectBranch).toHaveBeenCalledWith('feat/thing')
  })

  it('checks the head branch out and refreshes the views', async () => {
    const spec = openMenu()
    await act(async () => item(spec, 'Checkout branch')!.action!())

    expect(mocked.apiCheckoutBranch).toHaveBeenCalledWith('/repo', 'feat/thing')
    await waitFor(() =>
      expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['branches', '/repo'] })
    )
    expect(toastSuccess).toHaveBeenCalled()
  })

  it('reports a failed checkout', async () => {
    mocked.apiCheckoutBranch.mockRejectedValue(new Error('would overwrite local changes'))
    const spec = openMenu()
    await act(async () => item(spec, 'Checkout branch')!.action!())
    await waitFor(() => expect(toastError).toHaveBeenCalled())
  })

  it('raises the worktree dialog on the PR head branch', () => {
    const spec = openMenu()
    act(() => item(spec, 'Create worktree from pull request')!.action!())
    expect(onCreateWorktree).toHaveBeenCalledWith('feat/thing')
  })
})
