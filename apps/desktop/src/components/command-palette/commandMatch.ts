/** A half-open `[start, end)` slice of the matched text. */
export type MatchRange = [start: number, end: number]

/** Characters a name is read as being segmented by — a match starting after one reads as deliberate. */
const BOUNDARY = /[\s/\-_.:@]/

/**
 * Where `query` occurs in `text`, or `null` when it doesn't.
 *
 * **The letters have to be there as a group.** cmdk's own scorer accepts any subsequence, so `ada`
 * matches `feature/dashboard` (an *a*, a *d*, an *a*, scattered) — on a list of branch names, where
 * the query is a fragment of a name the user is half-way through typing, that is noise dressed as a
 * result. Here the whole query must appear as one contiguous run; failing that, and only when the
 * user typed several words, each word must appear as its own run *in order* — which is what makes
 * `checkout ada` find `checkout ada-boost` and also `delete ada` find `delete-remote origin/ada`.
 *
 * An empty query returns `[]`: matched, with nothing to point at. That is deliberately different
 * from `null`, so "everything matches" and "this row is out" never collapse into one value.
 *
 * Highlighting is *not* done from these ranges — `@git-manager/components`' `highlightMatch` marks
 * every contiguous occurrence of the query, which is the same rule as the first branch here and the
 * same one the board search and the settings search already use. A row kept by the several-words
 * branch alone therefore shows no highlight, like one kept by a hidden keyword: the palette points
 * at what it can point at, and never at letters that had no say in the row being listed.
 */
export function matchRanges(text: string, query: string): MatchRange[] | null {
  const needle = query.trim().toLowerCase()
  if (!needle) return []

  const haystack = text.toLowerCase()

  const whole = haystack.indexOf(needle)
  if (whole !== -1) return [[whole, whole + needle.length]]

  // Several words: each has to land, in the order they were typed. One word that didn't match above
  // has nowhere else to look, so it stops here rather than degrading into a subsequence.
  const words = needle.split(/\s+/)
  if (words.length < 2) return null

  const ranges: MatchRange[] = []
  let cursor = 0
  for (const word of words) {
    const at = haystack.indexOf(word, cursor)
    if (at === -1) return null
    ranges.push([at, at + word.length])
    cursor = at + word.length
  }
  return ranges
}

/**
 * How well `value` answers `search`, from `0` (not at all — cmdk drops the row) to `1`.
 *
 * Passed to cmdk as its `filter`, so it decides both what survives and what comes first. The order
 * it produces, best to worst:
 *
 *  1. the row *is* the query,
 *  2. the row starts with it,
 *  3. it appears at a word boundary (`origin/**ada**`, `feat-**ada**`),
 *  4. it appears anywhere,
 *  5. the words appear separately but in order,
 *  6. only a keyword matched — real, but invisible in the row, so it ranks under anything you can
 *     see for yourself.
 *
 * Within a band, the query covering more of the row wins: typing `ada` puts `ada` above `ada-boost`
 * above `feature/ada-boost-rewrite`, which is the "more letters in common, higher up" the bands
 * alone can't express. The bands are 0.2 apart and each spans 0.1, so a better kind of match always
 * beats a longer one of a worse kind — a row containing the query cannot outrank one starting with
 * it, however short.
 */
export function scoreCommand(value: string, search: string, keywords: string[] = []): number {
  const needle = search.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!needle) return 1

  const label = value.trim().toLowerCase()
  if (label === needle) return 1

  const ranges = matchRanges(label, needle)
  if (ranges && ranges.length > 0) {
    // Letters the query actually accounts for, out of the row — spaces don't count as matched.
    const coverage = Math.min(1, needle.replace(/\s+/g, '').length / Math.max(label.length, 1))
    const [start] = ranges[0]
    const contiguous = ranges.length === 1

    let band = 0.2 // the words, in order
    if (contiguous && start === 0) band = 0.8
    else if (contiguous && BOUNDARY.test(label[start - 1] ?? '')) band = 0.6
    else if (contiguous) band = 0.4

    return band + coverage * 0.1
  }

  // A keyword is a match the user cannot see in the row, so it sits under every visible one.
  return keywords.some((keyword) => matchRanges(keyword, needle)) ? 0.1 : 0
}
