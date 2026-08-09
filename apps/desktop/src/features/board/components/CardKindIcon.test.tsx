import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CardKindIcon } from './CardKindIcon'

describe('CardKindIcon', () => {
  it('names each kind for a screen reader', () => {
    const { rerender } = render(<CardKindIcon kind="task" />)
    expect(screen.getByLabelText('Task')).toBeTruthy()

    rerender(<CardKindIcon kind="bug" />)
    expect(screen.getByLabelText('Bug')).toBeTruthy()

    rerender(<CardKindIcon kind="epic" />)
    expect(screen.getByLabelText('Epic')).toBeTruthy()
  })

  it('gives each kind its own testid', () => {
    render(<CardKindIcon kind="epic" />)
    expect(screen.getByTestId('card-kind-epic')).toBeTruthy()
  })

  /** Violet epic, red bug, green task — and a different glyph for each, so the kind survives a
   * reader who can't tell the three colours apart. */
  it('gives each kind its own filled tile and its own glyph', () => {
    const tileOf = (kind: 'task' | 'bug' | 'epic') => {
      const { unmount } = render(<CardKindIcon kind={kind} />)
      const tile = screen.getByTestId(`card-kind-${kind}`).firstElementChild
      const signature = `${tile?.getAttribute('class')}|${tile?.querySelector('svg')?.innerHTML}`
      unmount()
      return signature
    }
    const [task, bug, epic] = [tileOf('task'), tileOf('bug'), tileOf('epic')]
    expect(new Set([task, bug, epic]).size).toBe(3)
    expect(task).toContain('bg-green-600')
    expect(bug).toContain('bg-red-500')
    expect(epic).toContain('bg-violet-500')
  })

  /** The glyph is reversed out of the fill, which is what makes the tile read as one mark rather
   * than as a coloured square with something on it. */
  it('draws the glyph in white inside the tile', () => {
    render(<CardKindIcon kind="bug" />)
    const tile = screen.getByTestId('card-kind-bug').firstElementChild
    expect(tile?.querySelector('svg')?.getAttribute('class')).toContain('text-white')
  })

  it('spells the kind out only when asked', () => {
    const { rerender } = render(<CardKindIcon kind="bug" />)
    expect(screen.queryByText('Bug')).toBeNull()

    rerender(<CardKindIcon kind="bug" withLabel />)
    expect(screen.getByText('Bug')).toBeTruthy()
  })
})
