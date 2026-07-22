import { describe, it, expect, vi } from 'vitest'
import { i18next } from '@git-manager/i18n'
import type { GitRef } from '@git-manager/git-types'
import {
  buildBranchSubmenu,
  buildBranchSubmenus,
  buildCommitMenuSpec,
  buildMultiCommitMenuSpec,
  buildWipMenuSpec,
  buildStashMenuSpec,
  buildRefDropMenuSpec,
  buildTagMenuSpec,
  isMainBranchName,
  type BranchMenuActions,
  type CommitMenuActions,
  type GraphCommitMenuContext,
  type WipMenuActions,
} from './graphContextMenus'
import { normalizeMenuSpec, type MenuSpecNode } from './nativeMenuSpec'

// vitest.setup.ts boots real i18n in English — builders receive `t`, so assert real visible copy.
const t = (key: string, opts?: Record<string, unknown>) => i18next.t(key, { ns: 'git', ...opts })

type ItemNode = Extract<MenuSpecNode, { kind: 'item' }>
type SubmenuNode = Extract<MenuSpecNode, { kind: 'submenu' }>

const items = (nodes: MenuSpecNode[]) => nodes.filter((n): n is ItemNode => n.kind === 'item')
const texts = (nodes: MenuSpecNode[]) => items(nodes).map((n) => n.text)
const item = (nodes: MenuSpecNode[], text: string) => items(nodes).find((n) => n.text === text)

function ref(overrides: Partial<GitRef> = {}): GitRef {
  return {
    name: `refs/heads/${overrides.shortName ?? 'x'}`,
    shortName: 'x',
    type: 'branch',
    commitOid: 'oid-1',
    ...overrides,
  }
}

function ctx(overrides: Partial<GraphCommitMenuContext> = {}): GraphCommitMenuContext {
  return {
    isSingle: true,
    targetCount: 1,
    isMergeCommit: false,
    refs: [],
    currentBranch: 'main',
    isDetached: false,
    currentBranchRef: null,
    ...overrides,
  }
}

const branchActions = (): BranchMenuActions => ({
  onPull: vi.fn(),
  onPush: vi.fn(),
  onFastForward: vi.fn(),
  onMergeInto: vi.fn(),
  onRebaseOntoBranch: vi.fn(),
  onCheckoutBranch: vi.fn(),
  onOpenWorktreeFrom: vi.fn(),
  onStartPr: vi.fn(),
  onRenameBranch: vi.fn(),
  onDeleteBranch: vi.fn(),
  onCopyBranchName: vi.fn(),
  onCopyBranchLink: vi.fn(),
  onPinToLeft: vi.fn(),
})

const commitActions = (): CommitMenuActions => ({
  onCheckout: vi.fn(),
  onCreateWorktree: vi.fn(),
  onCreateBranch: vi.fn(),
  onCherryPick: vi.fn(),
  onReset: vi.fn(),
  onRevert: vi.fn(),
  onCopySha: vi.fn(),
  onCopyLink: vi.fn(),
  onCreatePatch: vi.fn(),
  onCreateTag: vi.fn(),
  onCreateAnnotatedTag: vi.fn(),
  onCherryPickSelection: vi.fn(),
  onRebaseOntoCommit: vi.fn(),
  onCreatePatchSelection: vi.fn(),
  onCompareToWorkdir: vi.fn(),
})

function submenuFor(refArg: GitRef, context: GraphCommitMenuContext, actions = branchActions()) {
  const node = buildBranchSubmenu(refArg, context, actions, commitActions(), t) as SubmenuNode
  return { node, items: normalizeMenuSpec(node.items), actions }
}

describe('isMainBranchName', () => {
  it('recognizes local and remote main/master', () => {
    expect(isMainBranchName('main')).toBe(true)
    expect(isMainBranchName('master')).toBe(true)
    expect(isMainBranchName('origin/main')).toBe(true)
    expect(isMainBranchName('origin/master')).toBe(true)
    expect(isMainBranchName('feature/main-menu')).toBe(false)
    expect(isMainBranchName('maintenance')).toBe(false)
  })
})

