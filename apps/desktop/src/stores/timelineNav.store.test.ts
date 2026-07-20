import { describe, it, expect, beforeEach } from 'vitest'
import { useTimelineNavStore } from './timelineNav.store'

describe('useTimelineNavStore', () => {
  beforeEach(() => {
    useTimelineNavStore.setState({
      isOpen: false,
      repoPath: null,
      previewIndex: 0,
      previewHeadOid: null,
    })
  })

  it('opens at the given start index for a repo', () => {
    useTimelineNavStore.getState().open('/repo', 3)
    const s = useTimelineNavStore.getState()
    expect(s.isOpen).toBe(true)
    expect(s.repoPath).toBe('/repo')
    expect(s.previewIndex).toBe(3)
  })

  it('updates the preview index while scrubbing', () => {
    useTimelineNavStore.getState().open('/repo', 3)
    useTimelineNavStore.getState().setPreviewIndex(1)
    expect(useTimelineNavStore.getState().previewIndex).toBe(1)
  })

  it('publishes and clears the previewed HEAD OID', () => {
    useTimelineNavStore.getState().open('/repo', 3)
    useTimelineNavStore.getState().setPreviewHeadOid('oid1')
    expect(useTimelineNavStore.getState().previewHeadOid).toBe('oid1')
    useTimelineNavStore.getState().close()
    expect(useTimelineNavStore.getState().previewHeadOid).toBeNull()
  })

  it('resets the previewed HEAD OID when re-opening', () => {
    useTimelineNavStore.getState().open('/repo', 3)
    useTimelineNavStore.getState().setPreviewHeadOid('oid1')
    useTimelineNavStore.getState().open('/repo', 1)
    expect(useTimelineNavStore.getState().previewHeadOid).toBeNull()
  })

  it('clears the repo path and closes on close', () => {
    useTimelineNavStore.getState().open('/repo', 3)
    useTimelineNavStore.getState().close()
    const s = useTimelineNavStore.getState()
    expect(s.isOpen).toBe(false)
    expect(s.repoPath).toBeNull()
  })
})
