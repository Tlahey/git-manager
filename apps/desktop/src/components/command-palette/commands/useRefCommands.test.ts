import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { GitBranch } from 'lucide-react'
import type { RefVerb } from './refCommandRows'

const { branchVerbs, tagVerbs } = vi.hoisted(() => ({
  branchVerbs: { current: [] as RefVerb[] },
  tagVerbs: { current: [] as RefVerb[] },
}))
vi.mock('./useBranchVerbs', () => ({ useBranchVerbs: () => branchVerbs.current }))
vi.mock('./useTagVerbs', () => ({ useTagVerbs: () => tagVerbs.current }))

import { useRefCommands } from './useRefCommands'
import { useCommandPaletteStore } from '../../../stores/commandPalette.store'

const verb = (name: RefVerb['verb'], word: string, refs: string[]): RefVerb => ({
  verb: name,
  title: `${word} something…`,
  words: [word],
  icon: GitBranch,
  targets: refs.map((ref) => ({ name: ref, run: vi.fn() })),
})

const ids = (cmds: { id: string }[]) => cmds.map((c) => c.id)

beforeEach(() => {
  useCommandPaletteStore.setState({ open: true, mode: 'all', refPicker: null })
  branchVerbs.current = []
  tagVerbs.current = []
})

describe('useRefCommands', () => {
  // Branches before tags: both land in one palette group, and the branch actions are the ones
  // reached daily.
  it('offers the branch verbs then the tag ones', () => {
    branchVerbs.current = [verb('checkout', 'checkout', ['feat'])]
    tagVerbs.current = [verb('pushTag', 'push-tag', ['v1.0'])]

    const { result } = renderHook(() => useRefCommands(''))

    expect(ids(result.current)).toEqual(['ref-checkout', 'ref-pushTag'])
  })

  it('is empty when neither half has anything to offer', () => {
    const { result } = renderHook(() => useRefCommands(''))
    expect(result.current).toEqual([])
  })

  // The two halves are handed over together, so the second step finds its verb in either — and the
  // other half steps aside instead of filling the list behind it.
  it.each([
    ['a branch verb', 'checkout' as const, ['ref-pick-checkout-feat']],
    ['a tag verb', 'pushTag' as const, ['ref-pick-pushTag-v1.0']],
  ])('narrows to %s alone once it is picked', (_case, picked, expected) => {
    branchVerbs.current = [verb('checkout', 'checkout', ['feat'])]
    tagVerbs.current = [verb('pushTag', 'push-tag', ['v1.0'])]
    useCommandPaletteStore.setState({ refPicker: { verb: picked, label: 'whatever' } })

    const { result } = renderHook(() => useRefCommands(''))

    expect(ids(result.current)).toEqual(expected)
  })

  it('picking a verb from a row publishes it to the store', () => {
    branchVerbs.current = [verb('checkout', 'checkout', ['feat'])]
    const { result } = renderHook(() => useRefCommands(''))

    result.current[0]!.run()

    expect(useCommandPaletteStore.getState().refPicker).toEqual({
      verb: 'checkout',
      label: 'checkout something…',
    })
  })
})
