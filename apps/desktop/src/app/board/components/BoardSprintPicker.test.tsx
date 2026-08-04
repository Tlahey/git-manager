import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeBoard } from '../../../test/boardFactories'
import { BoardSprintPicker } from './BoardSprintPicker'

const sprint11 = makeBoard({ id: 'b0', name: 'Sprint 11', createdAt: '2026-01-01T00:00:00.000Z' })
const sprint12 = makeBoard({ id: 'b1', name: 'Sprint 12', createdAt: '2026-02-01T00:00:00.000Z' })
const sprint13 = makeBoard({ id: 'b2', name: 'Sprint 13', createdAt: '2026-03-01T00:00:00.000Z' })

function renderPicker(props: Partial<React.ComponentProps<typeof BoardSprintPicker>> = {}) {
  const onSelect = vi.fn()
  render(
    <BoardSprintPicker
      boards={[sprint11, sprint13, sprint12]}
      activeBoard={sprint12}
      onSelect={onSelect}
      {...props}
    />
  )
  return onSelect
}

describe('BoardSprintPicker', () => {
  it('shows the active sprint on the trigger', () => {
    renderPicker()
    expect(screen.getByTestId('board-switcher')).toHaveTextContent('Sprint 12')
  })

  it('invites picking one when none is active', () => {
    renderPicker({ activeBoard: null })
    expect(screen.getByTestId('board-switcher')).toHaveTextContent('Select a sprint')
  })

  /** Newest first: the sprint you want is nearly always the one that started last, and alphabetical
   * order would put "Sprint 10" above "Sprint 9". */
  it('lists the sprints newest first, whatever order they arrive in', async () => {
    renderPicker()
    await userEvent.click(screen.getByTestId('board-switcher'))

    // The name is the first span *inside* the row's flex-col wrapper; the second is the sub-line.
    const names = screen
      .getAllByTestId(/^board-switcher-option-/)
      .map((el) => el.querySelector('span span')?.textContent)
    expect(names).toEqual(['Sprint 13', 'Sprint 12', 'Sprint 11'])
  })

  it('selects a sprint and closes', async () => {
    const onSelect = renderPicker()
    await userEvent.click(screen.getByTestId('board-switcher'))
    await userEvent.click(screen.getByTestId('board-switcher-option-b2'))

    expect(onSelect).toHaveBeenCalledWith('b2')
    expect(screen.queryByTestId('board-switcher-option-b2')).not.toBeInTheDocument()
  })

  it('filters as you search', async () => {
    renderPicker()
    await userEvent.click(screen.getByTestId('board-switcher'))
    await userEvent.type(screen.getByTestId('board-switcher-search'), '13')

    expect(screen.getByTestId('board-switcher-option-b2')).toBeInTheDocument()
    expect(screen.queryByTestId('board-switcher-option-b1')).not.toBeInTheDocument()
  })

  it('says so when nothing matches', async () => {
    renderPicker()
    await userEvent.click(screen.getByTestId('board-switcher'))
    await userEvent.type(screen.getByTestId('board-switcher-search'), 'nope')
    expect(screen.getByTestId('board-switcher-empty')).toBeInTheDocument()
  })

  it('carries the backend and the closed state on each row’s sub-line', async () => {
    renderPicker({
      boards: [
        makeBoard({ id: 'r1', name: 'Team board', source: 'remote' }),
        makeBoard({ id: 'c1', name: 'Old sprint', closedAt: '2026-08-01T00:00:00.000Z' }),
      ],
    })
    await userEvent.click(screen.getByTestId('board-switcher'))

    expect(screen.getByTestId('board-switcher-option-r1')).toHaveTextContent('GitHub')
    expect(screen.getByTestId('board-switcher-option-c1')).toHaveTextContent('Local')
    expect(screen.getByTestId('board-switcher-option-c1')).toHaveTextContent('Closed')
  })
})
