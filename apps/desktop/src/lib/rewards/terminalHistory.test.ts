import { describe, it, expect } from 'vitest'
import {
  appendedCommands,
  diffHistorySources,
  sameCommands,
  sameSnapshot,
} from './terminalHistory'

describe('diffHistorySources', () => {
  it('baselines every file on the first read, crediting nothing', () => {
    const result = diffHistorySources({}, [
      { source: '.zsh_history', commands: ['git diff'] },
      { source: '.bash_history', commands: ['git log'] },
    ])
    expect(result.appended).toEqual([])
    expect(result.snapshot).toEqual({
      '.zsh_history': ['git diff'],
      '.bash_history': ['git log'],
    })
  })

  // The whole reason the snapshot is per file: merged into one list, a command appended to the live
  // zsh history lands *before* the bash block, which reads as a rewritten history and credits nobody.
  it('credits a command appended to one file while another file is unchanged', () => {
    const previous = { '.zsh_history': ['git diff'], '.bash_history': ['git log'] }
    const result = diffHistorySources(previous, [
      { source: '.zsh_history', commands: ['git diff', 'git status'] },
      { source: '.bash_history', commands: ['git log'] },
    ])
    expect(result.appended).toEqual(['git status'])
  })

  it('baselines a file it has never seen rather than crediting its contents', () => {
    const result = diffHistorySources({ '.zsh_history': ['git diff'] }, [
      { source: '.zsh_history', commands: ['git diff'] },
      { source: '.bash_history', commands: ['git log', 'git bisect start'] },
    ])
    expect(result.appended).toEqual([])
    expect(result.snapshot['.bash_history']).toEqual(['git log', 'git bisect start'])
  })

  it('keeps the snapshot of a file missing from this read', () => {
    // Absent means "empty or unreadable", which is indistinguishable from a failed read — forgetting
    // it would make its next read look entirely new.
    const previous = { '.zsh_history': ['git diff'], '.bash_history': ['git log'] }
    const result = diffHistorySources(previous, [
      { source: '.zsh_history', commands: ['git diff'] },
    ])
    expect(result.appended).toEqual([])
    expect(result.snapshot).toEqual(previous)
  })

  it('never mutates the snapshot it was given', () => {
    const previous = { '.zsh_history': ['git diff'] }
    diffHistorySources(previous, [{ source: '.zsh_history', commands: ['git diff', 'git log'] }])
    expect(previous).toEqual({ '.zsh_history': ['git diff'] })
  })
})

describe('sameSnapshot', () => {
  it('is true for two snapshots holding the same files and commands', () => {
    expect(sameSnapshot({ a: ['git log'] }, { a: ['git log'] })).toBe(true)
  })

  it('is false when a file gained a command', () => {
    expect(sameSnapshot({ a: ['git log'] }, { a: ['git log', 'git diff'] })).toBe(false)
  })

  it('is false when a file appeared', () => {
    expect(sameSnapshot({ a: ['git log'] }, { a: ['git log'], b: ['git diff'] })).toBe(false)
  })
})

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
