import { describe, it, expect, vi } from 'vitest'
import { i18next } from '@git-manager/i18n'
import type { GitRef } from '@git-manager/git-types'
import {
  buildBranchSubmenu,
  buildBranchSubmenus,
  buildCommitMenuSpec,
  buildMultiCommitMenuSpec,
  buildWipMenuSpec,
  buildOtherWorktreeMenuSpec,
  buildStashMenuSpec,
  buildConflictMenuSpec,
  buildRefDropMenuSpec,
  buildTagMenuSpec,
  buildSidebarBranchMenuSpec,
  isMainBranchName,
  type BranchMenuActions,
  type CommitMenuActions,
  type ConflictMenuActions,
  type GraphCommitMenuContext,
  type OtherWorktreeMenuActions,
  type SidebarBranchMenuContext,
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
    aiEnabled: true,
    primaryShortOid: 'abc1234',
    descendantCount: 0,
    isOnProtectedBranch: false,
    ...overrides,
  }
}

const branchActions = (): BranchMenuActions => ({
  onPull: vi.fn(),
  onPush: vi.fn(),
  onSetUpstream: vi.fn(),
  onFastForward: vi.fn(),
  onMergeInto: vi.fn(),
  onRebaseOntoBranch: vi.fn(),
  onCheckoutBranch: vi.fn(),
  onOpenWorktreeFrom: vi.fn(),
  onStartPr: vi.fn(),
  onExplainBranch: vi.fn(),
  onReviewBranch: vi.fn(),
  onRenameBranch: vi.fn(),
  onDeleteBranch: vi.fn(),
  onCopyBranchName: vi.fn(),
  onCopyBranchLink: vi.fn(),
  onPinToLeft: vi.fn(),
  onSolo: vi.fn(),
})

const commitActions = (): CommitMenuActions => ({
  onCheckout: vi.fn(),
  onCreateWorktree: vi.fn(),
  onCreateBranch: vi.fn(),
  onRecomposeCommit: vi.fn(),
  onCherryPick: vi.fn(),
  onReset: vi.fn(),
  onRevert: vi.fn(),
  onCopySha: vi.fn(),
  onCopyLink: vi.fn(),
  onCreatePatch: vi.fn(),
  onCreateTag: vi.fn(),
  onCreateAnnotatedTag: vi.fn(),
  onExplainCommit: vi.fn(),
  onCherryPickSelection: vi.fn(),
  onRebaseOntoCommit: vi.fn(),
  onCreatePatchSelection: vi.fn(),
  onCompareToWorkdir: vi.fn(),
})

/** A branch submenu is only ever built for a ref that sits on the clicked commit (see
 * `buildBranchSubmenus`), so the harness puts it in `ctx.refs` unless a test says otherwise —
 * matching reality, which some rules now depend on. */
function submenuFor(refArg: GitRef, context: GraphCommitMenuContext, actions = branchActions()) {
  const ctxWithRef =
    context.refs.length > 0 ? context : { ...context, refs: [refArg] }
  const node = buildBranchSubmenu(refArg, ctxWithRef, actions, commitActions(), t) as SubmenuNode
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
    expect(item(nodes, 'Set upstream')?.enabled).not.toBe(false)
    expect(labels.some((l) => l.startsWith('Merge '))).toBe(false)
    expect(labels.some((l) => l.startsWith('Checkout '))).toBe(false)
    expect(labels.some((l) => l.startsWith('Delete '))).toBe(false)
    expect(labels).toContain('Open worktree from main')
    expect(item(nodes, 'Explain branch changes (LLM)')?.enabled).toBe(true)
    expect(labels).toContain('Pin to left')
    expect(item(nodes, 'Solo')?.enabled).not.toBe(false)
  })
})

describe('buildBranchSubmenu — explain branch changes', () => {
  it('calls onExplainBranch with the branch it belongs to', () => {
    const branchRef = ref({ shortName: 'feat' })
    const { items: nodes, actions } = submenuFor(branchRef, ctx({ currentBranch: 'main' }))
    item(nodes, 'Explain branch changes (LLM)')?.action?.()
    expect(actions.onExplainBranch).toHaveBeenCalledWith(branchRef)
  })

  it('is disabled — but still listed — when AI is switched off', () => {
    const { items: nodes } = submenuFor(ref({ shortName: 'feat' }), ctx({ aiEnabled: false }))
    expect(item(nodes, 'Explain branch changes (LLM)')?.enabled).toBe(false)
  })
})

