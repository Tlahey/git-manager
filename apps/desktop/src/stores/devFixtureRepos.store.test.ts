import { describe, it, expect, beforeEach } from 'vitest'
import { useDevFixtureReposStore } from './devFixtureRepos.store'

beforeEach(() => {
  useDevFixtureReposStore.setState({ fixtures: [] })
  localStorage.clear()
})

describe('useDevFixtureReposStore', () => {
  it('starts empty', () => {
    expect(useDevFixtureReposStore.getState().fixtures).toEqual([])
  })

  it('setFixtures replaces the whole list', () => {
    const fixtures = [{ name: 'conflict', path: '/tmp/conflict', description: 'a rebase conflict' }]
    useDevFixtureReposStore.getState().setFixtures(fixtures)
    expect(useDevFixtureReposStore.getState().fixtures).toEqual(fixtures)
  })

  it('removeFixture removes only the matching path', () => {
    useDevFixtureReposStore.getState().setFixtures([
      { name: 'a', path: '/tmp/a', description: 'a' },
      { name: 'b', path: '/tmp/b', description: 'b' },
    ])
    useDevFixtureReposStore.getState().removeFixture('/tmp/a')
    expect(useDevFixtureReposStore.getState().fixtures).toEqual([{ name: 'b', path: '/tmp/b', description: 'b' }])
  })

  it('removeFixture is a no-op for an unknown path', () => {
    useDevFixtureReposStore.getState().setFixtures([{ name: 'a', path: '/tmp/a', description: 'a' }])
    useDevFixtureReposStore.getState().removeFixture('/tmp/does-not-exist')
    expect(useDevFixtureReposStore.getState().fixtures).toHaveLength(1)
  })

  it('is deliberately NOT persisted to localStorage (dev-only injected repos)', () => {
    useDevFixtureReposStore.getState().setFixtures([{ name: 'a', path: '/tmp/a', description: 'a' }])
    expect(localStorage.getItem('git-manager-dev-fixtures')).toBeNull()
    expect(localStorage.length).toBe(0)
  })
})
