import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { highlightMatch } from './highlightMatch'

describe('highlightMatch', () => {
  it('returns the text unchanged when the query is empty', () => {
    expect(highlightMatch('feature-x', '')).toBe('feature-x')
    expect(highlightMatch('feature-x', '   ')).toBe('feature-x')
  })

  it('returns the text unchanged when the query does not match', () => {
    expect(highlightMatch('feature-x', 'zzz')).toBe('feature-x')
  })

  it('wraps the matched substring in a <mark>, case-insensitively', () => {
    const { container } = render(<>{highlightMatch('Feature-X', 'feat')}</>)
    const mark = container.querySelector('mark')
    expect(mark).toBeTruthy()
    expect(mark?.textContent).toBe('Feat')
    expect(container.textContent).toBe('Feature-X')
  })

  it('highlights every occurrence of the query', () => {
    const { container } = render(<>{highlightMatch('ababab', 'ab')}</>)
    expect(container.querySelectorAll('mark')).toHaveLength(3)
    expect(container.textContent).toBe('ababab')
  })

  it('preserves surrounding text around the match', () => {
    const { container } = render(<>{highlightMatch('claude/graph-merge-pr-circle', 'merge-pr')}</>)
    const mark = container.querySelector('mark')
    expect(mark?.textContent).toBe('merge-pr')
    expect(container.textContent).toBe('claude/graph-merge-pr-circle')
  })
})
