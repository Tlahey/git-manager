import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const { listeners, listen } = vi.hoisted(() => {
  const listeners = new Map<string, Set<(e: { payload: unknown }) => void>>()
  const listen = vi.fn(async (event: string, handler: (e: { payload: unknown }) => void) => {
    if (!listeners.has(event)) listeners.set(event, new Set())
    listeners.get(event)!.add(handler)
    return () => listeners.get(event)?.delete(handler)
  })
  return { listeners, listen }
})
vi.mock('@tauri-apps/api/event', () => ({ listen }))

vi.mock('../api/ai.api', () => ({
  actionExplanationService: { run: vi.fn(), cancel: vi.fn() },
}))

import { actionExplanationService } from '../api/ai.api'
import { useActionExplanation } from './useActionExplanation'
import { useActionExplanationStore } from '../stores/actionExplanation.store'
import { useSettingsStore } from '../stores/settings.store'
import type { PooledAction } from '../lib/actionPool'

const mockedRun = actionExplanationService.run as unknown as ReturnType<typeof vi.fn>

/** The request id the hook minted for the run in flight, read back off the mocked service. */
function currentRequestId(): string {
  return (mockedRun.mock.calls.at(-1)?.[2] as string) ?? 'no-run-started'
}

function emit(event: string, token?: string, requestId: string = currentRequestId()) {
  listeners.get(event)?.forEach((h) => h({ payload: { requestId, token } }))
}

function action(overrides: Partial<PooledAction> = {}): PooledAction {
  return {
    id: 'corr-1',
    label: 'git.commit',
    titleKey: 'gitCommand.action.commit',
    family: 'commit',
    repoPath: '/repo/demo',
    startTimestamp: 1_000,
    totalDurationMs: 42,
    status: 'ok',
    commands: [
      {
        entryId: 'e1',
        command: 'stage_all',
        titleKey: 'gitCommand.stageAll',
        family: 'staging',
        lines: ['git add -A'],
        status: 'ok',
        timestamp: 1_000,
        durationMs: 12,
      },
      {
        entryId: 'e2',
        command: 'create_commit',
        titleKey: 'gitCommand.commit',
        family: 'commit',
        lines: [`git commit -m 'feat: x'`],
        status: 'ok',
        timestamp: 1_010,
        durationMs: 30,
      },
    ],
    ...overrides,
  }
}

async function generate(explain: () => Promise<void>, text = 'It staged and committed.') {
  await act(async () => {
    await explain()
  })
  await act(async () => {
    emit('ai:token', text)
    emit('ai:done')
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  listeners.clear()
  useActionExplanationStore.setState({ explanations: {} })
  mockedRun.mockResolvedValue(undefined)
})

describe('useActionExplanation', () => {
  it('sends the action, the repo name and every command in execution order', async () => {
    const { result } = renderHook(() => useActionExplanation(action()))

    await act(async () => result.current.explain())

    expect(mockedRun).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'git.commit',
        repoName: 'demo',
        commands: [
          { lines: ['git add -A'], operation: 'stage_all', status: 'ok', error: undefined },
          {
            lines: [`git commit -m 'feat: x'`],
            operation: 'create_commit',
            status: 'ok',
            error: undefined,
          },
        ],
      }),
      expect.any(String)
    )
  })

  it('needs no git data at all — the commands were recorded as they ran', async () => {
    // The point of the feature's shape: one model call, no context fetch, no map phase.
    const { result } = renderHook(() => useActionExplanation(action()))
    await act(async () => result.current.explain())

    expect(mockedRun).toHaveBeenCalledTimes(1)
  })

  it('passes a failed command through with its error', async () => {
    const failing = action({
      status: 'error',
      commands: [
        {
          entryId: 'e1',
          command: 'create_commit',
          titleKey: 'gitCommand.commit',
          family: 'commit',
          lines: ['git commit -m x'],
          status: 'error',
          error: 'nothing to commit',
          timestamp: 1_000,
          durationMs: 3,
        },
      ],
    })
    const { result } = renderHook(() => useActionExplanation(failing))
    await act(async () => result.current.explain())

    expect(mockedRun.mock.calls[0]?.[1].commands[0]).toMatchObject({
      status: 'error',
      error: 'nothing to commit',
    })
  })

  it('omits the repository name for an action that targets none', async () => {
    const { result } = renderHook(() => useActionExplanation(action({ repoPath: undefined })))
    await act(async () => result.current.explain())

    expect(mockedRun.mock.calls[0]?.[1].repoName).toBeUndefined()
  })

  it("sizes the prompt against the model's declared context window", async () => {
    useSettingsStore.setState((s) => ({
      settings: { ...s.settings, ai: { ...s.settings.ai, contextTokens: 32768 } },
    }))
    const { result } = renderHook(() => useActionExplanation(action()))
    await act(async () => result.current.explain())

    expect(mockedRun.mock.calls[0]?.[1].contextTokens).toBe(32768)
  })

  it('refuses to run with no action selected, without calling the model', async () => {
    const { result } = renderHook(() => useActionExplanation(null))
    await act(async () => {
      await result.current.explain()
    })

    expect(mockedRun).not.toHaveBeenCalled()
    expect(result.current.error).toBe('AI_NO_ACTION')
  })

  it('surfaces a provider failure', async () => {
    mockedRun.mockRejectedValue(new Error('provider down'))
    const { result } = renderHook(() => useActionExplanation(action()))
    await act(async () => {
      await result.current.explain()
    })

    expect(result.current.status).toBe('error')
    expect(result.current.error).toContain('provider down')
  })
})

describe('useActionExplanation — memory', () => {
  it('remembers a completed explanation against the action id', async () => {
    const { result } = renderHook(() => useActionExplanation(action()))
    await generate(() => result.current.explain())

    expect(useActionExplanationStore.getState().get('corr-1')?.text).toBe(
      'It staged and committed.'
    )
  })

  it('serves the remembered explanation on a fresh mount, without regenerating', async () => {
    const first = renderHook(() => useActionExplanation(action()))
    await generate(() => first.result.current.explain())
    first.unmount()
    vi.clearAllMocks()

    const { result } = renderHook(() => useActionExplanation(action()))
    expect(result.current.text).toBe('It staged and committed.')
    expect(result.current.hasStored).toBe(true)
    expect(mockedRun).not.toHaveBeenCalled()
  })

  it('keeps two actions apart', async () => {
    const first = renderHook(() => useActionExplanation(action()))
    await generate(() => first.result.current.explain())

    const { result } = renderHook(() => useActionExplanation(action({ id: 'corr-2' })))
    expect(result.current.hasStored).toBe(false)
    expect(result.current.text).toBe('')
  })

  it('does not remember a stream that was cancelled half-written', async () => {
    const { result } = renderHook(() => useActionExplanation(action()))
    await act(async () => result.current.explain())
    await act(async () => {
      emit('ai:token', 'half a sen')
      emit('ai:cancelled')
    })

    expect(useActionExplanationStore.getState().get('corr-1')).toBeUndefined()
  })

  it('clear forgets it', async () => {
    const { result } = renderHook(() => useActionExplanation(action()))
    await generate(() => result.current.explain())
    act(() => result.current.clear())

    expect(useActionExplanationStore.getState().get('corr-1')).toBeUndefined()
    expect(result.current.text).toBe('')
  })
})
