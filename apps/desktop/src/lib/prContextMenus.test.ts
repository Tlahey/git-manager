import { describe, it, expect, vi } from 'vitest'
import { i18next } from '@git-manager/i18n'
import {
  buildPullRequestMenuSpec,
  type PullRequestMenuActions,
  type PullRequestMenuContext,
} from './prContextMenus'
import { normalizeMenuSpec, type MenuSpecNode } from './nativeMenuSpec'

// vitest.setup.ts boots real i18n in English — builders receive `t`, so assert real visible copy.
const t = (key: string, opts?: Record<string, unknown>) => i18next.t(key, { ns: 'git', ...opts })

type ItemNode = Extract<MenuSpecNode, { kind: 'item' }>
const items = (nodes: MenuSpecNode[]) => nodes.filter((n): n is ItemNode => n.kind === 'item')
const item = (nodes: MenuSpecNode[], text: string) => items(nodes).find((n) => n.text === text)

function ctx(overrides: Partial<PullRequestMenuContext> = {}): PullRequestMenuContext {
  return { number: 42, hasLocalBranch: true, aiEnabled: true, ...overrides }
}

function actions(): PullRequestMenuActions {
  return {
    onViewOnGitHub: vi.fn(),
    onCopyLink: vi.fn(),
    onReview: vi.fn(),
    onGoToBranch: vi.fn(),
    onCheckout: vi.fn(),
    onCreateWorktree: vi.fn(),
  }
}

const build = (c = ctx(), a = actions()) => normalizeMenuSpec(buildPullRequestMenuSpec(c, a, t))

describe('buildPullRequestMenuSpec', () => {
  it('lays the menu out in the agreed order, separators included', () => {
    expect(build().map((n) => (n.kind === 'item' ? n.text : '---'))).toEqual([
      'View pull request #42 on github.com',
      'Copy link for pull request #42',
      '---',
      'Review pull request (LLM)',
      'Go to branch in graph',
      '---',
      'Checkout branch',
      'Create worktree from pull request',
    ])
  })

  it('names the pull request in the GitHub and copy entries', () => {
    const spec = build(ctx({ number: 7 }))
    expect(item(spec, 'View pull request #7 on github.com')).toBeDefined()
    expect(item(spec, 'Copy link for pull request #7')).toBeDefined()
  })

  // The backend's checkout resolves a local branch or a raw OID, so a head that was never fetched
  // has nothing to act on. Disabled rather than hidden — the fix is on the user's side.
  it('disables every branch-scoped entry when the head is not a local branch', () => {
    const spec = build(ctx({ hasLocalBranch: false }))
    expect(item(spec, 'Go to branch in graph')!.enabled).toBe(false)
    expect(item(spec, 'Checkout branch')!.enabled).toBe(false)
    expect(item(spec, 'Create worktree from pull request')!.enabled).toBe(false)
    // The GitHub-side entries need no local branch at all.
    expect(item(spec, 'View pull request #42 on github.com')!.enabled).toBeUndefined()
    expect(item(spec, 'Copy link for pull request #42')!.enabled).toBeUndefined()
  })

  it('keeps the review entry independent of the branch being local', () => {
    expect(item(build(ctx({ hasLocalBranch: false })), 'Review pull request (LLM)')!.enabled).toBe(
      true
    )
  })

  it('disables the review entry when AI is switched off', () => {
    expect(item(build(ctx({ aiEnabled: false })), 'Review pull request (LLM)')!.enabled).toBe(false)
  })

  it('wires each entry to its action', () => {
    const a = actions()
    const spec = build(ctx(), a)

    item(spec, 'View pull request #42 on github.com')!.action!()
    item(spec, 'Copy link for pull request #42')!.action!()
    item(spec, 'Review pull request (LLM)')!.action!()
    item(spec, 'Go to branch in graph')!.action!()
    item(spec, 'Checkout branch')!.action!()
    item(spec, 'Create worktree from pull request')!.action!()

    expect(a.onViewOnGitHub).toHaveBeenCalledOnce()
    expect(a.onCopyLink).toHaveBeenCalledOnce()
    expect(a.onReview).toHaveBeenCalledOnce()
    expect(a.onGoToBranch).toHaveBeenCalledOnce()
    expect(a.onCheckout).toHaveBeenCalledOnce()
    expect(a.onCreateWorktree).toHaveBeenCalledOnce()
  })
})