describe('buildBranchSubmenu — current local branch', () => {
  it('offers enabled sync actions and no relationship, checkout, or delete', () => {
    const { items: nodes } = submenuFor(ref({ shortName: 'main' }), ctx({ currentBranch: 'main' }))
    const labels = texts(nodes)
    expect(item(nodes, 'Pull (fast-forward if possible)')?.enabled).toBe(true)
    expect(item(nodes, 'Push')?.enabled).toBe(true)
    expect(item(nodes, 'Set upstream')?.enabled).toBe(false)
    expect(labels.some((l) => l.startsWith('Merge '))).toBe(false)
    expect(labels.some((l) => l.startsWith('Checkout '))).toBe(false)
    expect(labels.some((l) => l.startsWith('Delete '))).toBe(false)
    expect(labels).toContain('Open worktree from main')
    expect(item(nodes, 'Explain branch changes (Preview)')?.enabled).toBe(false)
    expect(labels).toContain('Pin to left')
    expect(item(nodes, 'Solo')?.enabled).toBe(false)
  })
})

describe('buildBranchSubmenu — another local branch', () => {
  it('offers the relationship actions phrased against the current branch, plus delete', () => {
    const { items: nodes } = submenuFor(ref({ shortName: 'feat' }), ctx({ currentBranch: 'main' }))
    const labels = texts(nodes)
    expect(labels).toContain('Fast-forward main to feat')
    expect(labels).toContain('Merge feat into main')
    expect(labels).toContain('Rebase main onto feat')
    expect(labels).toContain('Open worktree from feat')
    expect(labels).toContain('Rename feat')
    expect(labels).toContain('Delete feat')
    expect(labels).toContain('Copy branch name')
    expect(labels).toContain('Copy commit sha')
    expect(labels).toContain('Copy link to this commit on remote: origin')
    expect(labels).toContain('Create patch from commit…')
    // Pull/push act on HEAD, so they stay visible but disabled on a non-current branch.
    expect(item(nodes, 'Pull (fast-forward if possible)')?.enabled).toBe(false)
    expect(item(nodes, 'Push')?.enabled).toBe(false)
    // Checkout and the branch web link belong to the remote variant only.
    expect(labels.some((l) => l.startsWith('Checkout '))).toBe(false)
    expect(labels.some((l) => l.startsWith('Copy link to branch'))).toBe(false)
  })

  it('drops the relationship actions when HEAD is detached', () => {
    const { items: nodes } = submenuFor(
      ref({ shortName: 'feat' }),
      ctx({ currentBranch: null, isDetached: true })
    )
    expect(texts(nodes).some((l) => l.startsWith('Merge '))).toBe(false)
    expect(texts(nodes)).toContain('Open worktree from feat')
  })

  it('wires each item to its action with the branch ref', () => {
    const target = ref({ shortName: 'feat' })
    const { items: nodes, actions } = submenuFor(target, ctx({ currentBranch: 'main' }))
    for (const it of items(nodes)) it.action?.()
    expect(actions.onMergeInto).toHaveBeenCalledWith(target)
    expect(actions.onDeleteBranch).toHaveBeenCalledWith(target)
    expect(actions.onCopyBranchName).toHaveBeenCalledWith(target)
    expect(actions.onOpenWorktreeFrom).toHaveBeenCalledWith(target)
    expect(actions.onPinToLeft).toHaveBeenCalledWith(target)
  })
})

describe('buildBranchSubmenu — remote branch', () => {
  const origin = () => ref({ shortName: 'origin/main', type: 'remote', name: 'refs/remotes/origin/main' })

  it('offers relationship, checkout, worktree, PR, link-to-branch — and no sync section', () => {
    const { items: nodes } = submenuFor(origin(), ctx({ currentBranch: 'feat' }))
    const labels = texts(nodes)
    expect(labels).toContain('Fast-forward feat to origin/main')
    expect(labels).toContain('Merge origin/main into feat')
    expect(labels).toContain('Rebase feat onto origin/main')
    expect(labels).toContain('Checkout origin/main')
    expect(labels).toContain('Open worktree from origin/main')
    expect(labels).toContain('Push feat and start a pull request to origin/main')
    expect(labels).toContain('Copy link to branch: origin/main')
    expect(labels).not.toContain('Pull (fast-forward if possible)')
    expect(labels).not.toContain('Push')
    expect(labels).not.toContain('Set upstream')
  })

  it('shows Delete but disabled — remote deletion has no confirm flow yet', () => {
    const { items: nodes } = submenuFor(origin(), ctx({ currentBranch: 'feat' }))
    expect(item(nodes, 'Delete origin/main')?.enabled).toBe(false)
  })

  it('omits the PR entry when HEAD is detached', () => {
    const { items: nodes } = submenuFor(origin(), ctx({ currentBranch: null, isDetached: true }))
    expect(texts(nodes).some((l) => l.includes('pull request'))).toBe(false)
  })
})

