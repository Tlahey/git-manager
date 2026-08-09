import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { GitBranch } from '@git-manager/git-types'
import { normalizeMenuSpec, type MenuSpecNode } from '../../../lib/nativeMenuSpec'

const invalidateQueries = vi.fn()
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
vi.mock('../../../api/nativeMenu.api', () => ({
  showNativeMenu: (...a: unknown[]) => showNativeMenu(...a),
}))

vi.mock('../../../api/git.api', () => ({
  apiCreateAndCheckoutBranch: vi.fn().mockResolvedValue(undefined),
  apiGetBranches: vi.fn().mockResolvedValue([]),
}))

const openUrl = vi.fn().mockResolvedValue(undefined)
vi.mock('../../../app/pull-requests/utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../app/pull-requests/utils')>()),
  openUrl: (...a: unknown[]) => openUrl(...a),
}))

const useQueryMock = vi.fn()

import * as gitApi from '../../../api/git.api'
import { useSidebarIssueMenu } from './useSidebarIssueMenu'
import type { MockIssue } from '../../../app/pull-requests/types'

const mocked = gitApi as unknown as Record<string, ReturnType<typeof vi.fn>>

function branch(shortName: string): GitBranch {
  return {
    name: `refs/heads/${shortName}`,
    shortName,
    isHead: false,
    isRemote: false,
    commitOid: 'oid',
    commitMessage: '',
    commitTimestamp: 0,
    aheadCount: 0,
    behindCount: 0,
  }
}

function issue(overrides: Partial<MockIssue> = {}): MockIssue {
  return {
    id: 'gh-issue-312',
    number: 312,
    title: 'Tab close button overlaps text',
    repo: 'repo',
    fullName: 'owner/repo',
    url: 'https://github.com/owner/repo/issues/312',
    status: 'open',
    author: 'marie',
    authorAvatar: '',
    assignees: [],
    labels: [],
    createdAt: new Date(0),
    updatedAt: new Date(0),
    comments: 0,
    thumbsUp: 0,
    ...overrides,
  }
}

const event = () =>
  ({ preventDefault: vi.fn(), stopPropagation: vi.fn() }) as unknown as React.MouseEvent

function openMenu(target: MockIssue = issue()) {
  const { result } = renderHook(() => useSidebarIssueMenu('/repo'))
  act(() => result.current(event(), target))
  return normalizeMenuSpec(showNativeMenu.mock.calls.at(-1)![0])
}

type ItemNode = Extract<MenuSpecNode, { kind: 'item' }>
const items = (nodes: MenuSpecNode[]) => nodes.filter((n): n is ItemNode => n.kind === 'item')
const texts = (nodes: MenuSpecNode[]) => items(nodes).map((n) => n.text)
const item = (nodes: MenuSpecNode[], text: string) => items(nodes).find((n) => n.text === text)

beforeEach(() => {
  vi.clearAllMocks()
  useQueryMock.mockReturnValue({ data: [] })
  showNativeMenu.mockResolvedValue(undefined)
  mocked.apiCreateAndCheckoutBranch.mockResolvedValue(undefined)
})

describe('useSidebarIssueMenu — menu shape', () => {
  it('offers the branch, GitHub and copy entries', () => {
    expect(texts(openMenu())).toEqual([
      'Create a branch for issue #312',
      'View issue on GitHub',
      'Copy issue link',
    ])
  })

  // Standalone-token matching, shared with the Launchpad: `312-fix` links issue 312, `3123` doesn't.
  it('drops the branch entry when a local branch already references the issue', () => {
    useQueryMock.mockReturnValue({ data: [branch('312-tab-close-button')] })
    expect(texts(openMenu())).toEqual(['View issue on GitHub', 'Copy issue link'])
  })

  it('keeps the branch entry when a branch merely contains a longer number', () => {
    useQueryMock.mockReturnValue({ data: [branch('3123-other')] })
    expect(texts(openMenu())).toContain('Create a branch for issue #312')
  })

  // A remote branch is not something the user has checked out; it must not suppress the offer.
  it('ignores remote branches when deciding whether the branch exists', () => {
    useQueryMock.mockReturnValue({ data: [{ ...branch('origin/312-fix'), isRemote: true }] })
    expect(texts(openMenu())).toContain('Create a branch for issue #312')
  })

  it('suppresses the browser menu so only the native one shows', () => {
    const e = event()
    const { result } = renderHook(() => useSidebarIssueMenu('/repo'))
    act(() => result.current(e, issue()))
    expect(e.preventDefault).toHaveBeenCalled()
    expect(e.stopPropagation).toHaveBeenCalled()
  })
})

describe('useSidebarIssueMenu — create a branch', () => {
  it('creates the branch off HEAD, checks it out and refreshes the views', async () => {
    const spec = openMenu()

    await act(async () => item(spec, 'Create a branch for issue #312')!.action!())

    expect(mocked.apiCreateAndCheckoutBranch).toHaveBeenCalledWith(
      '/repo',
      '312-tab-close-button-overlaps-text',
      'HEAD'
    )
    await waitFor(() =>
      expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['branches', '/repo'] })
    )
    expect(toastSuccess).toHaveBeenCalled()
  })

  it('reports a failed creation', async () => {
    mocked.apiCreateAndCheckoutBranch.mockRejectedValue(new Error('already exists'))
    const spec = openMenu()

    await act(async () => item(spec, 'Create a branch for issue #312')!.action!())

    expect(invalidateQueries).not.toHaveBeenCalled()
    await waitFor(() => expect(toastError).toHaveBeenCalled())
  })
})

describe('useSidebarIssueMenu — links', () => {
  it('opens the issue in the browser', async () => {
    const spec = openMenu()
    await act(async () => item(spec, 'View issue on GitHub')!.action!())
    expect(openUrl).toHaveBeenCalledWith('https://github.com/owner/repo/issues/312')
  })

  it('copies the issue URL and confirms', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })

    const spec = openMenu()
    await act(async () => item(spec, 'Copy issue link')!.action!())

    expect(writeText).toHaveBeenCalledWith('https://github.com/owner/repo/issues/312')
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled())
  })
})
