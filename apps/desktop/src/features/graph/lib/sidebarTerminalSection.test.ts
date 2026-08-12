import { describe, expect, it } from 'vitest'
import type { GitWorktree, TerminalStatus } from '@git-manager/git-types'
import { buildTerminalsSection, repoTerminalSessions } from './sidebarTerminalSection'

const t = ((key: string, opts?: Record<string, unknown>) =>
  opts ? `${key}:${JSON.stringify(opts)}` : key) as never

const ctx = (over: Partial<{ q: string; isOpen: boolean }> = {}) => ({
  t,
  q: '',
  isOpen: true,
  subOpen: (_id: string, def = true) => def,
  ...over,
})

const session = (id: string, cwd: string) => ({ id, title: `zsh ${id}`, cwd })

const worktrees: GitWorktree[] = [
  { path: '/repo', branch: 'main', isMain: true } as GitWorktree,
  { path: '/repo/.worktrees/feature', branch: 'feat/login' } as GitWorktree,
]

const busy = (id: string, command: string | null = null): TerminalStatus => ({
  id,
  busy: true,
  command,
})

const build = (over: Partial<Parameters<typeof buildTerminalsSection>[1]> = {}, q = '') =>
  buildTerminalsSection(ctx({ q }), {
    sessions: [],
    activity: {},
    worktrees,
    repoPath: '/repo',
    activeId: null,
    ...over,
  })

describe('repoTerminalSessions', () => {
  it('keeps only the sessions bound to a directory this repository owns', () => {
    const sessions = [
      session('here', '/repo'),
      session('worktree', '/repo/.worktrees/feature'),
      session('elsewhere', '/other-repo'),
    ]
    expect(
      repoTerminalSessions({ sessions, activity: {}, worktrees, repoPath: '/repo' }).map(
        (s) => s.id
      )
    ).toEqual(['here', 'worktree'])
  })

  it('still claims the repo tab path when the worktree list has not loaded', () => {
    expect(
      repoTerminalSessions({
        sessions: [session('here', '/repo')],
        activity: {},
        worktrees: [],
        repoPath: '/repo',
      })
    ).toHaveLength(1)
  })

  it('puts the running sessions first', () => {
    const sessions = [session('idle', '/repo'), session('agent', '/repo/.worktrees/feature')]
    expect(
      repoTerminalSessions({
        sessions,
        activity: { agent: busy('agent', 'claude') },
        worktrees,
        repoPath: '/repo',
      }).map((s) => s.id)
    ).toEqual(['agent', 'idle'])
  })
})

describe('buildTerminalsSection', () => {
  it('survives being empty, and says so', () => {
    const section = build()
    expect(section?.key).toBe('terminals')
    expect(section?.count).toBeUndefined()
    expect(section?.rows.map((r) => r.id)).toEqual(['term:empty'])
  })

  it('lists one row per session, labelled with the branch it is bound to', () => {
    const section = build({
      sessions: [session('a', '/repo'), session('b', '/repo/.worktrees/feature')],
    })
    expect(section?.count).toBe(2)
    expect(section?.rows.map((r) => r.id)).toEqual(['term:a', 'term:b'])
    expect(section?.rows.map((r) => (r.kind === 'terminal' ? r.location : null))).toEqual([
      'main',
      'feat/login',
    ])
  })

  it('carries the running command onto the row', () => {
    const section = build({
      sessions: [session('a', '/repo')],
      activity: { a: busy('a', 'claude') },
    })
    const row = section?.rows[0]
    expect(row?.kind === 'terminal' && row).toMatchObject({ isBusy: true, command: 'claude' })
  })

  it('marks the session the panel is showing', () => {
    const section = build({
      sessions: [session('a', '/repo'), session('b', '/repo')],
      activeId: 'b',
    })
    expect(
      section?.rows.map((r) => (r.kind === 'terminal' ? [r.session.id, r.isActive] : null))
    ).toEqual([
      ['a', false],
      ['b', true],
    ])
  })

  it('builds no rows while the section is collapsed, but still counts', () => {
    const section = buildTerminalsSection(ctx({ isOpen: false }), {
      sessions: [session('a', '/repo')],
      activity: {},
      worktrees,
      repoPath: '/repo',
      activeId: null,
    })
    expect(section?.rows).toEqual([])
    expect(section?.count).toBe(1)
  })

  it('narrows to the search query, matching the branch, the session name or the command', () => {
    const sessions = [session('a', '/repo'), session('b', '/repo/.worktrees/feature')]
    expect(build({ sessions }, 'login')?.rows.map((r) => r.id)).toEqual(['term:b'])
    expect(build({ sessions }, 'zsh a')?.rows.map((r) => r.id)).toEqual(['term:a'])
    expect(
      build({ sessions, activity: { a: busy('a', 'claude') } }, 'claude')?.rows.map((r) => r.id)
    ).toEqual(['term:a'])
  })

  it('hides itself when a search matches none of its sessions', () => {
    expect(build({ sessions: [session('a', '/repo')] }, 'nothing-matches')).toBeNull()
  })
})
