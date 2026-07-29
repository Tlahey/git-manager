import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { normalizeMenuSpec, type MenuSpecNode } from '../lib/nativeMenuSpec'

const showNativeMenu = vi.fn().mockResolvedValue(undefined)
vi.mock('../api/nativeMenu.api', () => ({
  showNativeMenu: (...a: unknown[]) => showNativeMenu(...a),
}))

import { useSidebarIssueFilterMenu } from './useSidebarIssueFilterMenu'
import { DEFAULT_ISSUE_FILTERS, useIssueFiltersStore } from '../stores/issueFilters.store'

type ItemNode = Extract<MenuSpecNode, { kind: 'item' }>
const items = (nodes: MenuSpecNode[]) => nodes.filter((n): n is ItemNode => n.kind === 'item')
const item = (nodes: MenuSpecNode[], text: string) => items(nodes).find((n) => n.text === text)

const event = () =>
  ({ preventDefault: vi.fn(), stopPropagation: vi.fn() }) as unknown as React.MouseEvent

const ids = () => useIssueFiltersStore.getState().filters.map((f) => f.id)

function openMenu(
  onEdit = vi.fn(),
  target = { filter: DEFAULT_ISSUE_FILTERS[1], canMoveUp: true, canMoveDown: false }
) {
  const { result } = renderHook(() => useSidebarIssueFilterMenu(onEdit))
  act(() => result.current(event(), target))
  return { spec: normalizeMenuSpec(showNativeMenu.mock.calls.at(-1)![0]), onEdit }
}

beforeEach(() => {
  vi.clearAllMocks()
  showNativeMenu.mockResolvedValue(undefined)
  useIssueFiltersStore.setState({ filters: DEFAULT_ISSUE_FILTERS })
})

describe('useSidebarIssueFilterMenu', () => {
  it('reflects the filter’s position in the list on the move entries', () => {
    const { spec } = openMenu()
    expect(item(spec, 'Move up')!.enabled).toBe(true)
    expect(item(spec, 'Move down')!.enabled).toBe(false)
  })

  it('hands editing back to the caller, which owns the dialog', () => {
    const { spec, onEdit } = openMenu()
    act(() => item(spec, 'Edit filter')!.action!())
    expect(onEdit).toHaveBeenCalledWith(DEFAULT_ISSUE_FILTERS[1])
  })

  it('deletes the filter straight away', () => {
    const { spec } = openMenu()
    act(() => item(spec, 'Delete filter')!.action!())
    expect(ids()).toEqual(['builtin:all-open'])
  })

  it('moves the filter within the list', () => {
    const { spec } = openMenu()
    act(() => item(spec, 'Move up')!.action!())
    expect(ids()).toEqual(['builtin:mine-open', 'builtin:all-open'])
  })

  it('suppresses the browser menu so only the native one shows', () => {
    const e = event()
    const { result } = renderHook(() => useSidebarIssueFilterMenu(vi.fn()))
    act(() =>
      result.current(e, { filter: DEFAULT_ISSUE_FILTERS[0], canMoveUp: false, canMoveDown: true })
    )
    expect(e.preventDefault).toHaveBeenCalled()
    expect(e.stopPropagation).toHaveBeenCalled()
  })
})