describe('buildBranchSubmenus', () => {
  it('creates a submenu per branch/remote ref and skips tags, stashes and HEAD', () => {
    const spec = buildBranchSubmenus(
      ctx({
        refs: [
          ref({ shortName: 'feat' }),
          ref({ shortName: 'origin/feat', type: 'remote' }),
          ref({ shortName: 'v1.0', type: 'tag' }),
          ref({ shortName: 'HEAD', type: 'HEAD' }),
          ref({ shortName: 'stash@{0}', type: 'stash' }),
        ],
      }),
      branchActions(),
      commitActions(),
      t
    )
    const nodes = normalizeMenuSpec(spec)
    expect(nodes.map((n) => (n as SubmenuNode).text)).toEqual(['feat', 'origin/feat'])
  })

  it('returns nothing for a multi-selection', () => {
    const spec = buildBranchSubmenus(
      ctx({ isSingle: false, targetCount: 2, refs: [ref({ shortName: 'feat' })] }),
      branchActions(),
      commitActions(),
      t
    )
    expect(spec).toEqual([])
  })
})

describe('buildWipMenuSpec', () => {
  const wipActions = (): WipMenuActions => ({
    onStash: vi.fn(),
    onStageAll: vi.fn(),
    onUnstageAll: vi.fn(),
  })

  it('lists the stash and stage/unstage actions', () => {
    const spec = normalizeMenuSpec(
      buildWipMenuSpec({ hasStaged: true, hasUnstaged: true }, wipActions(), t)
    )
    expect(texts(spec)).toEqual([
      'Stash changes',
      'Stash changes (include untracked)',
      'Stage all changes',
      'Unstage all changes',
      'Explain working changes (Preview)',
    ])
  })

  it('ships the "Explain working changes" item disabled (placeholder)', () => {
    const spec = normalizeMenuSpec(
      buildWipMenuSpec({ hasStaged: true, hasUnstaged: true }, wipActions(), t)
    )
    expect(item(spec, 'Explain working changes (Preview)')?.enabled).toBe(false)
  })

  it('enables stage/unstage from the working state', () => {
    const spec = normalizeMenuSpec(
      buildWipMenuSpec({ hasStaged: false, hasUnstaged: true }, wipActions(), t)
    )
    expect(item(spec, 'Stage all changes')?.enabled).toBe(true)
    expect(item(spec, 'Unstage all changes')?.enabled).toBe(false)
  })

  it('wires the stash items with and without untracked files', () => {
    const actions = wipActions()
    const spec = normalizeMenuSpec(
      buildWipMenuSpec({ hasStaged: true, hasUnstaged: true }, actions, t)
    )
    item(spec, 'Stash changes')?.action?.()
    expect(actions.onStash).toHaveBeenLastCalledWith(false)
    item(spec, 'Stash changes (include untracked)')?.action?.()
    expect(actions.onStash).toHaveBeenLastCalledWith(true)
  })
})

describe('buildStashMenuSpec', () => {
  const stashActions = () => ({
    onApply: vi.fn(),
    onPop: vi.fn(),
    onDelete: vi.fn(),
    onEditMessage: vi.fn(),
    onToggleVisibility: vi.fn(),
  })

  it('lists apply/pop/delete then edit + the visibility toggle', () => {
    const spec = normalizeMenuSpec(buildStashMenuSpec({ isHidden: false }, stashActions(), t))
    expect(texts(spec)).toEqual([
      'Apply stash',
      'Pop stash',
      'Delete stash',
      'Edit stash message',
      'Hide the stash',
    ])
  })

  it('labels the toggle "Show the stash" when hidden', () => {
    const spec = normalizeMenuSpec(buildStashMenuSpec({ isHidden: true }, stashActions(), t))
    expect(texts(spec)).toContain('Show the stash')
    expect(texts(spec)).not.toContain('Hide the stash')
  })

  it('wires each action', () => {
    const actions = stashActions()
    const spec = normalizeMenuSpec(buildStashMenuSpec({ isHidden: false }, actions, t))
    item(spec, 'Apply stash')?.action?.()
    item(spec, 'Delete stash')?.action?.()
    expect(actions.onApply).toHaveBeenCalledOnce()
    expect(actions.onDelete).toHaveBeenCalledOnce()
  })
})

