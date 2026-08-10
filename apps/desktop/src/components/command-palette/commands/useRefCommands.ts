import { useCommandPaletteStore } from '../../../stores/commandPalette.store'
import { buildRefCommands } from './refCommandRows'
import { useBranchVerbs } from './useBranchVerbs'
import { useTagVerbs } from './useTagVerbs'
import type { PaletteCommand } from './types'

/**
 * Every ref-scoped palette command — the branch verbs then the tag ones, all under the palette's
 * single "Branches & tags" group.
 *
 * **They act on the ref you name, not on the one you are on.** The palette's repo group
 * (`useGlobalCommands`) is entirely HEAD-scoped — fetch, pull, push, stash all operate on the
 * checked-out branch — so without this hook the only thing a user could do to *another* ref from the
 * keyboard was nothing at all: the native context menus were the only way in, and merging a branch
 * or publishing a tag required a mouse.
 *
 * Split three ways because the three answer to different questions: what the branch verbs are and
 * when each is possible (`useBranchVerbs`, the only one that has to reason about HEAD), the same for
 * tags (`useTagVerbs`), and how any verb becomes rows the user can pick (`buildRefCommands`, which
 * is pure and knows about neither). The two halves are handed over *together* so that the second
 * step can find the picked verb in either — and so that the tags step aside while a branch is being
 * picked, rather than filling the list behind it.
 */
export function useRefCommands(query: string): PaletteCommand[] {
  const picker = useCommandPaletteStore((s) => s.refPicker)
  const setRefPicker = useCommandPaletteStore((s) => s.setRefPicker)
  const branchVerbs = useBranchVerbs()
  const tagVerbs = useTagVerbs()

  return buildRefCommands([...branchVerbs, ...tagVerbs], query, picker, setRefPicker)
}
