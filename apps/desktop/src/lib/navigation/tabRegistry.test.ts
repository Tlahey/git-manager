import { describe, it, expect, vi } from 'vitest'
import { defineTabs, renderActiveTab, type TabDef } from './tabRegistry'

type Id = 'a' | 'b'

describe('defineTabs', () => {
  it('returns the same array it was given (identity helper)', () => {
    const tabs: TabDef<Id>[] = [{ id: 'a', label: 'A', render: () => 'a-content' }]
    expect(defineTabs(tabs)).toBe(tabs)
  })
})

describe('renderActiveTab', () => {
  it('renders the content of the tab matching activeId', () => {
    const renderA = vi.fn(() => 'a-content')
    const renderB = vi.fn(() => 'b-content')
    const tabs: TabDef<Id>[] = [
      { id: 'a', label: 'A', render: renderA },
      { id: 'b', label: 'B', render: renderB },
    ]
    expect(renderActiveTab(tabs, 'b')).toBe('b-content')
    expect(renderB).toHaveBeenCalledOnce()
    expect(renderA).not.toHaveBeenCalled()
  })

  it('returns null when no tab matches activeId', () => {
    const tabs: TabDef<Id>[] = [{ id: 'a', label: 'A', render: () => 'a-content' }]
    expect(renderActiveTab(tabs, 'b' as Id)).toBeNull()
  })

  it('returns null for an empty tab list', () => {
    expect(renderActiveTab([] as TabDef<Id>[], 'a')).toBeNull()
  })
})
