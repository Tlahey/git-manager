import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { GitRef } from '@git-manager/git-types'
import { normalizeMenuSpec, type MenuSpecNode } from '../lib/nativeMenuSpec'

// Hoisted so the vi.mock factories (evaluated during the hoisted static imports below) can safely
// reference these — a plain top-level const would still be in its TDZ at that point.
const { showMenu, openPrCreateWith, invalidateQueries, api } = vi.hoisted(() => ({
  showMenu: vi.fn(),
  openPrCreateWith: vi.fn(),
  invalidateQueries: vi.fn(),
  api: {
    apiCheckoutBranch: vi.fn(async () => {}),
    apiMergeBranch: vi.fn(async () => {}),
    apiFastForwardBranch: vi.fn(async () => {}),
    apiPushBranchTo: vi.fn(async () => {}),
    apiRebaseOntoCommit: vi.fn(async () => {}),
    apiResetToCommit: vi.fn(async () => {}),
  },
}))

vi.mock('../api/nativeMenu.api', () => ({
  showNativeMenu: (spec: unknown) => showMenu(spec),
}))
vi.mock('../api/git.api', () => api)
vi.mock('@git-manager/ui', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries }) }))
vi.mock('../stores/repoData.store', () => ({
  useRepoDataStore: (sel: (s: unknown) => unknown) =>
    sel({ repoCache: { '/r': { head: 'current', isDetached: false } } }),
}))
vi.mock('../stores/repoUI.store', () => ({
  useRepoUIStore: (sel: (s: unknown) => unknown) => sel({ openPrCreateWith }),
}))

import { useRefDrop } from './useRefDrop'

const branch = (shortName: string, oid = 'oid-' + shortName): GitRef => ({
  name: `refs/heads/${shortName}`,
  shortName,
  type: 'branch',
  commitOid: oid,
})
const tag = (shortName: string): GitRef => ({
  name: `refs/tags/${shortName}`,
  shortName,
  type: 'tag',
  commitOid: 'oid-' + shortName,
})

type ItemNode = Extract<MenuSpecNode, { kind: 'item' }>
type SubmenuNode = Extract<MenuSpecNode, { kind: 'submenu' }>

// The drop menu is now a declarative spec handed to showNativeMenu. Address items/submenus by
// their real English label (i18n runs live in tests), reading `enabled` and firing `action`.
function dropAndGetSpec(source: GitRef, target: GitRef): MenuSpecNode[] {
  const { result } = renderHook(() => useRefDrop('/r'))
  result.current.handleDrop(source, target)
  return normalizeMenuSpec(showMenu.mock.calls.at(-1)![0] as never)
}

const item = (spec: MenuSpecNode[], prefix: string): ItemNode | undefined =>
  spec.find((n): n is ItemNode => n.kind === 'item' && n.text.startsWith(prefix))
const submenu = (spec: MenuSpecNode[], prefix: string): SubmenuNode | undefined =>
  spec.find((n): n is SubmenuNode => n.kind === 'submenu' && n.text.startsWith(prefix))

// Labels come from gitTree.dragDrop.* — stable prefixes that don't depend on the interpolated names.
const FF = 'Fast-forward'
const MERGE = 'Merge'
const REBASE = 'Rebase'
const PUSH = 'Push'
const RESET = 'Reset'
const PR = 'Start a pull request'

const flush = () => new Promise((r) => setTimeout(r))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useRefDrop — enablement', () => {
  it('enables every action when dragging a branch onto a branch', () => {
    const spec = dropAndGetSpec(branch('feat'), branch('main'))
    expect(item(spec, FF)?.enabled).toBe(true)
    expect(item(spec, MERGE)?.enabled).toBe(true)
    expect(item(spec, REBASE)?.enabled).toBe(true)
    expect(item(spec, PUSH)?.enabled).toBe(true)
    expect(submenu(spec, RESET)?.enabled).toBe(true)
    expect(item(spec, PR)?.enabled).toBe(true)
  })

  it('disables source-rewriting actions and PR when the source is a tag', () => {
    const spec = dropAndGetSpec(tag('v1'), branch('main'))
    expect(item(spec, REBASE)?.enabled).toBe(false)
    expect(submenu(spec, RESET)?.enabled).toBe(false)
    expect(item(spec, PUSH)?.enabled).toBe(false)
    expect(item(spec, PR)?.enabled).toBe(false)
    // Target is still a local branch, so it can receive a fast-forward / merge from the tag.
    expect(item(spec, FF)?.enabled).toBe(true)
    expect(item(spec, MERGE)?.enabled).toBe(true)
  })

  it('disables fast-forward/merge when the target is not a local branch', () => {
    const spec = dropAndGetSpec(branch('feat'), tag('v1'))
    expect(item(spec, FF)?.enabled).toBe(false)
    expect(item(spec, MERGE)?.enabled).toBe(false)
  })
})

describe('useRefDrop — actions', () => {
  it('merges source into target', async () => {
    const spec = dropAndGetSpec(branch('feat'), branch('main'))
    item(spec, MERGE)!.action!()
    await flush()
    expect(api.apiMergeBranch).toHaveBeenCalledWith('/r', 'feat', 'main')
  })

  it('fast-forwards target to source', async () => {
    const spec = dropAndGetSpec(branch('feat'), branch('main'))
    item(spec, FF)!.action!()
    await flush()
    expect(api.apiFastForwardBranch).toHaveBeenCalledWith('/r', 'feat', 'main')
  })

  it('checks out the source then rebases it onto the target commit', async () => {
    const spec = dropAndGetSpec(branch('feat'), branch('main', 'main-oid'))
    item(spec, REBASE)!.action!()
    await flush()
    expect(api.apiCheckoutBranch).toHaveBeenCalledWith(
      '/r',
      'feat',
      expect.objectContaining({ fromRef: 'current' })
    )
    expect(api.apiRebaseOntoCommit).toHaveBeenCalledWith('/r', 'main-oid')
  })

  it('checks out the source then resets it to the target commit', async () => {
    const spec = dropAndGetSpec(branch('feat'), branch('main', 'main-oid'))
    const reset = normalizeMenuSpec(submenu(spec, RESET)!.items)
    item(reset, 'Hard')!.action!()
    await flush()
    expect(api.apiCheckoutBranch).toHaveBeenCalledWith('/r', 'feat', expect.any(Object))
    expect(api.apiResetToCommit).toHaveBeenCalledWith('/r', 'main-oid', 'hard')
  })

  it('pushes the source to the target on origin', async () => {
    const spec = dropAndGetSpec(branch('feat'), branch('main'))
    item(spec, PUSH)!.action!()
    await flush()
    expect(api.apiPushBranchTo).toHaveBeenCalledWith('/r', 'feat', 'main', 'origin')
  })

  it('opens the PR-create view prefilled with source → target', () => {
    const spec = dropAndGetSpec(branch('feat'), branch('main'))
    item(spec, PR)!.action!()
    expect(openPrCreateWith).toHaveBeenCalledWith('feat', 'main')
  })
})
