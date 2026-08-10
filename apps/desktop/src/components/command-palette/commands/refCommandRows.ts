import { createElement } from 'react'
import type { LucideIcon } from 'lucide-react'
import type { RefPickerStep, RefPickerVerb } from '../../../stores/commandPalette.store'
import { matchesVerb, parseVerbQuery } from './verbQuery'
import type { PaletteCommand } from './types'

/** One ref a verb can be applied to, already bound to what applying it does. */
export interface RefTarget {
  /** How the ref is named — in the row, and in the row's id. Remote-qualified where that matters. */
  name: string
  run: () => void
}

/**
 * One ref action: what it is called, what it can be applied to, and what applying it does.
 *
 * The same descriptor answers all three ways the palette offers a verb — its own row, the ref list
 * that row opens, and the `checkout ada-boost` rows typed in one breath — so a verb cannot be
 * offered in one of them and behave differently in another. Branches and tags each build their own
 * (`useBranchVerbs`, `useTagVerbs`); {@link buildRefCommands} renders both the same way.
 */
export interface RefVerb {
  verb: RefPickerVerb
  /** Label of the verb's own row, reused as the picker's heading — see `RefPickerStep`. */
  title: string
  /**
   * What the user can type to name this verb inline, first one being what the inline rows show.
   *
   * English `git` words, deliberately not translated — the same call the French copy already makes
   * for Fetch/Push/Pull in this very palette, and these are subcommands (`git checkout`,
   * `git rebase`) before they are English. Several per verb where git itself has several.
   */
  words: string[]
  icon: LucideIcon
  /**
   * The refs this verb can act on, already gated: empty means the verb is not offered at all, which
   * is how a detached HEAD loses Merge and a repo with no tags loses every tag action.
   */
  targets: RefTarget[]
}

/**
 * The ref verbs as palette rows — branches and tags alike, since the two differ only in what they
 * put in `targets`.
 *
 * **A verb is named before its ref, and there are two ways to do it.** Listing them one row per ref
 * meant seven rows for every branch and three for every tag, and a repository of any size drowned
 * every other command in the palette. So the resting list is one row per *verb*, and a ref is named
 * afterwards — either by picking the verb's row, which narrows the palette to its refs (`keepOpen` →
 * `refPicker`), or by typing the ref straight after the verb, which puts the same refs in the list
 * as `checkout ada-boost` rows. Both run the same `RefTarget.run`.
 *
 * What bounds the group is that **nothing names a ref until the user has**: an untouched query
 * yields verbs alone, whatever the size of the repository. Both ref-bearing forms mark the match
 * *inside the ref* and never in the verb, which every row repeats — so a long list stays as quick to
 * read as it was to type, and what is marked is what you are choosing between.
 *
 * Pure, and deliberately so: everything it needs is in `verbs`, which is what lets the three row
 * shapes be tested without a repository behind them.
 */
export function buildRefCommands(
  verbs: RefVerb[],
  query: string,
  picker: RefPickerStep | null,
  onPickVerb: (step: RefPickerStep) => void
): PaletteCommand[] {
  // ── Second step: which ref the picked verb acts on ─────────────────────────
  // Nothing else is offered here — the palette is answering one question, and the query the user is
  // about to type is a ref name. `CommandPalette` drops the other groups to match; a verb list that
  // doesn't hold the picked verb (the tags, while a branch is being picked) contributes nothing.
  if (picker) {
    const step = verbs.find((v) => v.verb === picker.verb)
    if (!step) return []
    return step.targets.map((target) => ({
      id: `ref-pick-${step.verb}-${target.name}`,
      group: 'ref',
      // The heading already names the verb, so the row is the ref and nothing else — which is why
      // the whole query applies to the whole title.
      title: target.name,
      keywords: [target.name],
      icon: createElement(step.icon),
      highlight: { query },
      run: target.run,
    }))
  }

  const commands: PaletteCommand[] = []

  // ── Typing the verb and its ref in one breath ──────────────────────────────
  // "checkout ada" has to find `ada-boost`, and once found nothing at all: the resting list holds
  // verb rows only, and "Checkout a branch…" does not match a ref name typed after it. So once the
  // query names a verb *and* something else, that verb's refs join the list, each row reading as the
  // command it will run — `checkout ada-boost`.
  //
  // Titling them that way is also what makes them filter correctly, and that is load-bearing rather
  // than decorative: cmdk scores its rows against the *whole* query, so only a row that spells out
  // both halves is one the user's own words can match (see `scoreCommand`, which is that filter). No
  // filtering is done here for the same reason — one filter, or rows get dropped by a rule the other
  // one can't explain.
  //
  // Only ever with an argument (see `parseVerbQuery`): a bare "checkout" leaves the verb row to do
  // its job, and putting every ref back on screen there is exactly what the two steps avoid.
  const typed = parseVerbQuery(query)
  if (typed) {
    for (const { verb, words, icon, targets } of verbs) {
      if (!matchesVerb(typed.head, words)) continue
      for (const target of targets) {
        commands.push({
          id: `ref-run-${verb}-${target.name}`,
          group: 'ref',
          title: `${words[0]} ${target.name}`,
          keywords: [target.name],
          icon: createElement(icon),
          // Only the ref is marked, and only against what was typed *after* the verb: the verb is
          // the half the user already settled, and every row in the list repeats it.
          highlight: { query: typed.rest, from: words[0].length + 1 },
          run: target.run,
        })
      }
    }
  }

  // ── The resting list: one row per verb ─────────────────────────────────────
  for (const { verb, title, words, icon, targets } of verbs) {
    // A verb with nothing to act on is not offered: its second step would be an empty list.
    if (targets.length === 0) continue
    commands.push({
      id: `ref-${verb}`,
      group: 'ref',
      title,
      // The words are what a user types for the verb, so they find its row too — "ff" has to reach
      // "Fast-forward main to a branch…" before there is an argument to go with it.
      keywords: ['branch', ...words],
      icon: createElement(icon),
      // Narrows the palette rather than acting: the ref is chosen on the next screen.
      keepOpen: true,
      run: () => onPickVerb({ verb, label: title }),
    })
  }

  return commands
}
