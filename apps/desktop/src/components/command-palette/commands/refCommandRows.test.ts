import { describe, it, expect, vi } from 'vitest'
import { GitBranch } from 'lucide-react'
import { buildRefCommands, type RefVerb } from './refCommandRows'
import type { RefPickerVerb } from '../../../stores/commandPalette.store'

/**
 * A verb with the refs it can act on, each bound to a spy. No repository behind any of it — the
 * builder's whole job is turning descriptors into rows, and it is pure so it can be asked directly.
 */
function verb(name: RefPickerVerb, words: string[], refs: string[]): RefVerb {
  return {
    verb: name,
    title: `${words[0]} something…`,
    words,
    icon: GitBranch,
    targets: refs.map((ref) => ({ name: ref, run: vi.fn() })),
  }
}

const CHECKOUT = () => verb('checkout', ['checkout', 'switch'], ['main', 'ada-boost', 'origin/ada'])
const REBASE = () => verb('rebase', ['rebase'], ['main', 'ada-boost'])
const PUSH_TAG = () => verb('pushTag', ['push-tag'], ['v1.0', 'v2.0'])

const ids = (cmds: { id: string }[]) => cmds.map((c) => c.id)
const build = (verbs: RefVerb[], query = '', picker = null) =>
  buildRefCommands(verbs, query, picker, vi.fn())

describe('buildRefCommands — the resting list', () => {
  it('is one row per verb, naming no ref at all', () => {
    const cmds = build([CHECKOUT(), REBASE(), PUSH_TAG()])
    expect(ids(cmds)).toEqual(['ref-checkout', 'ref-rebase', 'ref-pushTag'])
  })

  it('drops a verb with nothing to act on — its second step would be empty', () => {
    const cmds = build([CHECKOUT(), verb('rebase', ['rebase'], [])])
    expect(ids(cmds)).toEqual(['ref-checkout'])
  })

  it('narrows to the second step instead of acting', () => {
    const onPick = vi.fn()
    const verbs = [CHECKOUT()]
    const row = buildRefCommands(verbs, '', null, onPick)[0]!

    expect(row.keepOpen).toBe(true)
    row.run()

    expect(onPick).toHaveBeenCalledWith({ verb: 'checkout', label: 'checkout something…' })
    expect(verbs[0]!.targets[0]!.run).not.toHaveBeenCalled()
  })

  it('offers the verb its own words to be found by', () => {
    expect(build([CHECKOUT()])[0]!.keywords).toContain('switch')
  })
})

describe('buildRefCommands — the second step', () => {
  const picking = (v: RefPickerVerb) => ({ verb: v, label: 'whatever' })

  it('lists the picked verb’s refs and nothing else', () => {
    const cmds = buildRefCommands(
      [CHECKOUT(), REBASE(), PUSH_TAG()],
      '',
      picking('rebase'),
      vi.fn()
    )
    expect(cmds.map((c) => c.title)).toEqual(['main', 'ada-boost'])
    expect(ids(cmds)).toEqual(['ref-pick-rebase-main', 'ref-pick-rebase-ada-boost'])
  })

  // The tags used to fill the list behind a branch picker, because they were built by a hook that
  // knew nothing about it. Handing every verb to one builder is what makes that impossible.
  it('contributes nothing when the picked verb is not in this list', () => {
    expect(buildRefCommands([PUSH_TAG()], '', picking('rebase'), vi.fn())).toEqual([])
  })

  it('acts on the picked ref', () => {
    const verbs = [REBASE()]
    buildRefCommands(verbs, '', picking('rebase'), vi.fn())[1]!.run()
    expect(verbs[0]!.targets[1]!.run).toHaveBeenCalledOnce()
  })

  // The row is the ref and nothing else, so the whole query applies to the whole title.
  it('marks the whole title against the whole query', () => {
    const cmds = buildRefCommands([REBASE()], 'ada', picking('rebase'), vi.fn())
    expect(cmds[1]!.highlight).toEqual({ query: 'ada' })
  })
})

// "checkout ada" used to find nothing: the resting list holds verb rows only, and a verb's own
// label does not match a ref name typed after it.
describe('buildRefCommands — naming the verb and the ref in one query', () => {
  it('spells out the command it will run, one row per ref', () => {
    const cmds = build([CHECKOUT()], 'checkout ada')
    expect(cmds.filter((c) => c.id.startsWith('ref-run-')).map((c) => c.title)).toEqual([
      'checkout main',
      'checkout ada-boost',
      'checkout origin/ada',
    ])
  })

  it('acts straight away rather than narrowing', () => {
    const verbs = [CHECKOUT()]
    const cmds = buildRefCommands(verbs, 'checkout ada', null, vi.fn())
    const row = cmds.find((c) => c.id === 'ref-run-checkout-ada-boost')!

    expect(row.keepOpen).toBeUndefined()
    row.run()
    expect(verbs[0]!.targets[1]!.run).toHaveBeenCalledOnce()
  })

  // What gets marked is the ref, against what was typed after the verb — so a match in the middle
  // of the name still shows, and the verb every row repeats never lights up.
  it('marks the ref alone, against the argument alone', () => {
    const cmds = build([CHECKOUT()], 'checkout boost')
    const row = cmds.find((c) => c.id === 'ref-run-checkout-ada-boost')!
    expect(row.highlight).toEqual({ query: 'boost', from: 'checkout '.length })
  })

  it('accepts an abbreviation and an alias of the verb', () => {
    expect(ids(build([CHECKOUT()], 'che ada'))).toContain('ref-run-checkout-ada-boost')
    expect(ids(build([CHECKOUT()], 'switch ada'))).toContain('ref-run-checkout-ada-boost')
  })

  // Ambiguity is answered by showing both verbs rather than guessing between them.
  it('offers every verb the word could name', () => {
    const cmds = build(
      [verb('deleteBranch', ['delete'], ['ada']), verb('deleteTag', ['delete-tag'], ['v1.0'])],
      'delete v1'
    )
    expect(ids(cmds).filter((id) => id.startsWith('ref-run-'))).toEqual([
      'ref-run-deleteBranch-ada',
      'ref-run-deleteTag-v1.0',
    ])
  })

  // The verb rows stay: typing the ref is one way in, clicking through is the other.
  it('keeps the verb rows alongside', () => {
    expect(ids(build([CHECKOUT()], 'checkout ada'))).toContain('ref-checkout')
  })

  // Without an argument the verb row is the answer; listing every ref here is the long list the two
  // steps exist to avoid.
  it.each([['checkout'], ['checkout '], [''], ['ada boost']])(
    'offers no inline row for %j',
    (query) => {
      expect(ids(build([CHECKOUT()], query)).filter((id) => id.startsWith('ref-run-'))).toEqual([])
    }
  )
})
