import { describe, it, expect, vi } from 'vitest'
import { i18next } from '@git-manager/i18n'
import {
  buildIssueFilterMenuSpec,
  buildIssueMenuSpec,
  type IssueFilterMenuActions,
  type IssueMenuActions,
} from './issueContextMenus'
import { normalizeMenuSpec, type MenuSpecNode } from './nativeMenuSpec'

// vitest.setup.ts boots real i18n in English — builders receive `t`, so assert real visible copy.
const t = (key: string, opts?: Record<string, unknown>) => i18next.t(key, { ns: 'git', ...opts })

type ItemNode = Extract<MenuSpecNode, { kind: 'item' }>

const items = (nodes: MenuSpecNode[]) => nodes.filter((n): n is ItemNode => n.kind === 'item')
const texts = (nodes: MenuSpecNode[]) => items(nodes).map((n) => n.text)
const item = (nodes: MenuSpecNode[], text: string) => items(nodes).find((n) => n.text === text)

function issueActions(): IssueMenuActions {
  return { onCreateBranch: vi.fn(), onViewOnGitHub: vi.fn(), onCopyLink: vi.fn() }
}

function filterActions(): IssueFilterMenuActions {
  return { onEdit: vi.fn(), onDelete: vi.fn(), onMoveUp: vi.fn(), onMoveDown: vi.fn() }
}

describe('buildIssueMenuSpec', () => {
  it('lays the menu out in the agreed order, separator included', () => {
    const spec = normalizeMenuSpec(
      buildIssueMenuSpec({ number: 312, hasBranch: false }, issueActions(), t)
    )
    expect(spec.map((n) => (n.kind === 'item' ? n.text : '---'))).toEqual([
      'Create a branch for issue #312',
      '---',
      'View issue on GitHub',
      'Copy issue link',
    ])
  })

  it('names the issue in the branch entry', () => {
    const spec = normalizeMenuSpec(
      buildIssueMenuSpec({ number: 7, hasBranch: false }, issueActions(), t)
    )
    expect(texts(spec)).toContain('Create a branch for issue #7')
  })

  // The branch it would create already exists, so there is no action left to offer.
  it('drops the branch entry when a local branch already references the issue', () => {
    const spec = normalizeMenuSpec(
      buildIssueMenuSpec({ number: 312, hasBranch: true }, issueActions(), t)
    )
    expect(texts(spec)).toEqual(['View issue on GitHub', 'Copy issue link'])
    // Normalization drops the now-leading separator rather than leaving the menu starting on one.
    expect(spec[0].kind).toBe('item')
  })

  it('wires each entry to its action', () => {
    const actions = issueActions()
    const spec = normalizeMenuSpec(
      buildIssueMenuSpec({ number: 1, hasBranch: false }, actions, t)
    )

    item(spec, 'Create a branch for issue #1')!.action!()
    item(spec, 'View issue on GitHub')!.action!()
    item(spec, 'Copy issue link')!.action!()

    expect(actions.onCreateBranch).toHaveBeenCalledOnce()
    expect(actions.onViewOnGitHub).toHaveBeenCalledOnce()
    expect(actions.onCopyLink).toHaveBeenCalledOnce()
  })
})

describe('buildIssueFilterMenuSpec', () => {
  it('offers edit, delete and both moves, in that order', () => {
    const spec = normalizeMenuSpec(
      buildIssueFilterMenuSpec({ canMoveUp: true, canMoveDown: true }, filterActions(), t)
    )
    expect(spec.map((n) => (n.kind === 'item' ? n.text : '---'))).toEqual([
      'Edit filter',
      'Delete filter',
      '---',
      'Move up',
      'Move down',
    ])
  })

  // Disabled rather than hidden, so the menu keeps its shape wherever the filter sits in the list.
  it('disables the move that would run off the end of the list', () => {
    const first = normalizeMenuSpec(
      buildIssueFilterMenuSpec({ canMoveUp: false, canMoveDown: true }, filterActions(), t)
    )
    expect(item(first, 'Move up')!.enabled).toBe(false)
    expect(item(first, 'Move down')!.enabled).toBe(true)

    const last = normalizeMenuSpec(
      buildIssueFilterMenuSpec({ canMoveUp: true, canMoveDown: false }, filterActions(), t)
    )
    expect(item(last, 'Move up')!.enabled).toBe(true)
    expect(item(last, 'Move down')!.enabled).toBe(false)
  })

  it('wires each entry to its action', () => {
    const actions = filterActions()
    const spec = normalizeMenuSpec(
      buildIssueFilterMenuSpec({ canMoveUp: true, canMoveDown: true }, actions, t)
    )

    item(spec, 'Edit filter')!.action!()
    item(spec, 'Delete filter')!.action!()
    item(spec, 'Move up')!.action!()
    item(spec, 'Move down')!.action!()

    expect(actions.onEdit).toHaveBeenCalledOnce()
    expect(actions.onDelete).toHaveBeenCalledOnce()
    expect(actions.onMoveUp).toHaveBeenCalledOnce()
    expect(actions.onMoveDown).toHaveBeenCalledOnce()
  })
})
