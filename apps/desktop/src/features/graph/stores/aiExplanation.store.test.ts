import { describe, it, expect, beforeEach } from 'vitest'
import { explanationKey, useAiExplanationStore } from './aiExplanation.store'

const store = () => useAiExplanationStore.getState()

beforeEach(() => {
  useAiExplanationStore.setState({ explanations: {} })
})

describe('explanationKey', () => {
  it('combines repo path and branch', () => {
    expect(explanationKey('/repo', 'branch', 'feat/x')).toBe('/repo::branch::feat/x')
  })

  it('keeps the same branch name in two clones apart', () => {
    expect(explanationKey('/a', 'branch', 'main')).not.toBe(explanationKey('/b', 'branch', 'main'))
  })
})

describe('aiExplanation.store', () => {
  it('stores an explanation with its base and a timestamp', () => {
    const before = Date.now()
    store().set('/repo', 'branch', 'feat/x', 'origin/main', 'the text')

    const stored = store().get('/repo', 'branch', 'feat/x')
    expect(stored).toMatchObject({ text: 'the text', comparedTo: 'origin/main' })
    expect(stored!.generatedAt).toBeGreaterThanOrEqual(before)
  })

  it('returns undefined for a branch that has none', () => {
    expect(store().get('/repo', 'branch', 'never-summarized')).toBeUndefined()
  })

  it('overwrites on a second write for the same branch', () => {
    store().set('/repo', 'branch', 'feat/x', 'origin/main', 'first')
    store().set('/repo', 'branch', 'feat/x', 'origin/develop', 'second')

    expect(store().get('/repo', 'branch', 'feat/x')).toMatchObject({
      text: 'second',
      comparedTo: 'origin/develop',
    })
  })

  it('keeps a branch and a commit of the same name apart', () => {
    store().set('/repo', 'branch', 'abc1234', 'main', 'the branch')
    store().set('/repo', 'commit', 'abc1234', 'abc1234^', 'the commit')

    expect(store().get('/repo', 'branch', 'abc1234')?.text).toBe('the branch')
    expect(store().get('/repo', 'commit', 'abc1234')?.text).toBe('the commit')
  })

  it('keeps branches and repos independent', () => {
    store().set('/repo', 'branch', 'feat/a', 'origin/main', 'A')
    store().set('/repo', 'branch', 'feat/b', 'origin/main', 'B')
    store().set('/other', 'branch', 'feat/a', 'origin/main', 'other A')

    expect(store().get('/repo', 'branch', 'feat/a')?.text).toBe('A')
    expect(store().get('/repo', 'branch', 'feat/b')?.text).toBe('B')
    expect(store().get('/other', 'branch', 'feat/a')?.text).toBe('other A')
  })

  it('clears one branch without touching the others', () => {
    store().set('/repo', 'branch', 'feat/a', 'origin/main', 'A')
    store().set('/repo', 'branch', 'feat/b', 'origin/main', 'B')

    store().clear('/repo', 'branch', 'feat/a')
    expect(store().get('/repo', 'branch', 'feat/a')).toBeUndefined()
    expect(store().get('/repo', 'branch', 'feat/b')?.text).toBe('B')
  })

  it('clearing an unknown branch is a no-op that keeps the same state', () => {
    store().set('/repo', 'branch', 'feat/a', 'origin/main', 'A')
    const before = useAiExplanationStore.getState().explanations
    store().clear('/repo', 'branch', 'nope')
    expect(useAiExplanationStore.getState().explanations).toBe(before)
  })

  it('clearAll empties the memory', () => {
    store().set('/repo', 'branch', 'feat/a', 'origin/main', 'A')
    store().set('/other', 'branch', 'feat/b', 'origin/main', 'B')

    store().clearAll()
    expect(useAiExplanationStore.getState().explanations).toEqual({})
  })
})
