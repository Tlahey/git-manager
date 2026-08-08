import { describe, it, expect } from 'vitest'
import { appendedCommands, sameCommands } from './terminalHistory'

describe('sameCommands', () => {
  it('is true for two equal reads', () => {
    expect(sameCommands(['git status', 'git log'], ['git status', 'git log'])).toBe(true)
  })

  it('is false when a command was appended', () => {
    expect(sameCommands(['git status'], ['git status', 'git log'])).toBe(false)
  })

  it('is false when the same commands are in a different order', () => {
    expect(sameCommands(['git status', 'git log'], ['git log', 'git status'])).toBe(false)
  })
})

describe('appendedCommands', () => {
  it('reports nothing when the history has not changed', () => {
    expect(appendedCommands(['git status', 'git log'], ['git status', 'git log'])).toEqual([])
  })

  it('reports only the commands added at the tail', () => {
    expect(
      appendedCommands(['git status', 'git log'], ['git status', 'git log', 'git diff'])
    ).toEqual(['git diff'])
  })

  it('follows the window as older commands scroll out of it', () => {
    // The backend returns a fixed-size window: two new commands push two old ones off the front.
    const previous = ['git status', 'git log', 'git add .']
    const current = ['git add .', 'git diff', 'git bisect start']
    expect(appendedCommands(previous, current)).toEqual(['git diff', 'git bisect start'])
  })

  it('treats the whole list as new when nothing was being watched yet', () => {
    expect(appendedCommands([], ['git status', 'git diff'])).toEqual(['git status', 'git diff'])
  })

  it('reports nothing when the two windows share no overlap', () => {
    // History cleared, file rewritten, or more than a window's worth of commands since the last
    // read — the app cannot tell, so it stays silent rather than unlocking a set of trophies.
    expect(appendedCommands(['git status'], ['git bisect start', 'git diff'])).toEqual([])
  })

  it('reports nothing when the history became empty', () => {
    expect(appendedCommands(['git status'], [])).toEqual([])
  })

  it('prefers the alignment yielding the fewest new commands when a repeated line is ambiguous', () => {
    // 'git status' appears twice: aligning on the first occurrence would claim the second one is
    // new. The largest overlap wins, so only the genuinely appended line is reported.
    const previous = ['git status', 'git log', 'git status']
    const current = ['git status', 'git log', 'git status', 'git diff']
    expect(appendedCommands(previous, current)).toEqual(['git diff'])
  })
})
