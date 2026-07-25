import { describe, it, expect } from 'vitest'
import type { RebaseProgressStep } from '@git-manager/git-types'
import { countDoneSteps, findCurrentStep, railProgressForStatus, stepTitle } from './rebaseStepView'

function step(overrides: Partial<RebaseProgressStep> = {}): RebaseProgressStep {
  return { index: 1, action: 'pick', status: 'pending', ...overrides }
}

describe('railProgressForStatus', () => {
  it('passes the known statuses through', () => {
    expect(railProgressForStatus('done')).toBe('done')
    expect(railProgressForStatus('current')).toBe('current')
    expect(railProgressForStatus('pending')).toBe('pending')
  })

  // The status crosses IPC as a plain string; an unknown one must not be drawn as "done".
  it('degrades an unknown status to pending', () => {
    expect(railProgressForStatus('something-new')).toBe('pending')
  })
})

describe('stepTitle', () => {
  it('prefers the commit subject', () => {
    expect(stepTitle(step({ subject: 'feat: add thing' }))).toBe('feat: add thing')
  })

  it('uses the argument text of a command with no commit', () => {
    expect(stepTitle(step({ action: 'exec', subject: 'cargo test --all' }))).toBe(
      'cargo test --all'
    )
  })

  it('falls back to the command name when there is no text at all', () => {
    expect(stepTitle(step({ action: 'break' }))).toBe('break')
    expect(stepTitle(step({ action: 'pick', subject: '   ' }))).toBe('pick')
  })
})

describe('findCurrentStep / countDoneSteps', () => {
  const steps = [
    step({ index: 1, status: 'done' }),
    step({ index: 2, status: 'done' }),
    step({ index: 3, status: 'current', subject: 'the paused one' }),
    step({ index: 4, status: 'pending' }),
  ]

  it('finds the step the rebase is stopped on', () => {
    expect(findCurrentStep(steps)?.subject).toBe('the paused one')
  })

  it('returns undefined when nothing is paused', () => {
    expect(findCurrentStep([step({ status: 'pending' })])).toBeUndefined()
  })

  it('counts the replayed steps', () => {
    expect(countDoneSteps(steps)).toBe(2)
    expect(countDoneSteps([])).toBe(0)
  })
})
