import { create } from 'zustand'

export type CommandPaletteMode = 'all' | 'files'

/** A branch or tag action whose target is chosen in the palette's second step. */
export type RefPickerVerb =
  | 'checkout'
  | 'merge'
  | 'fastForward'
  | 'rebase'
  | 'compare'
  | 'deleteBranch'
  | 'rename'
  | 'deleteRemoteBranch'
  | 'pushTag'
  | 'deleteTag'
  | 'deleteRemoteTag'

/**
 * The ref action the palette is currently picking a target for, or `null` for the normal list.
 *
 * **Why a second step at all.** These actions used to be listed one row per ref — "Merge feat into
 * main", "Rebase main onto feat", "Checkout feat", "Push tag v1.2", … — seven rows for every branch
 * and three for every tag, which buried everything else in the palette on any repo with more than a
 * handful. The verb is the part the user knows first; the ref is what they want to search. So
 * *every* verb is one row now, and no palette entry names a single ref: the group's length is fixed
 * by the number of verbs rather than by the size of the repository.
 *
 * Checkout was held back from this at first, on the theory that "checkout feat" typed in one breath
 * was worth a row per branch. It wasn't: it is the verb with the most branches to offer, so it was
 * the worst offender. Nor was that breath lost — typing the ref straight after the verb still works,
 * it just doesn't come through this state: `buildRefCommands` answers it with rows that act
 * directly. This step is the other way in, for when the ref isn't in mind yet. What makes either as
 * fast to read is that both mark the query inside each name, and only inside the name.
 *
 * `label` is the verb entry's own translated title, carried here so the picker's heading and
 * placeholder can say what is being chosen without re-deriving the copy (and the current branch it
 * names) outside the hook that built it.
 */
export interface RefPickerStep {
  verb: RefPickerVerb
  label: string
}

/**
 * Open/close state and mode for the command palette.
 * - 'all': ⌘K — general actions, navigation, settings, file lookup
 * - 'files': ⌘P — dedicated file search
 */
interface CommandPaletteState {
  open: boolean
  mode: CommandPaletteMode
  refPicker: RefPickerStep | null
  openPalette: (mode?: CommandPaletteMode) => void
  closePalette: () => void
  toggle: (mode?: CommandPaletteMode) => void
  setRefPicker: (step: RefPickerStep | null) => void
}

export const useCommandPaletteStore = create<CommandPaletteState>((set) => ({
  open: false,
  mode: 'all',
  refPicker: null,
  // Every way in and out of the palette clears the picker: it is one step of one visit, and a
  // palette that reopened halfway through choosing a branch would be answering a question the user
  // has already walked away from.
  openPalette: (mode = 'all') => set({ open: true, mode, refPicker: null }),
  closePalette: () => set({ open: false, mode: 'all', refPicker: null }),
  toggle: (mode = 'all') =>
    set((state) => {
      if (state.open && state.mode === mode) {
        return { open: false, mode: 'all', refPicker: null }
      }
      return { open: true, mode, refPicker: null }
    }),
  setRefPicker: (step) => set({ refPicker: step }),
}))
