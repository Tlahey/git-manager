import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { ToggleGroup, type ToggleGroupOption } from './toggle-group'

const options: ToggleGroupOption<'tree' | 'list'>[] = [
  { value: 'tree', icon: <svg data-testid="icon-tree" />, label: 'Tree structure' },
  { value: 'list', icon: <svg data-testid="icon-list" />, label: 'Flat list' },
]

function Fixture({ onValueChange }: { onValueChange?: (v: 'tree' | 'list') => void }) {
  const [value, setValue] = useState<'tree' | 'list'>('tree')
  return (
    <ToggleGroup
      value={value}
      onValueChange={(v) => {
        setValue(v)
        onValueChange?.(v)
      }}
      options={options}
    />
  )
}

describe('ToggleGroup', () => {
  it('renders one radio per option, named by its label (no raw title=)', () => {
    render(<Fixture />)
    expect(screen.getByRole('radio', { name: 'Tree structure' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Flat list' })).toBeInTheDocument()
  })

  it('marks the option matching value as checked', () => {
    render(<Fixture />)
    expect(screen.getByRole('radio', { name: 'Tree structure' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Flat list' })).not.toBeChecked()
  })

  it('shares a single name across options so they group natively', () => {
    render(<Fixture />)
    const [a, b] = screen.getAllByRole('radio') as HTMLInputElement[]
    expect(a.name).toBe(b.name)
    expect(a.name).not.toBe('')
  })

  it('fires onValueChange and flips the checked option when another is selected', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(<Fixture onValueChange={onValueChange} />)
    await user.click(screen.getByRole('radio', { name: 'Flat list' }))
    expect(onValueChange).toHaveBeenCalledWith('list')
    expect(screen.getByRole('radio', { name: 'Flat list' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Tree structure' })).not.toBeChecked()
  })

  it('hides the icon from assistive tech so only the sr-only label is announced', () => {
    render(<Fixture />)
    expect(screen.getByTestId('icon-tree').closest('[aria-hidden="true"]')).not.toBeNull()
  })

  it('respects an explicit shared name', () => {
    render(<Fixture />)
    render(<ToggleGroup value="tree" onValueChange={() => {}} options={options} name="view-mode" />)
    const radios = screen.getAllByRole('radio', { name: 'Tree structure' }) as HTMLInputElement[]
    expect(radios.at(-1)?.name).toBe('view-mode')
  })
})

const textOptions: ToggleGroupOption<'small' | 'standard'>[] = [
  { value: 'small', label: 'Small', testId: 'row-height-small' },
  { value: 'standard', label: 'Standard' },
]

describe('ToggleGroup — labelled segments', () => {
  it('renders the label as visible text when an option carries no icon', () => {
    render(<ToggleGroup value="small" onValueChange={() => {}} options={textOptions} />)
    expect(screen.getByText('Small')).toBeVisible()
    expect(screen.getByRole('radio', { name: 'Small' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Standard' })).not.toBeChecked()
  })

  it('exposes the segment through its testId, radio included', () => {
    render(<ToggleGroup value="small" onValueChange={() => {}} options={textOptions} />)
    const segment = screen.getByTestId('row-height-small')
    expect(segment.querySelector('input[type="radio"]')).toBeInTheDocument()
  })

  it('selects a labelled segment on click', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(<ToggleGroup value="small" onValueChange={onValueChange} options={textOptions} />)
    await user.click(screen.getByText('Standard'))
    expect(onValueChange).toHaveBeenCalledWith('standard')
  })

  it('fills the whole selected segment from the per-theme-corrected button tokens', () => {
    const { container } = render(
      <ToggleGroup value="small" onValueChange={() => {}} options={textOptions} />
    )
    const [selected, unselected] = Array.from(container.querySelectorAll('label'))
    expect(selected.className).toContain('bg-button')
    expect(selected.className).toContain('text-button-foreground')
    // Never the raw semantic pair, nor shadcn's `accent`: under 12px text they measure ~37Lc
    // and 46.9Lc against an APCA bronze bar of 75. Only the `--button-*` tokens are corrected
    // per theme for a filled control.
    expect(selected.className).not.toMatch(/bg-(primary|accent)\b/)
    expect(selected.className).not.toContain('text-primary-foreground')
    expect(unselected.className).not.toMatch(/\bbg-/)
  })

  it('styles selection identically whether the segments carry icons or text', () => {
    // The control has to read the same in the sidebar (icons) and in Settings (text) — the two
    // shapes may differ in padding, never in what "selected" looks like.
    const selectionClasses = (options: ToggleGroupOption<string>[], value: string) => {
      const { container, unmount } = render(
        <ToggleGroup value={value} onValueChange={() => {}} options={options} />
      )
      // Colour, weight and underline — what "selected" looks like. Sizing (`text-xs`, padding)
      // is deliberately excluded: an icon segment is allowed to be tighter than a text one.
      const states = Array.from(container.querySelectorAll('label')).map((label) =>
        label.className
          .split(/\s+/)
          .filter((c) => /^(bg-|font-|shadow-|ring-|text-(?!xs\b|sm\b|base\b|lg\b|\[))/.test(c))
          .sort()
          .join(' ')
      )
      unmount()
      return states
    }
    expect(selectionClasses(options, 'tree')).toEqual(selectionClasses(textOptions, 'small'))
  })

  it('rounds every segment inside the group, so a filled one reads as a button', () => {
    const { container } = render(
      <ToggleGroup value="small" onValueChange={() => {}} options={textOptions} />
    )
    const labels = Array.from(container.querySelectorAll('label'))
    labels.forEach((label) => expect(label.className).toContain('rounded-'))
    // The track keeps its own padding, so a segment's fill sits inside the group's border.
    expect((container.firstElementChild as HTMLElement).className).toContain('p-0.5')
  })
})

describe('ToggleGroup — disabled', () => {
  it('disables every radio while still showing which one is selected', () => {
    render(<ToggleGroup value="small" onValueChange={() => {}} options={textOptions} disabled />)
    const radios = screen.getAllByRole('radio')
    radios.forEach((radio) => expect(radio).toBeDisabled())
    expect(screen.getByRole('radio', { name: 'Small' })).toBeChecked()
  })

  it('ignores a click on another segment', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(
      <ToggleGroup value="small" onValueChange={onValueChange} options={textOptions} disabled />
    )
    await user.click(screen.getByText('Standard'))
    expect(onValueChange).not.toHaveBeenCalled()
  })

  it('drops the pointer and hover affordances, and dims the group', () => {
    const { container } = render(
      <ToggleGroup value="small" onValueChange={() => {}} options={textOptions} disabled />
    )
    expect((container.firstElementChild as HTMLElement).className).toContain('opacity-60')
    const labels = Array.from(container.querySelectorAll('label'))
    labels.forEach((label) => {
      expect(label.className).toContain('cursor-not-allowed')
      expect(label.className).not.toContain('cursor-pointer')
      expect(label.className).not.toContain('hover:')
    })
  })

  it('keeps both affordances when enabled', () => {
    const { container } = render(
      <ToggleGroup value="small" onValueChange={() => {}} options={textOptions} />
    )
    expect((container.firstElementChild as HTMLElement).className).not.toContain('opacity-60')
    const [, unselected] = Array.from(container.querySelectorAll('label'))
    expect(unselected.className).toContain('cursor-pointer')
    expect(unselected.className).toContain('hover:text-foreground')
  })
})
