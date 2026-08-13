import { describe, it, expect } from 'vitest'
import { i18next } from '@git-manager/i18n'
import { terminalFinishedNotchModel } from './terminalNotch'

const t = i18next.getFixedT('en', 'git')

describe('terminalFinishedNotchModel', () => {
  it('names the command that finished', () => {
    const model = terminalFinishedNotchModel({ sessionId: 'a', command: 'claude', cwd: '/repo', t })
    expect(model.title).toBe('claude has finished')
  })

  it('falls back to a generic title when the command could not be resolved', () => {
    const model = terminalFinishedNotchModel({ sessionId: 'a', command: null, cwd: '/repo', t })
    expect(model.title).toBe('The command has finished')
  })

  it('shows the worktree/repo the session belongs to, not its full path', () => {
    const model = terminalFinishedNotchModel({
      sessionId: 'a',
      command: 'claude',
      cwd: '/Users/x/git-manager.worktrees/feature',
      t,
    })
    expect(model.context).toBe('feature')
  })

  it('gives every session its own stable card id', () => {
    const a = terminalFinishedNotchModel({ sessionId: 'a', command: null, cwd: '/repo', t })
    const b = terminalFinishedNotchModel({ sessionId: 'b', command: null, cwd: '/repo', t })
    expect(a.id).not.toBe(b.id)
  })

  it('carries no verdict — the store cannot tell success from failure', () => {
    const model = terminalFinishedNotchModel({ sessionId: 'a', command: 'claude', cwd: '/repo', t })
    expect(model.tone).toBe('neutral')
    expect(model.kind).toBe('status')
  })
})