describe('buildRefDropMenuSpec', () => {
  const dropActions = () => ({
    onFastForward: vi.fn(),
    onMerge: vi.fn(),
    onRebase: vi.fn(),
    onInteractiveRebase: vi.fn(),
    onPush: vi.fn(),
    onReset: vi.fn(),
    onStartPr: vi.fn(),
  })
  const dropCtx = { params: { source: 'feat', target: 'main', remote: 'origin' } }

  it('enables target-moving actions only when the target is a local branch', () => {
    const spec = normalizeMenuSpec(
      buildRefDropMenuSpec({ ...dropCtx, targetIsBranch: false, sourceIsBranch: true, prEnabled: true }, dropActions(), t)
    )
    expect(item(spec, 'Fast-forward main to feat')?.enabled).toBe(false)
    expect(item(spec, 'Merge feat into main')?.enabled).toBe(false)
    expect(item(spec, 'Rebase feat onto main')?.enabled).toBe(true)
  })

  it('wires push and the reset submenu', () => {
    const actions = dropActions()
    const spec = normalizeMenuSpec(
      buildRefDropMenuSpec({ ...dropCtx, targetIsBranch: true, sourceIsBranch: true, prEnabled: true }, actions, t)
    )
    item(spec, 'Push feat to origin/main')?.action?.()
    expect(actions.onPush).toHaveBeenCalledOnce()
    const reset = spec.find((n): n is SubmenuNode => n.kind === 'submenu' && n.text.startsWith('Reset feat'))
    item(normalizeMenuSpec(reset!.items), 'Hard')?.action?.()
    expect(actions.onReset).toHaveBeenCalledWith('hard')
  })
})

describe('buildTagMenuSpec', () => {
  const tagActions = () => ({
    onMerge: vi.fn(),
    onRebase: vi.fn(),
    onInteractiveRebase: vi.fn(),
    onCheckout: vi.fn(),
    onCreateWorktree: vi.fn(),
    onCreateBranch: vi.fn(),
    onCherryPick: vi.fn(),
    onReset: vi.fn(),
    onRevert: vi.fn(),
    onDeleteLocal: vi.fn(),
    onDeleteRemote: vi.fn(),
    onCopyName: vi.fn(),
    onCopyLink: vi.fn(),
    onAnnotate: vi.fn(),
  })
  const tagCtx = (relationEnabled: boolean) => ({
    params: { tag: 'v1.0', branch: 'main', remote: 'origin' },
    relationEnabled,
  })

  it('disables the relationship actions when detached (relationEnabled false)', () => {
    const spec = normalizeMenuSpec(buildTagMenuSpec(tagCtx(false), tagActions(), t))
    expect(item(spec, 'Merge v1.0 into main')?.enabled).toBe(false)
    expect(item(spec, 'Delete v1.0 locally')?.enabled).not.toBe(false) // tag deletion always on
  })

  it('lists tag-specific delete/copy/annotate and wires them', () => {
    const actions = tagActions()
    const spec = normalizeMenuSpec(buildTagMenuSpec(tagCtx(true), actions, t))
    const labels = texts(spec)
    expect(labels).toContain('Delete v1.0 locally')
    expect(labels).toContain('Delete v1.0 from origin')
    expect(labels).toContain('Copy tag name')
    expect(labels).toContain('Annotate v1.0')
    item(spec, 'Annotate v1.0')?.action?.()
    expect(actions.onAnnotate).toHaveBeenCalledOnce()
  })
})

