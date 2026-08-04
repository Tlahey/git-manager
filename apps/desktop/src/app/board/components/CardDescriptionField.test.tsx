import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CardDescriptionField } from './CardDescriptionField'

vi.mock('../../../api/board/attachment.api', () => ({ saveBoardAttachment: vi.fn() }))

function renderField(props: Partial<React.ComponentProps<typeof CardDescriptionField>> = {}) {
  const onSave = vi.fn().mockResolvedValue(undefined)
  render(
    <CardDescriptionField
      description="It **overlaps** on mobile"
      onSave={onSave}
      repoPath="/repo"
      {...props}
    />
  )
  return onSave
}

describe('CardDescriptionField', () => {
  it('renders the description as markdown, not as a form', () => {
    renderField()
    expect(screen.getByText('overlaps')).toBeInTheDocument()
    expect(screen.queryByTestId('card-description-input')).not.toBeInTheDocument()
  })

  it('says when there is no description', () => {
    renderField({ description: '' })
    expect(screen.getByTestId('card-description-empty')).toBeInTheDocument()
  })

  it('opens an editor seeded with the current text', async () => {
    renderField()
    await userEvent.click(screen.getByTestId('card-description-display'))
    expect(screen.getByTestId('card-description-input')).toHaveValue('It **overlaps** on mobile')
  })

  it('saves the edit', async () => {
    const onSave = renderField({ description: 'Before' })
    await userEvent.click(screen.getByTestId('card-description-display'))
    const input = screen.getByTestId('card-description-input')
    await userEvent.clear(input)
    await userEvent.type(input, 'After')
    await userEvent.click(screen.getByTestId('card-description-save'))
    expect(onSave).toHaveBeenCalledWith('After')
  })

  it('drops the edit when cancelled', async () => {
    const onSave = renderField({ description: 'Before' })
    await userEvent.click(screen.getByTestId('card-description-display'))
    await userEvent.type(screen.getByTestId('card-description-input'), ' changed')
    await userEvent.click(screen.getByTestId('card-description-cancel'))

    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByText('Before')).toBeInTheDocument()
  })

  it('does not open the editor on a closed sprint', async () => {
    renderField({ readOnly: true })
    await userEvent.click(screen.getByTestId('card-description-display'))
    expect(screen.queryByTestId('card-description-input')).not.toBeInTheDocument()
  })

  /** The description is markdown: swallowing every click would make a link in it unfollowable. */
  it('lets a click on a link through instead of opening the editor', async () => {
    renderField({ description: '[docs](https://example.com)' })
    await userEvent.click(screen.getByRole('link', { name: 'docs' }))
    expect(screen.queryByTestId('card-description-input')).not.toBeInTheDocument()
  })

  it('lets a checkbox in the description be ticked without opening the editor', async () => {
    renderField({ description: '- [ ] a task' })
    await userEvent.click(screen.getByRole('checkbox'))
    expect(screen.queryByTestId('card-description-input')).not.toBeInTheDocument()
  })
})
