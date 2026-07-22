import { describe, it, expect } from 'vitest'
import { activityCommandLine } from './activityCommandLine'

describe('activityCommandLine', () => {
  it('maps known repository action labels to their terminal command', () => {
    expect(activityCommandLine('git.pull')).toBe('git pull')
    expect(activityCommandLine('git.commit')).toBe('git commit')
    expect(activityCommandLine('git.autosquash')).toBe('git rebase -i --autosquash')
  })

  it('returns null for unmapped or missing labels', () => {
    expect(activityCommandLine('git.unknown')).toBeNull()
    expect(activityCommandLine(undefined)).toBeNull()
  })
})
