import { describe, it, expect } from 'vitest'
import { i18next, type TFunction } from '@git-manager/i18n'
import type { NotchProgressModel } from '@git-manager/notch'
import {
  aiRunHasItsOwnCard,
  aiRunNotchModel,
  aiRunNotchRoute,
  AI_RUN_NOTCH_ID,
} from './aiRunNotch'
import type { AiPhaseProgress, AiRun } from '../../stores/aiActivity.store'

const t = i18next.getFixedT('en', 'common') as unknown as TFunction

function run(overrides: Partial<AiRun> = {}): AiRun {
  return { runId: 1, featureId: 'file-summary', startedAt: Date.now(), ...overrides }
}

function progress(overrides: Partial<AiPhaseProgress> = {}): AiPhaseProgress {
  return { featureId: 'file-summary', completed: 3, total: 12, ...overrides }
}

function model(...args: Parameters<typeof aiRunNotchModel>): NotchProgressModel {
  return aiRunNotchModel(...args) as NotchProgressModel
}

describe('aiRunNotchModel', () => {
  it('is one card for all AI work, whichever run is driving it', () => {
    // A map phase is one run per file — an id per run would queue forty cards for one button press.
    expect(model({ run: run(), progress: null, t }).id).toBe(AI_RUN_NOTCH_ID)
    expect(model({ run: run({ featureId: 'code-review' }), progress: null, t }).id).toBe(
      AI_RUN_NOTCH_ID
    )
  })

  it('names the feature the way the footer does', () => {
    expect(model({ run: run(), progress: null, t }).title).toBe('Reading the files one by one…')
  })

  it('falls back to a generic label for a feature nobody has named yet', () => {
    // The right way round for something whose job is to prove the app hasn't frozen.
    expect(model({ run: run({ featureId: 'brand-new' }), progress: null, t }).title).toBe(
      'Working…'
    )
  })

  it('is always a live card, never a terminal one', () => {
    // The activity store records that a run ended, not whether it worked — a "done" card built from
    // here would be a guess, and claiming success on a failed review is worse than saying nothing.
    expect(model({ run: run(), progress: null, t }).kind).toBe('progress')
  })

  it('fills the bar from the map phase’s count', () => {
    const card = model({ run: run(), progress: progress(), t })
    expect(card.ratio).toBeCloseTo(0.25)
    expect(card.detail).toBe('3 / 12 files')
  })

  it('ignores a count belonging to a different feature', () => {
    // The count is published between calls and deliberately never cleared, so a finished phase's
    // last number would otherwise be shown against the next, unrelated generation.
    const card = model({ run: run(), progress: progress({ featureId: 'commit-relevance' }), t })
    expect(card.ratio).toBeUndefined()
    expect(card.detail).toBeUndefined()
  })

  it('shows no bar for a single-call phase', () => {
    // "0 of 1" is a bar sitting at zero for as long as the call takes, which reads as stalled.
    const card = model({ run: run(), progress: progress({ completed: 0, total: 1 }), t })
    expect(card.ratio).toBeUndefined()
    expect(card.detail).toBeUndefined()
  })

  it('never overfills, whatever the counter says', () => {
    const card = model({ run: run(), progress: progress({ completed: 99, total: 12 }), t })
    expect(card.ratio).toBe(1)
  })

  it('names the repository the run belongs to', () => {
    const card = model({ run: run(), progress: null, repoName: 'git-manager', t })
    expect(card.context).toBe('git-manager')
  })

  it('offers a way back to the run, and none when there is nowhere to go', () => {
    const withOrigin = model({
      run: run({ origin: { repoPath: '/repo' } }),
      progress: null,
      t,
    })
    expect(withOrigin.actions).toEqual([{ id: 'activate', label: 'Open', variant: 'primary' }])

    expect(model({ run: run(), progress: null, t }).actions).toBeUndefined()
  })
})

describe('aiRunNotchRoute', () => {
  it('carries the panel the run came from', () => {
    expect(
      aiRunNotchRoute(run({ origin: { repoPath: '/repo', panel: { kind: 'working' } } }))
    ).toEqual({ kind: 'ai-run', repoPath: '/repo', panel: { kind: 'working' } })
  })

  it('carries the repository alone when the run named no panel', () => {
    expect(aiRunNotchRoute(run({ origin: { repoPath: '/repo' } }))).toEqual({
      kind: 'ai-run',
      repoPath: '/repo',
    })
  })

  it('is nothing at all for a run with nowhere to return to', () => {
    expect(aiRunNotchRoute(run())).toBeUndefined()
  })
})

describe('aiRunHasItsOwnCard', () => {
  it('stands aside for the commit search, which has a richer card', () => {
    // A generic "the model is working" card would carry a different id and sit in the queue behind
    // the search's own — so the user's search would be what hid it.
    for (const id of [
      'commit-quick-scan',
      'commit-file-scan',
      'commit-relevance',
      'commit-search-answer',
    ]) {
      expect(aiRunHasItsOwnCard(id)).toBe(true)
    }
  })

  it('claims everything else', () => {
    for (const id of ['file-summary', 'code-review', 'summary-grouping', 'summary-search']) {
      expect(aiRunHasItsOwnCard(id)).toBe(false)
    }
  })
})
