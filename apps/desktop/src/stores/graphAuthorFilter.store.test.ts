import { beforeEach, describe, expect, it } from 'vitest'
import { useGraphAuthorFilterStore } from './graphAuthorFilter.store'

function reset() {
  useGraphAuthorFilterStore.setState({ selected: new Set<string>() })
}

describe('graphAuthorFilter.store', () => {
  beforeEach(reset)

  it('starts empty', () => {
    expect(useGraphAuthorFilterStore.getState().selected.size).toBe(0)
  })

  it('toggle adds then removes an email', () => {
    const { toggle } = useGraphAuthorFilterStore.getState()
    toggle('a@example.com')
    expect([...useGraphAuthorFilterStore.getState().selected]).toEqual(['a@example.com'])
    toggle('a@example.com')
    expect(useGraphAuthorFilterStore.getState().selected.size).toBe(0)
  })

  it('toggle keeps multiple distinct emails', () => {
    const { toggle } = useGraphAuthorFilterStore.getState()
    toggle('a@example.com')
    toggle('b@example.com')
    expect(useGraphAuthorFilterStore.getState().selected).toEqual(
      new Set(['a@example.com', 'b@example.com'])
    )
  })

  it('remove drops one email and is a no-op for an absent one', () => {
    const { toggle, remove } = useGraphAuthorFilterStore.getState()
    toggle('a@example.com')
    toggle('b@example.com')
    remove('a@example.com')
    expect([...useGraphAuthorFilterStore.getState().selected]).toEqual(['b@example.com'])
    const before = useGraphAuthorFilterStore.getState().selected
    remove('missing@example.com')
    // Same reference back when nothing changed.
    expect(useGraphAuthorFilterStore.getState().selected).toBe(before)
  })

  it('clear empties the selection', () => {
    const { toggle, clear } = useGraphAuthorFilterStore.getState()
    toggle('a@example.com')
    clear()
    expect(useGraphAuthorFilterStore.getState().selected.size).toBe(0)
  })

  it('toggling returns a new Set reference so subscribers re-render', () => {
    const before = useGraphAuthorFilterStore.getState().selected
    useGraphAuthorFilterStore.getState().toggle('a@example.com')
    expect(useGraphAuthorFilterStore.getState().selected).not.toBe(before)
  })
})
