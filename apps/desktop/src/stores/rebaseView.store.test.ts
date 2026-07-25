import { describe, it, expect, beforeEach } from 'vitest'
import { useRebaseViewStore } from './rebaseView.store'

beforeEach(() => {
  useRebaseViewStore.setState({ views: {} })
})

const state = () => useRebaseViewStore.getState()

describe('useRebaseViewStore', () => {
  it('starts with both panels visible everywhere', () => {
    expect(state().views).toEqual({})
  })

  it('hides the progress view for one repo only', () => {
    state().hideProgress('/repo/a')
    expect(state().views).toEqual({ '/repo/a': { progressHidden: true } })
  })

  it('tracks repos independently, so one tab hiding a panel leaves another showing it', () => {
    state().hideProgress('/repo/a')
    state().hideProgress('/repo/b')
    state().showProgress('/repo/a')
    expect(state().views).toEqual({
      '/repo/a': { progressHidden: false },
      '/repo/b': { progressHidden: true },
    })
  })

  // The two panels are dismissed separately: hiding the step rail must not take the files with it.
  it('keeps each panel flag independent for the same repo', () => {
    state().hideFiles('/repo/a')
    state().hideProgress('/repo/a')
    expect(state().views['/repo/a']).toEqual({ filesHidden: true, progressHidden: true })
    state().showFiles('/repo/a')
    expect(state().views['/repo/a']).toEqual({ filesHidden: false, progressHidden: true })
  })

  it('toggleFiles() flips the files panel from its default-visible state and back', () => {
    state().toggleFiles('/repo/a')
    expect(state().views['/repo/a']?.filesHidden).toBe(true)
    state().toggleFiles('/repo/a')
    expect(state().views['/repo/a']?.filesHidden).toBe(false)
  })

  it('reset() forgets the dismissals entirely rather than storing false', () => {
    state().hideProgress('/repo/a')
    state().hideFiles('/repo/a')
    state().reset('/repo/a')
    expect(state().views).toEqual({})
  })

  // Called on every render pass where the repo is idle, so it must not produce a new object
  // (and re-render every subscriber) when there's nothing to forget.
  it('reset() on an untouched repo keeps the same state object', () => {
    const before = state().views
    state().reset('/repo/unknown')
    expect(state().views).toBe(before)
  })
})
