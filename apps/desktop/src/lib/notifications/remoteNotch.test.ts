import { describe, it, expect } from 'vitest'
import { i18next } from '@git-manager/i18n'
import type { NotchProgressModel, NotchStatusModel } from '@git-manager/notch'
import {
  errorLines,
  formatBytes,
  remoteNotchId,
  remoteOutcomeNotchModel,
  remoteProgressNotchModel,
  repoNameOf,
} from './remoteNotch'
import type { RemoteOperationEntry } from '../../stores/remoteProgress.store'
import type { RemoteOperation, RemoteProgressPhase } from '../tauri'

const t = i18next.getFixedT('en', 'git')

function entry(overrides: Partial<RemoteOperationEntry> = {}): RemoteOperationEntry {
  return {
    repoPath: '/Users/antoine/Workspace/git-manager',
    operation: 'fetch',
    startedAt: Date.now(),
    background: false,
    progress: null,
    outcome: null,
    ...overrides,
  }
}

function progress(
  phase: RemoteProgressPhase,
  completed: number,
  total: number,
  bytes = 0
): RemoteOperationEntry['progress'] {
  return { phase, completed, total, bytes }
}

describe('remoteNotchId', () => {
  it('separates a fetch from a push in the same repository', () => {
    // Two transfers, two waits, two bars — coalescing them onto one card would make each look like
    // it kept restarting.
    expect(remoteNotchId('/repo', 'fetch')).not.toBe(remoteNotchId('/repo', 'push'))
  })

  it('separates the same operation in two repositories', () => {
    expect(remoteNotchId('/a', 'fetch')).not.toBe(remoteNotchId('/b', 'fetch'))
  })
})

describe('repoNameOf', () => {
  it('takes the repository name off its path', () => {
    expect(repoNameOf('/Users/antoine/Workspace/git-manager')).toBe('git-manager')
  })

  it('tolerates a trailing slash', () => {
    expect(repoNameOf('/Users/antoine/git-manager/')).toBe('git-manager')
  })

  it('falls back to the path when there is nothing to take', () => {
    expect(repoNameOf('')).toBe('')
  })
})

describe('formatBytes', () => {
  it('stays in bytes below a kilobyte', () => {
    expect(formatBytes(512)).toBe('512 B')
  })

  it('climbs through the units', () => {
    expect(formatBytes(2048)).toBe('2.0 kB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB')
    expect(formatBytes(3 * 1024 * 1024 * 1024)).toBe('3.0 GB')
  })

  it('drops the decimal once the number is wide enough not to need it', () => {
    expect(formatBytes(18 * 1024 * 1024)).toBe('18 MB')
  })

  it('does not run past its largest unit', () => {
    expect(formatBytes(9_000 * 1024 * 1024 * 1024)).toContain('GB')
  })
})

describe('remoteProgressNotchModel', () => {
  it('shows an indeterminate card before the first report', () => {
    // A bar at 0 % while the client is still negotiating looks stuck before any work has happened.
    const model = remoteProgressNotchModel({ entry: entry(), t })
    expect(model?.kind).toBe('progress')
    expect((model as NotchProgressModel).ratio).toBeUndefined()
    expect(model?.title).toMatch(/talking to the remote/i)
  })

  it('names the phase it is in', () => {
    const cases: [RemoteProgressPhase, RegExp][] = [
      ['receiving', /receiving objects/i],
      ['resolving', /resolving deltas/i],
      ['writing', /writing objects/i],
    ]
    for (const [phase, expected] of cases) {
      const model = remoteProgressNotchModel({
        entry: entry({ progress: progress(phase, 1, 10) }),
        t,
      })
      expect(model?.title).toMatch(expected)
    }
  })

  it('fills the bar from the objects transferred', () => {
    const model = remoteProgressNotchModel({
      entry: entry({ progress: progress('receiving', 25, 100) }),
      t,
    })
    expect((model as NotchProgressModel).ratio).toBeCloseTo(0.25)
  })

  it('stays indeterminate while the server has announced no total', () => {
    const model = remoteProgressNotchModel({
      entry: entry({ progress: progress('receiving', 40, 0) }),
      t,
    })
    expect((model as NotchProgressModel).ratio).toBeUndefined()
  })

  it('reports the bytes, which is the honest measure on a large blob', () => {
    const model = remoteProgressNotchModel({
      entry: entry({ progress: progress('receiving', 3, 10, 4 * 1024 * 1024) }),
      t,
    })
    expect((model as NotchProgressModel).detail).toContain('3 / 10')
    expect((model as NotchProgressModel).detail).toContain('4.0 MB')
  })

  it('labels the operation, so a pull is not mistaken for a fetch', () => {
    const fetch = remoteProgressNotchModel({ entry: entry({ operation: 'fetch' }), t })
    const push = remoteProgressNotchModel({ entry: entry({ operation: 'push' }), t })
    expect(fetch?.eyebrow).toMatch(/fetching/i)
    expect(push?.eyebrow).toMatch(/pushing/i)
  })

  it('shows nothing once the transfer has ended', () => {
    const model = remoteProgressNotchModel({
      entry: entry({ outcome: { kind: 'success' } }),
      t,
    })
    expect(model).toBeNull()
  })
})

