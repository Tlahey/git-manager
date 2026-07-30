import { describe, it, expect } from 'vitest'
import {
  ACTION_EXPLANATION_INSTRUCTION,
  MAX_LISTED_COMMANDS,
  actionExplanationFeature,
  buildActionExplanationPrompt,
  type ActionExplanationCommand,
} from './actionExplanation'

function command(
  overrides: Partial<ActionExplanationCommand> & { lines: string[] }
): ActionExplanationCommand {
  return { operation: 'stage_file', status: 'ok', ...overrides }
}

describe('ACTION_EXPLANATION_INSTRUCTION', () => {
  it('forbids the two failures that would make the feature untrustworthy', () => {
    // Inventing a command the app never ran, and teaching the app's internals as if they were git.
    expect(ACTION_EXPLANATION_INSTRUCTION).toContain('COMPLETE')
    expect(ACTION_EXPLANATION_INSTRUCTION).toMatch(/Explain \*\*git\*\*, not this application/)
  })

  it('asks for the shape the panel renders', () => {
    expect(ACTION_EXPLANATION_INSTRUCTION).toContain('Markdown')
    expect(ACTION_EXPLANATION_INSTRUCTION).toContain('Good to know')
  })
})

describe('buildActionExplanationPrompt', () => {
  it('lists the commands in order, numbered', () => {
    const prompt = buildActionExplanationPrompt({
      commands: [
        command({ lines: ['git add -- a.ts'] }),
        command({ lines: ['git commit -m x'], operation: 'create_commit' }),
      ],
    })

    expect(prompt).toContain('1. git add -- a.ts')
    expect(prompt).toContain('2. git commit -m x')
    expect(prompt.indexOf('git add')).toBeLessThan(prompt.indexOf('git commit'))
  })

  it('indents the extra lines of a multi-command operation under its number', () => {
    const prompt = buildActionExplanationPrompt({
      commands: [
        command({ lines: ['git checkout main', 'git merge --no-edit feat'], operation: 'merge_branch' }),
      ],
    })

    expect(prompt).toContain('1. git checkout main')
    expect(prompt).toContain('   git merge --no-edit feat')
  })

  it('names the action and the repository when it has them', () => {
    const prompt = buildActionExplanationPrompt({
      action: 'git.pull',
      repoName: 'git-manager',
      commands: [command({ lines: ['git pull origin'] })],
    })

    expect(prompt).toContain('Action: git.pull')
    expect(prompt).toContain('Repository: git-manager')
  })

  it('omits the lines it has nothing to put on them', () => {
    const prompt = buildActionExplanationPrompt({ commands: [command({ lines: ['git reset'] })] })

    expect(prompt).not.toContain('Action:')
    expect(prompt).not.toContain('Repository:')
  })

  it('asks for the requested language, defaulting to English', () => {
    expect(
      buildActionExplanationPrompt({ language: 'fr', commands: [command({ lines: ['git reset'] })] })
    ).toContain('in French')
    expect(buildActionExplanationPrompt({ commands: [command({ lines: ['git reset'] })] })).toContain(
      'in English'
    )
  })

  it('reports a failed command as failed, with its error, instead of its operation name', () => {
    const prompt = buildActionExplanationPrompt({
      commands: [
        command({
          lines: ['git commit -m x'],
          operation: 'create_commit',
          status: 'error',
          error: 'nothing to commit',
        }),
      ],
    })

    expect(prompt).toContain('→ FAILED: nothing to commit')
  })

  it('passes the operation name as context on a successful command', () => {
    const prompt = buildActionExplanationPrompt({
      commands: [command({ lines: ['git add -A'], operation: 'stage_all' })],
    })

    expect(prompt).toContain('(app operation: stage_all)')
  })

  it('caps a long action and says how many it did not print', () => {
    // Staging thirty files one by one is thirty operations; listing them all would spend the answer
    // on repetition.
    const prompt = buildActionExplanationPrompt({
      commands: Array.from({ length: 30 }, (_, i) => command({ lines: [`git add -- f${i}.ts`] })),
    })

    expect(prompt).toContain(`${MAX_LISTED_COMMANDS}. git add -- f${MAX_LISTED_COMMANDS - 1}.ts`)
    expect(prompt).not.toContain('git add -- f12.ts')
    expect(prompt).toContain('…and 18 more commands')
    expect(prompt).toContain('30 times in total')
  })

  it('says nothing about omissions when everything fitted', () => {
    const prompt = buildActionExplanationPrompt({
      commands: [command({ lines: ['git add -A'] })],
    })

    expect(prompt).not.toContain('more command')
    expect(prompt).not.toContain('in total')
  })

  it('still carries one command when the window is far too small for the list', () => {
    // A tiny window must not produce a prompt asking the model to explain nothing.
    const prompt = buildActionExplanationPrompt({
      contextTokens: 1,
      commands: [
        command({ lines: ['git add -- a.ts'] }),
        command({ lines: ['git add -- b.ts'] }),
      ],
    })

    expect(prompt).toContain('1. git add -- a.ts')
    expect(prompt).not.toContain('git add -- b.ts')
    expect(prompt).toContain('…and 1 more command')
  })

  it('fits more commands into a larger window', () => {
    // Paths long enough that the list, not the cap, is what the window decides.
    const commands = Array.from({ length: 8 }, (_, i) =>
      command({ lines: [`git add -- ${'x'.repeat(1200)}${i}.ts`] })
    )

    const tight = buildActionExplanationPrompt({ contextTokens: 4096, commands })
    const roomy = buildActionExplanationPrompt({ contextTokens: 32000, commands })
    expect(roomy.length).toBeGreaterThan(tight.length)
    expect(tight).toContain('more command')
    expect(roomy).not.toContain('more command')
  })
})

describe('actionExplanationFeature', () => {
  it('is a streaming feature with a reproducible temperature', () => {
    expect(actionExplanationFeature.kind).toBe('streaming')
    expect(actionExplanationFeature.id).toBe('action-explanation')
    expect(actionExplanationFeature.temperature).toBeLessThanOrEqual(0.2)
    expect(actionExplanationFeature.instruction).toBe(ACTION_EXPLANATION_INSTRUCTION)
  })
})
