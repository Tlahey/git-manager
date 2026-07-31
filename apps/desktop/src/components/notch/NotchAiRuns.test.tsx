import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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

/** The app in the background, which is the only state this card shows in. */
function blur() {
  act(() => {
    window.dispatchEvent(new Event('blur'))
  })
}

beforeEach(() => {
  vi.spyOn(document, 'hasFocus').mockReturnValue(false)
  useAiActivityStore.setState({ runs: [], progress: null })
  useNotchQueueStore.setState({ queue: emptyNotchQueue })
  useSettingsStore.setState({ settings: INITIAL_SETTINGS })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('NotchAiRuns', () => {
  it('renders no markup of its own', () => {
    const { container } = render(<NotchAiRuns />)
    expect(container).toBeEmptyDOMElement()
  })

  it('puts the model’s work on the notch while the app is in the background', () => {
    render(<NotchAiRuns />)
    blur()
    begin('file-summary')

    expect(current()?.model).toMatchObject({
      kind: 'progress',
      id: 'ai-run',
      title: 'Reading the files one by one…',
    })
  })

  it('says nothing while the user is looking straight at the app', () => {
    // The footer's busy pill names the same feature and counts the same steps, without covering the
    // menu bar. A card duplicating it would be pure noise.
    vi.spyOn(document, 'hasFocus').mockReturnValue(true)
    render(<NotchAiRuns />)
    act(() => {
      window.dispatchEvent(new Event('focus'))
    })
    begin('code-review')

    expect(current()).toBeNull()
  })

  it('counts the files as the map phase advances', () => {
    render(<NotchAiRuns />)
    blur()
    begin('file-summary')

    act(() => {
      useAiActivityStore.getState().setProgress({ featureId: 'file-summary', completed: 5, total: 20 })
    })

    expect(current()?.model).toMatchObject({ ratio: 0.25, detail: '5 / 20 files' })
  })

  it('carries a way back to the panel the run came from', () => {
    render(<NotchAiRuns />)
    blur()
    begin('code-review', '/repo')

    expect(current()?.route).toEqual({
      kind: 'ai-run',
      repoPath: '/repo',
      panel: { kind: 'working' },
    })
  })

  it('names the repository, not its path', () => {
    render(<NotchAiRuns />)
    blur()
    begin('file-summary', '/Users/antoine/Workspace/git-manager')

    expect(current()?.model.context).toBe('git-manager')
  })

  it('is ambient — a run in flight is not worth a permanent entry in Notification Centre', () => {
    render(<NotchAiRuns />)
    blur()
    begin('file-summary')

    expect(current()?.importance).toBe('ambient')
  })

  it('shows nothing when AI is switched off', () => {
    // Users who don't want AI never see AI chrome — the same rule the footer pill follows.
    useSettingsStore.setState({
      settings: { ...INITIAL_SETTINGS, ai: { ...INITIAL_SETTINGS.ai, enabled: false } },
    })
    render(<NotchAiRuns />)
    blur()
    begin('file-summary')

    expect(current()).toBeNull()
  })

  it('stands aside for the commit search, which has its own card', () => {
    render(<NotchAiRuns />)
    blur()
    begin('commit-relevance')

    expect(current()).toBeNull()
  })

  it('takes the card down when it unmounts', () => {
    const { unmount } = render(<NotchAiRuns />)
    blur()
    begin('file-summary')
    expect(current()).not.toBeNull()

    unmount()
    expect(current()).toBeNull()
  })
})