describe('remoteOutcomeNotchModel', () => {
  it('says nothing for a fetch that moved no ref', () => {
    // This app fetches on a timer. Announcing every no-op would teach the user to ignore the notch
    // within a day, which is the one failure a notification surface never recovers from.
    const model = remoteOutcomeNotchModel({
      entry: entry({ outcome: { kind: 'success', updatedRefs: [] } }),
      t,
    })
    expect(model).toBeNull()
  })

  it('reports a fetch that did bring something back', () => {
    const model = remoteOutcomeNotchModel({
      entry: entry({ outcome: { kind: 'success', updatedRefs: ['main → abc1234'] } }),
      t,
    })
    expect(model?.tone).toBe('success')
    expect((model as NotchStatusModel).title).toBe('1 branch updated')
  })

  it('gets the plural right', () => {
    const model = remoteOutcomeNotchModel({
      entry: entry({ outcome: { kind: 'success', updatedRefs: ['a', 'b', 'c'] } }),
      t,
    })
    expect((model as NotchStatusModel).title).toBe('3 branches updated')
  })

  it('always reports a finished pull and push, which the user asked for explicitly', () => {
    for (const operation of ['pull', 'push'] as RemoteOperation[]) {
      const model = remoteOutcomeNotchModel({
        entry: entry({ operation, outcome: { kind: 'success' } }),
        t,
      })
      expect(model?.tone).toBe('success')
    }
  })

  it('reports a failure with the tail of the error', () => {
    const model = remoteOutcomeNotchModel({
      entry: entry({
        operation: 'push',
        outcome: {
          kind: 'error',
          message: 'failed to push\nrejected: non-fast-forward\nhint: pull first',
        },
      }),
      t,
    })
    expect(model?.tone).toBe('error')
    expect((model as NotchStatusModel).title).toMatch(/push failed/i)
    expect((model as NotchStatusModel).outputLines).toContain('hint: pull first')
  })

  it('offers a way back into the app', () => {
    const model = remoteOutcomeNotchModel({
      entry: entry({ operation: 'push', outcome: { kind: 'error', message: 'boom' } }),
      t,
    })
    expect(model?.actions?.map((a) => a.id)).toEqual(['activate'])
  })

  it('gives the outcome its own id, so it does not coalesce onto the live card', () => {
    const done = remoteOutcomeNotchModel({
      entry: entry({ outcome: { kind: 'success', updatedRefs: ['a'] } }),
      t,
    })
    expect(done?.id).not.toBe(remoteNotchId('/Users/antoine/Workspace/git-manager', 'fetch'))
  })

  it('shows nothing while the transfer is still running', () => {
    expect(remoteOutcomeNotchModel({ entry: entry(), t })).toBeNull()
  })
})

describe('errorLines', () => {
  it('keeps the last lines, where git puts the useful part', () => {
    expect(errorLines('one\ntwo\nthree\nfour\nfive')).toEqual(['three', 'four', 'five'])
  })

  it('drops blank lines rather than spending the card on them', () => {
    expect(errorLines('boom\n\n   \n')).toEqual(['boom'])
  })

  it('is empty for an empty message', () => {
    expect(errorLines('')).toEqual([])
  })
})
