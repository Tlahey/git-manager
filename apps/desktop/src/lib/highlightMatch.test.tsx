import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { highlightMatch, normalizeForSearch } from './highlightMatch'

describe('normalizeForSearch', () => {
  it('lowercases and strips diacritics', () => {
    expect(normalizeForSearch('Personnalisation')).toBe('personnalisation')
    expect(normalizeForSearch('Éditeur')).toBe('editeur')
    expect(normalizeForSearch('Général')).toBe('general')
  })
})

describe('highlightMatch', () => {
  it('returns the plain text when the query is empty', () => {
    expect(highlightMatch('Terminal', '')).toBe('Terminal')
    expect(highlightMatch('Terminal', '   ')).toBe('Terminal')
  })

  it('returns the plain text when the query is absent from the text', () => {
    // e.g. the search matched a hidden keyword, not the visible label
    expect(highlightMatch('Notifications', 'terminal')).toBe('Notifications')
  })

  it('wraps the matched substring in a highlight mark', () => {
    const { container } = render(<div>{highlightMatch('Terminal colours', 'colour')}</div>)
    const mark = container.querySelector('mark')
    expect(mark).not.toBeNull()
    expect(mark).toHaveTextContent('colour')
    // The full label text is preserved around the highlight.
    expect(container).toHaveTextContent('Terminal colours')
  })

  it('matches accent- and case-insensitively while highlighting the original text', () => {
    const { container } = render(<div>{highlightMatch('Personnalisation', 'PERSONN')}</div>)
    const mark = container.querySelector('mark')
    expect(mark).toHaveTextContent('Person')
    expect(container).toHaveTextContent('Personnalisation')
  })

  it('highlights across an accented character in the source text', () => {
    // "Général" normalizes to "general"; searching "énér" (→ "ener") should highlight "énér".
    const { container } = render(<div>{highlightMatch('Général', 'ENER')}</div>)
    const mark = container.querySelector('mark')
    expect(mark).toHaveTextContent('énér')
  })
})
