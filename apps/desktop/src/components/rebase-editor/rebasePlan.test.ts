import { describe, it, expect } from 'vitest'
import type { GitCommit } from '@git-manager/git-types'
import {
  initPlan,
  moveStep,
  setAction,
  rewordStep,
  combineInto,
  validatePlan,
  toTodoSteps,
} from './rebasePlan'

function commit(oid: string, subject = `subject ${oid}`): GitCommit {
  return {
    oid,
    shortOid: oid.slice(0, 7),
    message: subject,
    subject,
    body: '',
    author: { name: 'a', email: 'a@a', timestamp: 0 },
    committer: { name: 'a', email: 'a@a', timestamp: 0 },
    parentOids: [],
  }
}

const plan = () => initPlan([commit('aaaaaaa1'), commit('bbbbbbb2'), commit('ccccccc3')])

describe('initPlan', () => {
  it('picks every commit in the given order', () => {
    expect(plan().map((s) => [s.commit.oid, s.action])).toEqual([
      ['aaaaaaa1', 'pick'],
      ['bbbbbbb2', 'pick'],
      ['ccccccc3', 'pick'],
    ])
  })
})

describe('moveStep', () => {
  it('reorders and returns a new array', () => {
    const p = plan()
    const moved = moveStep(p, 2, 0)
    expect(moved.map((s) => s.commit.oid)).toEqual(['ccccccc3', 'aaaaaaa1', 'bbbbbbb2'])
    expect(p.map((s) => s.commit.oid)).toEqual(['aaaaaaa1', 'bbbbbbb2', 'ccccccc3'])
  })

  it('ignores out-of-bounds and no-op moves', () => {
    const p = plan()
    expect(moveStep(p, 1, 1)).toBe(p)
    expect(moveStep(p, -1, 0)).toBe(p)
    expect(moveStep(p, 0, 3)).toBe(p)
  })
})

describe('setAction', () => {
  it('drops the given commits and restores them to pick, clearing messages', () => {
    let p = rewordStep(plan(), 'bbbbbbb2', 'renamed')
    p = setAction(p, ['bbbbbbb2'], 'drop')
    expect(p[1].action).toBe('drop')
    p = setAction(p, ['bbbbbbb2'], 'pick')
    expect(p[1]).toMatchObject({ action: 'pick', message: undefined })
  })
})

describe('combineInto', () => {
  it('moves combined commits right below the target with the combine action', () => {
    const p = combineInto(plan(), 'aaaaaaa1', ['ccccccc3'], 'fixup')
    expect(p.map((s) => [s.commit.oid, s.action])).toEqual([
      ['aaaaaaa1', 'pick'],
      ['ccccccc3', 'fixup'],
      ['bbbbbbb2', 'pick'],
    ])
  })

  it('ignores the target inside the selection and empty selections', () => {
    const p = plan()
    expect(combineInto(p, 'aaaaaaa1', ['aaaaaaa1'], 'squash')).toBe(p)
    expect(combineInto(p, 'missing', ['bbbbbbb2'], 'squash')).toBe(p)
  })
})

describe('validatePlan', () => {
  it('accepts a plain plan', () => {
    expect(validatePlan(plan())).toBeNull()
  })

  it('rejects a squash/fixup with no picked commit before it', () => {
    let p = combineInto(plan(), 'aaaaaaa1', ['bbbbbbb2'], 'fixup')
    p = setAction(p, ['aaaaaaa1'], 'drop')
    expect(validatePlan(p)).toBe('rebaseEditor.errorLeadingSquash')
  })

  it('rejects an all-dropped plan', () => {
    const p = setAction(plan(), ['aaaaaaa1', 'bbbbbbb2', 'ccccccc3'], 'drop')
    expect(validatePlan(p)).toBe('rebaseEditor.errorAllDropped')
  })
})

describe('toTodoSteps', () => {
  it('serializes actions and trims messages', () => {
    let p = rewordStep(plan(), 'aaaaaaa1', '  new title  ')
    p = setAction(p, ['ccccccc3'], 'drop')
    expect(toTodoSteps(p)).toEqual([
      { action: 'reword', oid: 'aaaaaaa1', message: 'new title' },
      { action: 'pick', oid: 'bbbbbbb2', message: undefined },
      { action: 'drop', oid: 'ccccccc3', message: undefined },
    ])
  })
})