describe('buildBranchSubmenu — review branch changes', () => {
  it('calls onReviewBranch with the branch it belongs to', () => {
    const branchRef = ref({ shortName: 'feat' })
    const { items: nodes, actions } = submenuFor(branchRef, ctx({ currentBranch: 'main' }))
    item(nodes, 'Review branch changes (LLM)')?.action?.()
    expect(actions.onReviewBranch).toHaveBeenCalledWith(branchRef)
  })

  it('is disabled — but still listed — when AI is switched off', () => {
    const { items: nodes } = submenuFor(ref({ shortName: 'feat' }), ctx({ aiEnabled: false }))
    expect(item(nodes, 'Review branch changes (LLM)')?.enabled).toBe(false)
  })

  it('sits right after the explanation, so the two read as one pair', () => {
    const { items: nodes } = submenuFor(ref({ shortName: 'feat' }), ctx({ currentBranch: 'main' }))
    const labels = texts(nodes)
    expect(labels.indexOf('Review branch changes (LLM)')).toBe(
      labels.indexOf('Explain branch changes (LLM)') + 1
    )
  })
})

describe('buildCommitMenuSpec — explain this commit', () => {
  it('is offered on a single commit and calls the commit-scoped action', () => {
    const actions = commitActions()
    const spec = normalizeMenuSpec(
      buildCommitMenuSpec(ctx({ currentBranch: 'main' }), actions, branchActions(), t)
    )
    item(spec, 'Explain this commit (LLM)')?.action?.()
    expect(actions.onExplainCommit).toHaveBeenCalled()
  })

  it('is disabled when AI is switched off', () => {
    const spec = normalizeMenuSpec(
      buildCommitMenuSpec(ctx({ aiEnabled: false }), commitActions(), branchActions(), t)
    )
    expect(item(spec, 'Explain this commit (LLM)')?.enabled).toBe(false)
  })

  it('is absent from the multi-selection layout, where "this commit" is ambiguous', () => {
    const spec = normalizeMenuSpec(
      buildCommitMenuSpec(
        ctx({ isSingle: false, targetCount: 3 }),
        commitActions(),
        branchActions(),
        t
      )
    )
    expect(texts(spec)).not.toContain('Explain this commit (LLM)')
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

  it('shows "Copy link to branch" when this non-main branch has a remote-tracking ref on the commit', () => {
    const { items: nodes } = submenuFor(
      ref({ shortName: 'feat' }),
      ctx({
        currentBranch: 'main',
        refs: [ref({ shortName: 'feat' }), ref({ shortName: 'origin/feat', type: 'remote' })],
      })
    )
    expect(texts(nodes)).toContain('Copy link to branch: origin/feat')
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
    expect(actions.onSolo).toHaveBeenCalledWith(target)
  })

  it('Set upstream is enabled and calls onSetUpstream with the branch ref', () => {
    const target = ref({ shortName: 'feat' })
    const { items: nodes, actions } = submenuFor(target, ctx({ currentBranch: 'main' }))
    const setUpstream = item(nodes, 'Set upstream')
    expect(setUpstream?.enabled).not.toBe(false)
    setUpstream?.action?.()
    expect(actions.onSetUpstream).toHaveBeenCalledWith(target)
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

describe('buildSidebarBranchMenuSpec — remote branch', () => {
  const origin = () =>
    ref({ shortName: 'origin/main', type: 'remote', name: 'refs/remotes/origin/main' })

  function menu(overrides: Partial<SidebarBranchMenuContext> = {}) {
    const actions = { ...branchActions(), onToggleVisibility: vi.fn() }
    const commits = commitActions()
    const context = { ...ctx({ currentBranch: 'feat' }), isHidden: false, ...overrides }
    const nodes = normalizeMenuSpec(
      buildSidebarBranchMenuSpec(origin(), { ...context, refs: [origin()] }, actions, commits, t)
    )
    return { nodes, actions, commits }
  }

  // The sidebar row is the one place the commit-scoped actions have an unambiguous target, so the
  // whole ordered list is asserted rather than a handful of entries.
  it('lists the branch, commit and row actions in order', () => {
    expect(texts(menu().nodes)).toEqual([
      'Fast-forward feat to origin/main',
      'Merge origin/main into feat',
      'Rebase feat onto origin/main',
      'Checkout origin/main',
      'Open worktree from origin/main',
      'Create branch here',
      'Cherry-pick this commit',
      'Revert this commit',
      'Push feat and start a pull request to origin/main',
      'Explain branch changes (LLM)',
      'Delete origin/main',
      'Copy branch name',
      'Copy commit sha',
      'Copy link to branch: origin/main',
      'Copy link to this commit on remote: origin',
      'Hide the branch',
      'Pin to left',
      'Solo',
      'Compare commit against working directory',
      'Create tag here',
      'Create annotated tag here…',
    ])
  })

  it('offers the three reset modes under one submenu, named after the current branch', () => {
    const { nodes, commits } = menu()
    const reset = nodes.find(
      (n): n is SubmenuNode => n.kind === 'submenu' && n.text === 'Reset feat to this commit'
    )!
    const modes = normalizeMenuSpec(reset.items)
    expect(texts(modes)).toHaveLength(3)
    items(modes)[2].action?.()
    expect(commits.onReset).toHaveBeenCalledWith('hard')
  })

  it('flips the Hide entry once the branch is hidden', () => {
    const { nodes, actions } = menu({ isHidden: true })
    expect(texts(nodes)).toContain('Show the branch')
    expect(texts(nodes)).not.toContain('Hide the branch')
    item(nodes, 'Show the branch')?.action?.()
    expect(actions.onToggleVisibility).toHaveBeenCalledWith(
      expect.objectContaining({ shortName: 'origin/main' })
    )
  })

  // Same rules as everywhere else: they are the shared sections, not a second copy of them.
  it('keeps the shared gates — no sync section, Delete disabled, no PR on a detached HEAD', () => {
    const { nodes } = menu()
    expect(texts(nodes)).not.toContain('Push')
    expect(item(nodes, 'Delete origin/main')?.enabled).toBe(false)

    const detached = menu({ currentBranch: null, isDetached: true })
    expect(texts(detached.nodes).some((l) => l.includes('pull request'))).toBe(false)
    // Nothing to fast-forward/merge/rebase against either.
    expect(texts(detached.nodes).some((l) => l.startsWith('Fast-forward'))).toBe(false)
  })

  it('disables the explanation when AI is off, leaving it discoverable', () => {
    const { nodes } = menu({ aiEnabled: false })
    expect(item(nodes, 'Explain branch changes (LLM)')?.enabled).toBe(false)
  })

  it('routes the commit-scoped entries to the branch tip actions', () => {
    const { nodes, commits } = menu()
    item(nodes, 'Create branch here')?.action?.()
    item(nodes, 'Cherry-pick this commit')?.action?.()
    item(nodes, 'Revert this commit')?.action?.()
    item(nodes, 'Compare commit against working directory')?.action?.()
    item(nodes, 'Create tag here')?.action?.()
    expect(commits.onCreateBranch).toHaveBeenCalled()
    expect(commits.onCherryPick).toHaveBeenCalled()
    expect(commits.onRevert).toHaveBeenCalled()
    expect(commits.onCompareToWorkdir).toHaveBeenCalled()
    expect(commits.onCreateTag).toHaveBeenCalled()
  })
})

describe('buildSidebarBranchMenuSpec — local branch', () => {
  const feat = () => ref({ shortName: 'feat/login', name: 'refs/heads/feat/login' })

  function menu(overrides: Partial<SidebarBranchMenuContext> = {}) {
    const actions = { ...branchActions(), onToggleVisibility: vi.fn() }
    const commits = commitActions()
    const context = { ...ctx({ currentBranch: 'main' }), isHidden: false, ...overrides }
    const nodes = normalizeMenuSpec(
      buildSidebarBranchMenuSpec(feat(), { ...context, refs: [feat()] }, actions, commits, t)
    )
    return { nodes, actions, commits }
  }

  // The same menu as a remote row's, told apart only by what the ref's own type allows.
  it('lists the branch, commit and row actions in order', () => {
    expect(texts(menu().nodes)).toEqual([
      'Set upstream',
      'Fast-forward main to feat/login',
      'Merge feat/login into main',
      'Rebase main onto feat/login',
      'Checkout feat/login',
      'Open worktree from feat/login',
      'Create branch here',
      'Cherry-pick this commit',
      'Revert this commit',
      'Push main and start a pull request to feat/login',
      'Explain branch changes (LLM)',
      'Rename feat/login',
      'Delete feat/login',
      'Copy branch name',
      'Copy commit sha',
      'Copy link to this commit on remote: origin',
      'Hide the branch',
      'Pin to left',
      'Solo',
      'Create tag here',
      'Create annotated tag here…',
    ])
  })

  // Pull and Push act on HEAD, not on the row: they belong to the toolbar, not to a branch's menu.
  // Set upstream is different — it writes metadata on the row's own branch, so it stays.
  it('drops pull/push but keeps Set upstream, which acts on the row itself', () => {
    const labels = texts(menu().nodes)
    expect(labels).not.toContain('Pull (fast-forward if possible)')
    expect(labels).not.toContain('Push')
    expect(labels).toContain('Set upstream')
  })

  it('really deletes a local branch, unlike the disabled remote entry', () => {
    const { nodes, actions } = menu()
    expect(item(nodes, 'Delete feat/login')?.enabled).not.toBe(false)
    item(nodes, 'Delete feat/login')?.action?.()
    expect(actions.onDeleteBranch).toHaveBeenCalled()
  })

  // Nothing to switch to, nothing to merge into itself, no pull request to open against itself.
  it('drops checkout, the relationship actions and the PR entry on the current branch', () => {
    const current = normalizeMenuSpec(
      buildSidebarBranchMenuSpec(
        ref({ shortName: 'main' }),
        { ...ctx({ currentBranch: 'main', refs: [ref({ shortName: 'main' })] }), isHidden: false },
        { ...branchActions(), onToggleVisibility: vi.fn() },
        commitActions(),
        t
      )
    )
    const labels = texts(current)
    expect(labels.some((l) => l.startsWith('Checkout '))).toBe(false)
    expect(labels.some((l) => l.startsWith('Fast-forward '))).toBe(false)
    expect(labels.some((l) => l.includes('pull request'))).toBe(false)
    expect(labels.some((l) => l.startsWith('Delete '))).toBe(false)
  })

  it('flips the Hide entry once the branch is hidden', () => {
    const { nodes, actions } = menu({ isHidden: true })
    expect(texts(nodes)).toContain('Show the branch')
    item(nodes, 'Show the branch')?.action?.()
    expect(actions.onToggleVisibility).toHaveBeenCalledWith(
      expect.objectContaining({ shortName: 'feat/login' })
    )
  })

  it('shows "Copy link to branch" once this branch has a remote-tracking ref on the commit', () => {
    // Unlike `menu()`, which always scopes `refs` to just the row's own ref, this needs the actual
    // remote-tracking ref on the commit too, so it builds the spec directly.
    const origin = ref({ shortName: 'origin/feat/login', type: 'remote' })
    const nodes = normalizeMenuSpec(
      buildSidebarBranchMenuSpec(
        feat(),
        { ...ctx({ currentBranch: 'main', refs: [feat(), origin] }), isHidden: false },
        { ...branchActions(), onToggleVisibility: vi.fn() },
        commitActions(),
        t
      )
    )
    expect(texts(nodes)).toContain('Copy link to branch: origin/feat/login')
  })
})

describe('buildSidebarBranchMenuSpec — the trunk', () => {
  function trunkMenu(shortName = 'main', overrides: Partial<SidebarBranchMenuContext> = {}) {
    const branchRef = ref({ shortName, name: `refs/heads/${shortName}` })
    const context = { ...ctx({ currentBranch: 'feat' }), isHidden: false, ...overrides }
    return normalizeMenuSpec(
      buildSidebarBranchMenuSpec(
        branchRef,
        { ...context, refs: [branchRef] },
        { ...branchActions(), onToggleVisibility: vi.fn() },
        commitActions(),
        t
      )
    )
  }

  it('lists the branch, commit and row actions in order', () => {
    expect(texts(trunkMenu())).toEqual([
      'Pull (fast-forward if possible)',
      'Push',
      'Set upstream',
      'Fast-forward feat to main',
      'Merge main into feat',
      'Rebase feat onto main',
      'Checkout main',
      'Open worktree from main',
      'Create branch here',
      'Cherry-pick this commit',
      'Revert this commit',
      'Explain branch changes (LLM)',
      'Rename main',
      'Delete main',
      'Copy branch name',
      'Copy commit sha',
      'Copy link to branch: origin/main',
      'Copy link to this commit on remote: origin',
      'Hide the branch',
      'Pin to left',
      'Solo',
      'Create tag here',
      'Create annotated tag here…',
    ])
  })

  // Pull and push act on HEAD, so they read as the trunk's own actions and stay off every other
  // row; `master` is the trunk under its other name.
  it('offers the sync section on master too, and on no other local branch', () => {
    expect(texts(trunkMenu('master'))).toContain('Pull (fast-forward if possible)')
    expect(texts(trunkMenu('feat/login'))).not.toContain('Pull (fast-forward if possible)')
  })

  // A pull request targets the trunk, it is not opened from it.
  it('offers no pull request entry on the trunk, unlike any other branch', () => {
    expect(texts(trunkMenu()).some((l) => l.includes('pull request'))).toBe(false)
    expect(texts(trunkMenu('feat/login')).some((l) => l.includes('pull request'))).toBe(true)
  })

  it('keeps the sync section off a remote trunk, which HEAD cannot pull or push', () => {
    const originMain = ref({
      shortName: 'origin/main',
      type: 'remote',
      name: 'refs/remotes/origin/main',
    })
    const nodes = normalizeMenuSpec(
      buildSidebarBranchMenuSpec(
        originMain,
        { ...ctx({ currentBranch: 'feat', refs: [originMain] }), isHidden: false },
        { ...branchActions(), onToggleVisibility: vi.fn() },
        commitActions(),
        t
      )
    )
    expect(texts(nodes)).not.toContain('Pull (fast-forward if possible)')
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
    onExplainChanges: vi.fn(),
    onReviewChanges: vi.fn(),
  })

  const wipCtx = (overrides: Partial<Parameters<typeof buildWipMenuSpec>[0]> = {}) => ({
    hasStaged: true,
    hasUnstaged: true,
    aiEnabled: true,
    ...overrides,
  })

  it('lists the stash and stage/unstage actions', () => {
    const spec = normalizeMenuSpec(
      buildWipMenuSpec(wipCtx(), wipActions(), t)
    )
    expect(texts(spec)).toEqual([
      'Stash changes',
      'Stash changes (include untracked)',
      'Stage all changes',
      'Unstage all changes',
      'Explain working changes (LLM)',
      'Review changes (LLM)',
    ])
  })

  it('wires the working-changes explanation', () => {
    const actions = wipActions()
    const spec = normalizeMenuSpec(buildWipMenuSpec(wipCtx(), actions, t))
    const explain = item(spec, 'Explain working changes (LLM)')
    expect(explain?.enabled).toBe(true)
    explain?.action?.()
    expect(actions.onExplainChanges).toHaveBeenCalled()
  })

  it('wires the working-changes review', () => {
    const actions = wipActions()
    const spec = normalizeMenuSpec(buildWipMenuSpec(wipCtx(), actions, t))
    const review = item(spec, 'Review changes (LLM)')
    expect(review?.enabled).toBe(true)
    review?.action?.()
    expect(actions.onReviewChanges).toHaveBeenCalled()
  })

  it('disables both AI items on a clean tree — nothing to summarize or review', () => {
    const spec = normalizeMenuSpec(
      buildWipMenuSpec(wipCtx({ hasStaged: false, hasUnstaged: false }), wipActions(), t)
    )
    expect(item(spec, 'Explain working changes (LLM)')?.enabled).toBe(false)
    expect(item(spec, 'Review changes (LLM)')?.enabled).toBe(false)
  })

  it('disables both AI items when AI is switched off', () => {
    const spec = normalizeMenuSpec(
      buildWipMenuSpec(wipCtx({ aiEnabled: false }), wipActions(), t)
    )
    expect(item(spec, 'Explain working changes (LLM)')?.enabled).toBe(false)
    expect(item(spec, 'Review changes (LLM)')?.enabled).toBe(false)
  })

  it('enables stage/unstage from the working state', () => {
    const spec = normalizeMenuSpec(
      buildWipMenuSpec(wipCtx({ hasStaged: false }), wipActions(), t)
    )
    expect(item(spec, 'Stage all changes')?.enabled).toBe(true)
    expect(item(spec, 'Unstage all changes')?.enabled).toBe(false)
  })

  it('wires the stash items with and without untracked files', () => {
    const actions = wipActions()
    const spec = normalizeMenuSpec(
      buildWipMenuSpec(wipCtx(), actions, t)
    )
    item(spec, 'Stash changes')?.action?.()
    expect(actions.onStash).toHaveBeenLastCalledWith(false)
    item(spec, 'Stash changes (include untracked)')?.action?.()
    expect(actions.onStash).toHaveBeenLastCalledWith(true)
  })
})

describe('buildOtherWorktreeMenuSpec', () => {
  const otherWorktreeActions = (): OtherWorktreeMenuActions => ({
    onOpenWorktree: vi.fn(),
    onStash: vi.fn(),
    onRevealInFinder: vi.fn(),
  })

  it('lists open worktree, the two stash flavors, then reveal in Finder', () => {
    const spec = normalizeMenuSpec(buildOtherWorktreeMenuSpec(otherWorktreeActions(), t))
    expect(texts(spec)).toEqual([
      'Open worktree',
      'Stash changes there',
      'Stash changes there (include untracked)',
      'Reveal in Finder',
    ])
  })

  it('wires "Open worktree"', () => {
    const actions = otherWorktreeActions()
    const spec = normalizeMenuSpec(buildOtherWorktreeMenuSpec(actions, t))
    item(spec, 'Open worktree')?.action?.()
    expect(actions.onOpenWorktree).toHaveBeenCalledOnce()
  })

  it('wires the stash items with and without untracked files', () => {
    const actions = otherWorktreeActions()
    const spec = normalizeMenuSpec(buildOtherWorktreeMenuSpec(actions, t))
    item(spec, 'Stash changes there')?.action?.()
    expect(actions.onStash).toHaveBeenLastCalledWith(false)
    item(spec, 'Stash changes there (include untracked)')?.action?.()
    expect(actions.onStash).toHaveBeenLastCalledWith(true)
  })

  it('wires "Reveal in Finder"', () => {
    const actions = otherWorktreeActions()
    const spec = normalizeMenuSpec(buildOtherWorktreeMenuSpec(actions, t))
    item(spec, 'Reveal in Finder')?.action?.()
    expect(actions.onRevealInFinder).toHaveBeenCalledOnce()
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

describe('buildConflictMenuSpec', () => {
  const conflictActions = (): ConflictMenuActions => ({
    onContinue: vi.fn(),
    onSkip: vi.fn(),
    onAbort: vi.fn(),
  })

  it('lists Continue, Skip, then Abort', () => {
    const spec = normalizeMenuSpec(
      buildConflictMenuSpec({ allResolved: false, noneResolved: true }, conflictActions(), t)
    )
    expect(texts(spec)).toEqual(['Continue Rebase', 'Skip commit', 'Abort Rebase'])
  })

  it('enables Continue once every conflict is resolved, and disables Skip', () => {
    const spec = normalizeMenuSpec(
      buildConflictMenuSpec({ allResolved: true, noneResolved: false }, conflictActions(), t)
    )
    expect(item(spec, 'Continue Rebase')?.enabled).toBe(true)
    expect(item(spec, 'Skip commit')?.enabled).toBe(false)
  })

  it('enables Skip while nothing has been resolved yet, and disables Continue', () => {
    const spec = normalizeMenuSpec(
      buildConflictMenuSpec({ allResolved: false, noneResolved: true }, conflictActions(), t)
    )
    expect(item(spec, 'Continue Rebase')?.enabled).toBe(false)
    expect(item(spec, 'Skip commit')?.enabled).toBe(true)
  })

  it('disables both Continue and Skip once resolution is under way (some files staged, some still conflicted)', () => {
    const spec = normalizeMenuSpec(
      buildConflictMenuSpec({ allResolved: false, noneResolved: false }, conflictActions(), t)
    )
    expect(item(spec, 'Continue Rebase')?.enabled).toBe(false)
    expect(item(spec, 'Skip commit')?.enabled).toBe(false)
  })

  it('leaves Abort always enabled', () => {
    const spec = normalizeMenuSpec(
      buildConflictMenuSpec({ allResolved: false, noneResolved: false }, conflictActions(), t)
    )
    expect(item(spec, 'Abort Rebase')?.enabled).not.toBe(false)
  })

  it('wires each action', () => {
    const actions = conflictActions()
    const spec = normalizeMenuSpec(
      buildConflictMenuSpec({ allResolved: true, noneResolved: false }, actions, t)
    )
    item(spec, 'Continue Rebase')?.action?.()
    item(spec, 'Abort Rebase')?.action?.()
    expect(actions.onContinue).toHaveBeenCalledOnce()
    expect(actions.onAbort).toHaveBeenCalledOnce()
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
    onPush: vi.fn(),
    onFastForward: vi.fn(),
    onMerge: vi.fn(),
    onRebase: vi.fn(),
    onCheckout: vi.fn(),
    onExplain: vi.fn(),
    onCreateBranch: vi.fn(),
    onCherryPick: vi.fn(),
    onReset: vi.fn(),
    onRevert: vi.fn(),
    onDeleteLocal: vi.fn(),
    onDeleteRemote: vi.fn(),
    onCopyName: vi.fn(),
    onCopySha: vi.fn(),
    onCopyLink: vi.fn(),
    onToggleHidden: vi.fn(),
    onSolo: vi.fn(),
    onAnnotate: vi.fn(),
  })
  const tagCtx = (relationEnabled: boolean, isHidden = false) => ({
    params: { tag: 'v1.0', branch: 'main', remote: 'origin' },
    relationEnabled,
    isHidden,
  })

  // The order is the specification, not an accident: locking it here means a reordering shows up
  // as a failing test rather than as a silently rearranged menu.
  it('lays the menu out in the agreed order, separators included', () => {
    const spec = normalizeMenuSpec(buildTagMenuSpec(tagCtx(true), tagActions(), t))
    expect(spec.map((n) => (n.kind === 'item' || n.kind === 'submenu' ? n.text : '---'))).toEqual([
      'Push v1.0 to origin',
      '---',
      'Fast-forward v1.0 to main',
      'Merge v1.0 into main',
      'Rebase main onto v1.0',
      '---',
      'Checkout this commit',
      '---',
      'Explain Branch Changes (LLM)',
      '---',
      'Create branch here',
      'Cherry-pick this commit',
      'Reset main to this commit',
      'Revert this commit',
      '---',
      'Delete v1.0 locally',
      'Delete v1.0 from origin',
      '---',
      'Copy tag name',
      'Copy SHA',
      '---',
      'Copy link to this tag on remote: origin',
      '---',
      'Hide',
      'Solo',
      '---',
      'Annotate v1.0',
    ])
  })

  it('offers Show instead of Hide once the tag is hidden', () => {
    const shown = normalizeMenuSpec(buildTagMenuSpec(tagCtx(true, false), tagActions(), t))
    expect(texts(shown)).toContain('Hide')
    expect(texts(shown)).not.toContain('Show')

    const hidden = normalizeMenuSpec(buildTagMenuSpec(tagCtx(true, true), tagActions(), t))
    expect(texts(hidden)).toContain('Show')
    expect(texts(hidden)).not.toContain('Hide')
  })

  it('wires push, fast-forward, explain, hide and solo', () => {
    const actions = tagActions()
    const spec = normalizeMenuSpec(buildTagMenuSpec(tagCtx(true), actions, t))
    item(spec, 'Push v1.0 to origin')?.action?.()
    item(spec, 'Fast-forward v1.0 to main')?.action?.()
    item(spec, 'Explain Branch Changes (LLM)')?.action?.()
    item(spec, 'Hide')?.action?.()
    item(spec, 'Solo')?.action?.()
    expect(actions.onPush).toHaveBeenCalled()
    expect(actions.onFastForward).toHaveBeenCalled()
    expect(actions.onExplain).toHaveBeenCalled()
    expect(actions.onToggleHidden).toHaveBeenCalled()
    expect(actions.onSolo).toHaveBeenCalled()
  })

  // Publishing a tag never depends on where HEAD is; moving/merging/rebasing/resetting does.
  it('keeps push and the tag-only actions enabled while detached', () => {
    const spec = normalizeMenuSpec(buildTagMenuSpec(tagCtx(false), tagActions(), t))
    expect(item(spec, 'Push v1.0 to origin')?.enabled).not.toBe(false)
    expect(item(spec, 'Fast-forward v1.0 to main')?.enabled).toBe(false)
    expect(item(spec, 'Annotate v1.0')?.enabled).not.toBe(false)
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

  it('offers Copy SHA for the tagged commit, next to the copy_sha icon, and wires it', () => {
    const actions = tagActions()
    const spec = normalizeMenuSpec(buildTagMenuSpec(tagCtx(true), actions, t))
    const copySha = item(spec, 'Copy SHA')
    expect(copySha?.icon).toBe('copy_sha')
    copySha?.action?.()
    expect(actions.onCopySha).toHaveBeenCalledOnce()
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
      'Explain this commit (LLM)',
      '— separator',
      "Rewrite this commit's message (LLM)",
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
      'Explain this commit (LLM)',
      'Explain branch changes (LLM)',
      'Review branch changes (LLM)',
      '— separator',
      "Rewrite this commit's message (LLM)",
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

  it('gives ANY pushed local branch — not just main/master — "Copy link to branch"', () => {
    // A non-main branch whose remote-tracking ref sits on the same commit now gets the item too,
    // pointing at the actual remote ref's name.
    const pushedFeat = build(
      ctx({
        refs: [
          ref({ shortName: 'feat', type: 'branch' }),
          ref({ shortName: 'origin/feat', type: 'remote' }),
        ],
        currentBranch: 'main',
      })
    )
    expect(texts(pushedFeat)).toContain('Copy link to branch: origin/feat')

    // Regression: a non-main branch with NO remote-tracking ref on the commit still hides it.
    const unpushedFeat = build(ctx({ refs: [ref({ shortName: 'feat' })], currentBranch: 'main' }))
    expect(texts(unpushedFeat).some((l) => l.startsWith('Copy link to branch'))).toBe(false)
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
    // …but NOT the branch explanation: the clicked commit carries no branch, so "explain the
    // branch" would silently describe whichever one happens to be checked out. Explaining the
    // commit itself is exactly the question that was asked, and stays.
    expect(labels).not.toContain('Explain branch changes (LLM)')
    // The branch review is dropped for the same reason.
    expect(labels).not.toContain('Review branch changes (LLM)')
    expect(labels).toContain('Explain this commit (LLM)')
  })

  it('keeps the branch explanation and review when the commit really carries that branch', () => {
    const onIt = ref({ shortName: 'feat' })
    const labels = texts(build(ctx({ refs: [onIt], currentBranch: 'main' })))
    expect(labels).toContain('Explain branch changes (LLM)')
    expect(labels).toContain('Review branch changes (LLM)')
    expect(labels).toContain('Explain this commit (LLM)')
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

describe('buildCommitMenuSpec — recompose', () => {
  // Reuses the file's shared helpers rather than re-deriving them: `normalizeMenuSpec` resolves the
  // conditional entries, and `texts`/`item` already know the node shape.
  const build = (context: GraphCommitMenuContext) =>
    normalizeMenuSpec(buildCommitMenuSpec(context, commitActions(), branchActions(), t))

  const single = "Rewrite this commit's message (LLM)"

  it('offers to rewrite the clicked commit', () => {
    expect(texts(build(ctx()))).toContain(single)
  })

  it('names how many descendants would be rewritten alongside it', () => {
    const spec = build(ctx({ descendantCount: 4, primaryShortOid: 'abc1234' }))
    expect(texts(spec)).toContain('Rewrite abc1234 and its 4 descendants (LLM)')
  })

  it('hides the descendants entry on a tip commit rather than offering to rewrite nothing', () => {
    expect(texts(build(ctx({ descendantCount: 0 }))).some((l) => l.includes('descendants'))).toBe(
      false
    )
  })

  it('refuses on a protected branch, before the dialog has to', () => {
    expect(item(build(ctx({ isOnProtectedBranch: true })), single)?.enabled).toBe(false)
  })

  it('refuses on a detached HEAD — there is no branch to move', () => {
    expect(item(build(ctx({ isDetached: true })), single)?.enabled).toBe(false)
  })

  it('is disabled when AI is off, like every other model-driven entry', () => {
    expect(item(build(ctx({ aiEnabled: false })), single)?.enabled).toBe(false)
  })

  it('is absent from the multi-selection menu, which has its own commit-scoped items', () => {
    expect(texts(build(ctx({ isSingle: false, targetCount: 3 })))).not.toContain(single)
  })

  it('passes the descendants flag through to the action', () => {
    const actions = commitActions()
    const spec = normalizeMenuSpec(
      buildCommitMenuSpec(ctx({ descendantCount: 2 }), actions, branchActions(), t)
    )
    item(spec, single)?.action?.()
    expect(actions.onRecomposeCommit).toHaveBeenCalledWith(false)
    item(spec, 'Rewrite abc1234 and its 2 descendants (LLM)')?.action?.()
    expect(actions.onRecomposeCommit).toHaveBeenCalledWith(true)
  })
})
