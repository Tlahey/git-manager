import { describe, it, expect } from 'vitest'
import { i18next } from '@git-manager/i18n'
import type { CommitScanProgress } from '@git-manager/ai'
import type { NotchProgressModel, NotchStatusModel } from '@git-manager/notch'
import { commitSearchNotchId, commitSearchNotchModel } from './commitSearchNotch'
import type { AiCommitSearchPhase } from '../../hooks/useAiCommitSearch'

// The setup file initialises i18n in English, so these are the real strings the user reads.
const t = i18next.getFixedT('en', 'git')

function build(
  phase: AiCommitSearchPhase,
  progress: CommitScanProgress | null = null,
  matchCount = 0
) {
  return commitSearchNotchModel({
    repoPath: '/Users/antoine/Workspace/git-manager',
    repoName: 'git-manager',
    question: 'when did the notch card get a queue?',
    phase,
    progress,
    matchCount,
    t,
  })
}

describe('commitSearchNotchId', () => {
  it('is one card per repository, so a second search replaces the first', () => {
    expect(commitSearchNotchId('/a')).toBe(commitSearchNotchId('/a'))
    expect(commitSearchNotchId('/a')).not.toBe(commitSearchNotchId('/b'))
  })
})

describe('commitSearchNotchModel — nothing to show', () => {
  it('shows nothing while idle', () => {
    expect(build('idle')).toBeNull()
  })

  it('shows nothing after the user cancelled', () => {
    // They already know what they did, and a card announcing it would outlive the click.
    expect(build('cancelled')).toBeNull()
  })
})

describe('commitSearchNotchModel — while running', () => {
  it('is a progress card titled with the question being answered', () => {
    const model = build('scanning', { phase: 'scanning', completed: 3, total: 10 })
    expect(model?.kind).toBe('progress')
    expect(model?.title).toBe('when did the notch card get a queue?')
    expect(model?.context).toBe('git-manager')
    expect(model?.tone).toBe('running')
  })

  it('fills the bar from the commits read so far', () => {
    const model = build('scanning', { phase: 'scanning', completed: 3, total: 10 })
    expect((model as NotchProgressModel).ratio).toBeCloseTo(0.3)
  })

  it('counts the files alongside the commits, which is what the wait is made of', () => {
    // Every commit costs one call per file, so "3 of 10" on its own understates the wait by an
    // order of magnitude and a bar that has barely moved looks stuck rather than busy.
    const model = build('scanning', {
      phase: 'scanning',
      completed: 3,
      total: 10,
      filesRead: 87,
    })
    expect((model as NotchProgressModel).detail).toContain('3 / 10 commits')
    expect((model as NotchProgressModel).detail).toContain('87 files')
  })

  it('leaves the bar indeterminate for the single-call phases', () => {
    // "0 of 1" is a bar parked at zero for as long as the call takes, which reads as stalled.
    for (const phase of ['triaging', 'composing'] as const) {
      const model = build('scanning', { phase, completed: 0, total: 1 })
      expect((model as NotchProgressModel).ratio).toBeUndefined()
    }
  })

  it('names the triage rather than calling it a one-commit search', () => {
    const model = build('scanning', { phase: 'triaging', completed: 0, total: 1 })
    expect((model as NotchProgressModel).detail).toMatch(/commit messages/i)
  })

  it('says the narrowing is happening, since both counters freeze during it', () => {
    const model = build('scanning', {
      phase: 'scanning',
      completed: 3,
      total: 10,
      narrowing: true,
    })
    expect((model as NotchProgressModel).detail).toMatch(/which files/i)
  })

  it('falls back to the composing line once the scan hands over to the answer', () => {
    // `progress` is cleared while the answer streams; the card must not go blank mid-run.
    const model = build('answering', null)
    expect(model?.kind).toBe('progress')
    expect((model as NotchProgressModel).detail).toMatch(/writing the answer/i)
  })

  it('offers a cancel button, which is the whole point of a card you can reach', () => {
    const model = build('scanning', { phase: 'scanning', completed: 1, total: 10 })
    expect(model?.actions?.map((a) => a.id)).toEqual(['cancel'])
    expect(model?.actions?.[0]?.label).toBe('Cancel')
  })

  it('never divides by zero on a scan that found nothing to read', () => {
    const model = build('scanning', { phase: 'scanning', completed: 0, total: 0 })
    expect((model as NotchProgressModel).ratio).toBeUndefined()
  })
})

describe('commitSearchNotchModel — once it is over', () => {
  it('leaves a card saying the answer is waiting, with its match count', () => {
    const model = build('done', null, 3)
    expect(model?.kind).toBe('status')
    expect(model?.tone).toBe('success')
    expect((model as NotchStatusModel).title).toBe('Answer ready — 3 matching commits')
  })

  it('gets the singular right', () => {
    expect((build('done', null, 1) as NotchStatusModel).title).toBe(
      'Answer ready — 1 matching commit'
    )
  })

  it('says so even when nothing matched — a negative answer is still an answer', () => {
    expect((build('done', null, 0) as NotchStatusModel).title).toContain('0 matching commits')
  })

  it('offers a way back to the panel', () => {
    expect(build('done', null, 2)?.actions?.map((a) => a.id)).toEqual(['activate'])
  })

  it('reports a failure in the error tone', () => {
    const model = build('error')
    expect(model?.kind).toBe('status')
    expect(model?.tone).toBe('error')
    expect((model as NotchStatusModel).title).toMatch(/could not finish/i)
  })
})

describe('commitSearchNotchModel — serialisability', () => {
  it('survives the round trip into the notch window’s URL', () => {
    const model = build('scanning', { phase: 'scanning', completed: 3, total: 10, filesRead: 5 })
    expect(JSON.parse(JSON.stringify(model))).toEqual(model)
  })
})
