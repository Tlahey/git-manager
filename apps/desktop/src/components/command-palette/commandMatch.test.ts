import { describe, it, expect } from 'vitest'
import { matchRanges, scoreCommand } from './commandMatch'

/** The ranges as a readable string, matches in brackets: `fea[t]/login`. */
function render(text: string, query: string) {
  const ranges = matchRanges(text, query)
  if (!ranges) return null
  let out = ''
  let cursor = 0
  for (const [start, end] of ranges) {
    out += text.slice(cursor, start) + '[' + text.slice(start, end) + ']'
    cursor = end
  }
  return out + text.slice(cursor)
}

describe('matchRanges', () => {
  it('finds the query as one contiguous run', () => {
    expect(render('feature/login', 'log')).toBe('feature/[log]in')
  })

  it('ignores case on both sides but keeps the original text', () => {
    expect(render('Feature/Login', 'lOg')).toBe('Feature/[Log]in')
  })

  it('matches at the start, at the end, and whole', () => {
    expect(render('main', 'ma')).toBe('[ma]in')
    expect(render('main', 'in')).toBe('ma[in]')
    expect(render('main', 'main')).toBe('[main]')
  })

  // The complaint that produced this rule: cmdk's scorer accepted any subsequence, so `ada` matched
  // a name that merely had an a, a d and an a scattered through it.
  it('refuses a scattered subsequence', () => {
    expect(matchRanges('feature/dashboard', 'ada')).toBeNull()
    expect(matchRanges('feature/login', 'flog')).toBeNull()
  })

  it('matches several words in the order they were typed, each as its own run', () => {
    expect(render('delete-remote origin/ada', 'delete ada')).toBe('[delete]-remote origin/[ada]')
  })

  it('needs every word, and in that order', () => {
    expect(matchRanges('delete-remote origin/ada', 'delete zzz')).toBeNull()
    expect(matchRanges('delete-remote origin/ada', 'ada delete')).toBeNull()
  })

  // Matched-with-nothing-to-point-at, which is not the same as no match at all.
  it('returns an empty range list for an empty query', () => {
    expect(matchRanges('main', '')).toEqual([])
    expect(matchRanges('main', '   ')).toEqual([])
  })

  it('returns null when nothing matches', () => {
    expect(matchRanges('main', 'zzz')).toBeNull()
  })
})

describe('scoreCommand — what survives', () => {
  it('keeps a row containing the query and drops one that does not', () => {
    expect(scoreCommand('checkout ada-boost', 'checkout ada')).toBeGreaterThan(0)
    expect(scoreCommand('checkout feat', 'checkout ada')).toBe(0)
  })

  it('drops a row that only matches letter by letter', () => {
    expect(scoreCommand('feature/dashboard', 'ada')).toBe(0)
  })

  it('keeps every row for an empty query', () => {
    expect(scoreCommand('anything at all', '')).toBe(1)
  })

  // A keyword match is real but invisible in the row, so it survives — below anything visible.
  it('keeps a keyword-only match, under every visible one', () => {
    const hidden = scoreCommand('Fast-forward main to a branch…', 'ff', ['branch', 'ff'])
    const visible = scoreCommand('ffmpeg-notes', 'ff')
    expect(hidden).toBeGreaterThan(0)
    expect(visible).toBeGreaterThan(hidden)
  })

  it('drops a row matching neither its label nor its keywords', () => {
    expect(scoreCommand('Merge a branch into main…', 'zzz', ['branch', 'merge'])).toBe(0)
  })
})

describe('scoreCommand — what comes first', () => {
  /** The values in the order the palette would show them for `query`, best first. */
  const ranked = (values: string[], query: string) =>
    [...values]
      .map((value) => ({ value, score: scoreCommand(value, query) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((r) => r.value)

  it('puts an exact row first, then a prefix, then a boundary, then anywhere', () => {
    expect(ranked(['readable', 'release/ada', 'ada', 'ada-boost'], 'ada')).toEqual([
      'ada', // is the query
      'ada-boost', // starts with it
      'release/ada', // starts a segment of it
      'readable', // merely contains it, mid-word
    ])
  })

  // `-` and `_` segment a name as much as `/` does, so `my-ada-lib` reads as deliberate too.
  it('treats every name separator as a boundary', () => {
    expect(scoreCommand('my-ada-lib', 'ada')).toBeGreaterThan(scoreCommand('readable', 'ada'))
  })

  // "More letters in common, higher up": within one kind of match, the query covering more of the
  // name wins — which is what makes typing more letters narrow towards what you meant.
  it('prefers the row the query covers most, all else equal', () => {
    expect(ranked(['ada-boost-rewrite', 'ada-boost', 'adage'], 'ada')).toEqual([
      'adage',
      'ada-boost',
      'ada-boost-rewrite',
    ])
  })

  // A better kind of match beats a longer one of a worse kind, however short the loser.
  it('never lets a mere containment outrank a prefix', () => {
    expect(scoreCommand('ada-boost-and-a-very-long-tail', 'ada')).toBeGreaterThan(
      scoreCommand('x/ada', 'ada')
    )
  })

  it('ranks a contiguous match above the same words found apart', () => {
    expect(scoreCommand('checkout ada-boost', 'checkout ada')).toBeGreaterThan(
      scoreCommand('checkout something else ada', 'checkout ada')
    )
  })
})