describe('buildCommitMenuSpec', () => {
  const build = (context: GraphCommitMenuContext) =>
    normalizeMenuSpec(buildCommitMenuSpec(context, commitActions(), branchActions(), t))

  const layoutOf = (spec: MenuSpecNode[]) =>
    spec.map((n) =>
      n.kind === 'item' ? n.text : n.kind === 'submenu' ? `▸ ${n.text}` : `— ${n.kind}`
    )

  it('lays out the multi-branch commit menu with one submenu per branch', () => {
    const spec = build(
      ctx({ refs: [ref({ shortName: 'feat' }), ref({ shortName: 'dev' })] })
    )
    expect(layoutOf(spec)).toEqual([
      'Checkout this commit',
      '— separator',
      'Create worktree from this commit…',
      '— separator',
      'Create branch here',
      'Cherry-pick this commit',
      '▸ Reset main to this commit',
      'Revert this commit',
      '— separator',
      '▸ feat',
      '▸ dev',
      '— separator',
      'Create tag here',
      'Create annotated tag here…',
    ])
  })

  it('flattens a single branch inline into the commit menu (no submenu)', () => {
    const spec = build(ctx({ refs: [ref({ shortName: 'feat' })], currentBranch: 'main' }))
    expect(layoutOf(spec)).toEqual([
      'Pull (fast-forward if possible)',
      'Push',
      'Set upstream',
      '— separator',
      'Fast-forward main to feat',
      'Merge feat into main',
      'Rebase main onto feat',
      '— separator',
      'Open worktree from feat',
      'Checkout this commit',
      '— separator',
      'Create worktree from this commit…',
      '— separator',
      'Create branch here',
      'Cherry-pick this commit',
      '▸ Reset main to this commit',
      'Revert this commit',
      '— separator',
      'Explain branch changes (Preview)',
      '— separator',
      'Rename feat',
      'Delete feat',
      '— separator',
      'Copy branch name',
      'Copy commit sha',
      'Copy link to this commit on remote: origin',
      'Create patch from commit…',
      '— separator',
      'Pin to left',
      'Solo',
      '— separator',
      'Create tag here',
      'Create annotated tag here…',
    ])
  })

  it('flat layout on the current branch keeps sync enabled and drops relationship/delete', () => {
    const spec = build(ctx({ refs: [ref({ shortName: 'main' })], currentBranch: 'main' }))
    const labels = texts(spec)
    expect(item(spec, 'Pull (fast-forward if possible)')?.enabled).toBe(true)
    expect(labels.some((l) => l.startsWith('Merge '))).toBe(false)
    expect(labels.some((l) => l.startsWith('Delete '))).toBe(false)
    expect(labels).toContain('Rename main')
  })

  it('flat layout on a single remote branch offers PR/link entries and a disabled Delete', () => {
    const spec = build(
      ctx({
        refs: [ref({ shortName: 'origin/main', type: 'remote' })],
        currentBranch: 'feat',
      })
    )
    const labels = texts(spec)
    expect(labels).toContain('Push feat and start a pull request to origin/main')
    expect(labels).toContain('Copy link to branch: origin/main')
    expect(labels).not.toContain('Rename origin/main')
    expect(item(spec, 'Delete origin/main')?.enabled).toBe(false)
  })

  it('flattens a pushed branch tip (local + its remote tracking) with the local branch', () => {
    // A pushed branch tip carries BOTH `main` and `origin/main`; they share a logical name, so the
    // menu must flatten (no submenus) using the local ref — not treat it as a two-branch commit.
    const spec = build(
      ctx({
        refs: [
          ref({ shortName: 'main', type: 'branch' }),
          ref({ shortName: 'origin/main', type: 'remote' }),
        ],
        currentBranch: 'feat',
      })
    )
    expect(spec.some((n) => n.kind === 'submenu' && !n.text.startsWith('Reset '))).toBe(false)
    const labels = texts(spec)
    // Local-branch flat menu: sync + rename + a real (enabled) delete on a non-current branch.
    expect(labels).toContain('Pull (fast-forward if possible)')
    expect(labels).toContain('Rename main')
    expect(item(spec, 'Delete main')?.enabled).toBe(true)
  })

  it('gives the local main/master a "Copy link to branch" pointing at its remote counterpart', () => {
    // The main-specific extra: local `main` exposes "Copy link to branch: origin/main" (using the
    // tracking ref on the commit), which a plain feature branch does not.
    const withTracking = build(
      ctx({
        refs: [
          ref({ shortName: 'main', type: 'branch' }),
          ref({ shortName: 'origin/main', type: 'remote' }),
        ],
        currentBranch: 'feat',
      })
    )
    expect(texts(withTracking)).toContain('Copy link to branch: origin/main')

    // Even without the tracking ref on the commit, main falls back to `origin/<name>`.
    const bareMain = build(ctx({ refs: [ref({ shortName: 'master' })], currentBranch: 'feat' }))
    expect(texts(bareMain)).toContain('Copy link to branch: origin/master')

    // A plain local feature branch gets no branch link.
    const feat = build(ctx({ refs: [ref({ shortName: 'feat' })], currentBranch: 'main' }))
    expect(texts(feat).some((l) => l.startsWith('Copy link to branch'))).toBe(false)
  })

  it('keeps submenus when two DIFFERENT logical branches sit on the commit', () => {
    const spec = build(
      ctx({
        refs: [
          ref({ shortName: 'main', type: 'branch' }),
          ref({ shortName: 'origin/feature', type: 'remote' }),
        ],
      })
    )
    const submenus = spec.filter(
      (n): n is SubmenuNode => n.kind === 'submenu' && !n.text.startsWith('Reset ')
    )
    expect(submenus.map((n) => n.text)).toEqual(['main', 'origin/feature'])
  })

  it('describes each reset mode in the reset submenu', () => {
    const spec = build(ctx())
    const reset = spec.find(
      (n): n is SubmenuNode => n.kind === 'submenu' && n.text.startsWith('Reset ')
    )
    expect(reset).toBeDefined()
    expect(texts(normalizeMenuSpec(reset!.items))).toEqual([
      'Soft - keep all changes',
      'Mixed - keep working copy but reset index',
      'Hard - discard all changes',
    ])
  })

  it('surfaces the copy/patch actions at top level for a label-less commit with no current branch (detached)', () => {
    const spec = build(ctx({ refs: [], currentBranch: null, isDetached: true }))
    const labels = texts(spec)
    expect(labels).toContain('Copy SHA')
    expect(labels).toContain('Copy link to this commit on remote: origin')
    expect(labels).toContain('Create patch from commit…')
  })

  it('flattens to the CURRENT branch on a label-less commit that sits on it (non-tip commit)', () => {
    // 833e3a2b-style case: a plain history commit carries no ref, but it is on the current branch,
    // so the flat menu appears keyed to the current branch (relative to HEAD), not the bare menu.
    const spec = build(
      ctx({
        refs: [],
        currentBranch: 'main',
        currentBranchRef: ref({ shortName: 'main', type: 'branch', commitOid: 'tip-oid' }),
      })
    )
    const labels = texts(spec)
    // No submenu — flat — and the current-branch actions are present.
    expect(spec.some((n) => n.kind === 'submenu' && !n.text.startsWith('Reset '))).toBe(false)
    expect(labels).toContain('Pull (fast-forward if possible)')
    expect(labels).toContain('Rename main')
    expect(labels).toContain('Pin to left')
    // It's the current branch → no relationship section and no delete.
    expect(labels.some((l) => l.startsWith('Merge '))).toBe(false)
    expect(labels.some((l) => l.startsWith('Delete '))).toBe(false)
    // Commit-scoped items stay too.
    expect(labels).toContain('Cherry-pick this commit')
    expect(labels).toContain('Create tag here')
  })

  it('nests the copy/patch actions inside each branch submenu when several branches exist', () => {
    const spec = build(ctx({ refs: [ref({ shortName: 'feat' }), ref({ shortName: 'dev' })] }))
    expect(texts(spec)).not.toContain('Copy SHA')
    const feat = spec.find((n): n is SubmenuNode => n.kind === 'submenu' && n.text === 'feat')
    expect(texts(normalizeMenuSpec(feat!.items))).toContain('Copy commit sha')
  })

  it('renders the dedicated multi-selection layout in order', () => {
    const spec = build(ctx({ isSingle: false, targetCount: 3, currentBranch: 'main' }))
    expect(layoutOf(spec)).toEqual([
      'Checkout this commit',
      '— separator',
      'Create worktree from this commit…',
      '— separator',
      'Create branch here',
      'Cherry-pick 3 commits',
      'Rebase main onto this commit',
      '▸ Reset main to this commit',
      'Revert this commit',
      '— separator',
      'Copy SHA',
      'Copy link to this commit on remote: origin',
      'Create patch from commits…',
      '— separator',
      'Compare commit against working directory',
      '— separator',
      'Create tag here',
      'Create annotated tag here…',
    ])
  })

  it('wires the multi-selection actions', () => {
    const actions = commitActions()
    const spec = normalizeMenuSpec(
      buildMultiCommitMenuSpec(ctx({ isSingle: false, targetCount: 2 }), actions, t)
    )
    item(spec, 'Cherry-pick 2 commits')?.action?.()
    expect(actions.onCherryPickSelection).toHaveBeenCalledOnce()
    item(spec, 'Rebase main onto this commit')?.action?.()
    expect(actions.onRebaseOntoCommit).toHaveBeenCalledOnce()
    item(spec, 'Create patch from commits…')?.action?.()
    expect(actions.onCreatePatchSelection).toHaveBeenCalledOnce()
    item(spec, 'Compare commit against working directory')?.action?.()
    expect(actions.onCompareToWorkdir).toHaveBeenCalledOnce()
  })
})
