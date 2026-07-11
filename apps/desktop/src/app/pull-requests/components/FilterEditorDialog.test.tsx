import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FilterEditorDialog, type FilterDraft } from './FilterEditorDialog'

describe('FilterEditorDialog — create mode', () => {
  it('shows the create title and starting field values', () => {
    render(<FilterEditorDialog onSave={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText('New custom filter')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('e.g. My bugfixes')).toHaveValue('')
    expect(screen.getByText('Create filter')).toBeInTheDocument()
  })

  it('disables Save until a name is entered', async () => {
    const user = userEvent.setup()
    render(<FilterEditorDialog onSave={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText('Create filter').closest('button')).toBeDisabled()
    await user.type(screen.getByPlaceholderText('e.g. My bugfixes'), 'My filter')
    expect(screen.getByText('Create filter').closest('button')).not.toBeDisabled()
  })

  it('trims whitespace from the name on save', async () => {
    const onSave = vi.fn()
    const user = userEvent.setup()
    render(<FilterEditorDialog onSave={onSave} onClose={vi.fn()} />)
    await user.type(screen.getByPlaceholderText('e.g. My bugfixes'), '  Spaced name  ')
    await user.click(screen.getByText('Create filter'))
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ name: 'Spaced name' }))
  })

  it('does not save when the name is only whitespace', async () => {
    const onSave = vi.fn()
    const user = userEvent.setup()
    render(<FilterEditorDialog onSave={onSave} onClose={vi.fn()} />)
    await user.type(screen.getByPlaceholderText('e.g. My bugfixes'), '   ')
    await user.click(screen.getByText('Create filter'))
    expect(onSave).not.toHaveBeenCalled()
  })
})

describe('FilterEditorDialog — edit mode', () => {
  const initial: FilterDraft = {
    name: 'Existing filter',
    emoji: '🐛',
    type: 'prs',
    titleContains: 'fix',
    authorContains: '',
    repo: '',
    labelContains: '',
    statuses: ['open', 'merged'],
    needsMyReview: true,
  }

  it('shows the edit title, pre-fills fields, and labels the save button "Save changes"', () => {
    render(<FilterEditorDialog initial={initial} onSave={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText('Edit filter')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('e.g. My bugfixes')).toHaveValue('Existing filter')
    expect(screen.getByPlaceholderText('e.g. bug, feat, hotfix…')).toHaveValue('fix')
    expect(screen.getByText('Save changes')).toBeInTheDocument()
  })

  it('pre-selects the active statuses', () => {
    render(<FilterEditorDialog initial={initial} onSave={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText('Open').closest('button')!.className).toContain('ring-current')
    expect(screen.getByText('Merged').closest('button')!.className).toContain('ring-current')
    expect(screen.getByText('Draft').closest('button')!.className).not.toContain('ring-current')
  })
})

describe('FilterEditorDialog — type toggle', () => {
  it('hides PR-only fields (status, needs my review) when type is Issues', async () => {
    const user = userEvent.setup()
    render(<FilterEditorDialog onSave={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText('PR status')).toBeInTheDocument()
    expect(screen.getByText('Needs my review')).toBeInTheDocument()

    await user.click(screen.getByText('Issues'))
    expect(screen.queryByText('PR status')).not.toBeInTheDocument()
    expect(screen.queryByText('Needs my review')).not.toBeInTheDocument()
  })

  it('shows PR-only fields again when switching back to Both', async () => {
    const user = userEvent.setup()
    render(<FilterEditorDialog onSave={vi.fn()} onClose={vi.fn()} />)
    await user.click(screen.getByText('Issues'))
    await user.click(screen.getByText('Both'))
    expect(screen.getByText('PR status')).toBeInTheDocument()
  })
})

describe('FilterEditorDialog — status toggles', () => {
  it('toggles a status on and off', async () => {
    const onSave = vi.fn()
    const user = userEvent.setup()
    render(<FilterEditorDialog onSave={onSave} onClose={vi.fn()} />)
    await user.type(screen.getByPlaceholderText('e.g. My bugfixes'), 'F')
    await user.click(screen.getByText('Open'))
    await user.click(screen.getByText('Create filter'))
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ statuses: ['open'] }))
  })

  it('clears all selected statuses via the Clear link', async () => {
    const user = userEvent.setup()
    render(<FilterEditorDialog onSave={vi.fn()} onClose={vi.fn()} />)
    await user.click(screen.getByText('Open'))
    await user.click(screen.getByText('Merged'))
    expect(screen.getByText('Clear')).toBeInTheDocument()
    await user.click(screen.getByText('Clear'))
    expect(screen.queryByText('Clear')).not.toBeInTheDocument()
  })
})

describe('FilterEditorDialog — needs my review toggle', () => {
  it('defaults to "any" and switches on click', async () => {
    const onSave = vi.fn()
    const user = userEvent.setup()
    render(<FilterEditorDialog onSave={onSave} onClose={vi.fn()} />)
    expect(screen.getByText('any').closest('button')!.className).toContain('bg-primary/10')

    await user.click(screen.getByText('yes'))
    expect(screen.getByText('yes').closest('button')!.className).toContain('bg-primary/10')

    await user.type(screen.getByPlaceholderText('e.g. My bugfixes'), 'F')
    await user.click(screen.getByText('Create filter'))
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ needsMyReview: true }))
  })
})

describe('FilterEditorDialog — closing', () => {
  it('calls onClose without saving via the Cancel button', async () => {
    const onSave = vi.fn()
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<FilterEditorDialog onSave={onSave} onClose={onClose} />)
    await user.click(screen.getByText('Cancel'))
    expect(onClose).toHaveBeenCalledOnce()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('calls onClose after a successful save', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<FilterEditorDialog onSave={vi.fn()} onClose={onClose} />)
    await user.type(screen.getByPlaceholderText('e.g. My bugfixes'), 'F')
    await user.click(screen.getByText('Create filter'))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
