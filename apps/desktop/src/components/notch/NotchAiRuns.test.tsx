import { describe, it, expect, beforeEach } from 'vitest'
import { render, act } from '@testing-library/react'
import { emptyNotchQueue } from '@git-manager/notch'
import { NotchAiRuns } from './NotchAiRuns'
import { useAiActivityStore } from '../../stores/aiActivity.store'
import { useNotchQueueStore } from '../../stores/notchQueue.store'
import { useSettingsStore } from '../../stores/settings.store'

const INITIAL_SETTINGS = useSettingsStore.getState().settings

function current() {
  return useNotchQueueStore.getState().queue.current
}

/** Begins a run inside `act`, the way the api layer's transport wrapper does. */
function begin(featureId: string, repoPath = '/Users/antoine/Workspace/git-manager') {
  let runId = 0
  act(() => {
    runId = useAiActivityStore.getState().begin(featureId, { repoPath, panel: { kind: 'working' } })
  })
  return runId
}

beforeEach(() => {
  useAiActivityStore.setState({ runs: [], progress: null })
  useNotchQueueStore.setState({ queue: emptyNotchQueue })
  useSettingsStore.setState({ settings: INITIAL_SETTINGS })
})

describe('NotchAiRuns', () => {
  it('renders no markup of its own', () => {
    const { container } = render(<NotchAiRuns />)
    expect(container).toBeEmptyDOMElement()
  })

  it('puts the model’s work on the notch', () => {
    render(<NotchAiRuns />)
    begin('file-summary')

    expect(current()?.model).toMatchObject({
      kind: 'progress',
      id: 'ai-run',
      title: 'Reading the files one by one…',
    })
  })

  it('shows even while the user is looking straight at the app', () => {
    // Deliberately duplicates the footer's busy pill: the pill is easy to miss if it isn't
    // already what you're looking at, and the close button is right there for anyone who
    // doesn't want the extra card.
    render(<NotchAiRuns />)
    begin('code-review')

    expect(current()?.model).toMatchObject({ kind: 'progress', id: 'ai-run' })
  })

  it('counts the files as the map phase advances', () => {
    render(<NotchAiRuns />)
    begin('file-summary')

    act(() => {
      useAiActivityStore
        .getState()
        .setProgress({ featureId: 'file-summary', completed: 5, total: 20 })
    })

    expect(current()?.model).toMatchObject({ ratio: 0.25, detail: '5 / 20 files' })
  })

  it('carries a way back to the panel the run came from', () => {
    render(<NotchAiRuns />)
    begin('code-review', '/repo')

    expect(current()?.route).toEqual({
      kind: 'ai-run',
      repoPath: '/repo',
      panel: { kind: 'working' },
    })
  })

  it('names the repository, not its path', () => {
    render(<NotchAiRuns />)
    begin('file-summary', '/Users/antoine/Workspace/git-manager')

    expect(current()?.model.context).toBe('git-manager')
  })

  it('is ambient — a run in flight is not worth a permanent entry in Notification Centre', () => {
    render(<NotchAiRuns />)
    begin('file-summary')

    expect(current()?.importance).toBe('ambient')
  })

  it('shows nothing when AI is switched off', () => {
    // Users who don't want AI never see AI chrome — the same rule the footer pill follows.
    useSettingsStore.setState({
      settings: { ...INITIAL_SETTINGS, ai: { ...INITIAL_SETTINGS.ai, enabled: false } },
    })
    render(<NotchAiRuns />)
    begin('file-summary')

    expect(current()).toBeNull()
  })

  it('stands aside for the commit search, which has its own card', () => {
    render(<NotchAiRuns />)
    begin('commit-relevance')

    expect(current()).toBeNull()
  })

  it('takes the card down when it unmounts', () => {
    const { unmount } = render(<NotchAiRuns />)
    begin('file-summary')
    expect(current()).not.toBeNull()

    unmount()
    expect(current()).toBeNull()
  })
})
