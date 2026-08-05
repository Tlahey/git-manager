import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { BoardTag } from '@git-manager/git-types'
import { makeCard } from '../test/boardFactories'
import { CardMetaSidebar } from './CardMetaSidebar'

const { useAssignableUsers } = vi.hoisted(() => ({
  useAssignableUsers: vi.fn(() => ({ users: [] as { login: string; avatar_url: string }[], isLoading: false })),
}))
vi.mock('../../../hooks/usePrEditCandidates', () => ({ useAssignableUsers }))

const TAGS: BoardTag[] = [
  { id: 't-bug', name: 'bug', color: '#ff0000' },
  { id: 't-ui', name: 'ui', color: '#00ff00' },
]

function renderSidebar(props: Partial<React.ComponentProps<typeof CardMetaSidebar>> = {}) {
  const onPatch = vi.fn().mockResolvedValue(undefined)
  render(
    <CardMetaSidebar
      card={makeCard()}
      tags={TAGS}
      repoPath="/repo"
      onPatch={onPatch}
      {...props}
    />
  )
  return onPatch
}

beforeEach(() => {
  useAssignableUsers.mockReturnValue({ users: [], isLoading: false })
})

describe('CardMetaSidebar — assignee', () => {
  /** An empty field is an invitation, not a fact: the value cell is the only thing the user can
   * click, so a greyed statement there leaves them nothing to aim at. */
  it('offers to assign someone when the card is unassigned', () => {
    renderSidebar()
    expect(screen.getByTestId('card-meta-assignee')).toHaveTextContent('Assign someone')
  })

  it('renders a plain name when it matches no GitHub user', () => {
    renderSidebar({ card: makeCard({ assignee: 'Antoine' }) })
    expect(screen.getByTestId('card-meta-assignee')).toHaveTextContent('Antoine')
    expect(screen.getByTestId('card-meta-assignee').querySelector('img')).toBeNull()
  })

  it('renders the avatar when the name is a known GitHub user', () => {
    useAssignableUsers.mockReturnValue({
      users: [{ login: 'ada', avatar_url: 'https://example.com/ada.png' }],
      isLoading: false,
    })
    renderSidebar({ card: makeCard({ assignee: 'ada' }) })
    expect(screen.getByTestId('card-meta-assignee').querySelector('img')).toHaveAttribute(
      'src',
      'https://example.com/ada.png'
    )
  })

  it('assigns a free-text name when no collaborator matches', async () => {
    const onPatch = renderSidebar()
    await userEvent.click(screen.getByTestId('card-meta-assignee-edit'))
    await userEvent.type(screen.getByTestId('card-assignee-search'), 'Antoine')
    await userEvent.click(screen.getByTestId('card-assignee-use-name'))
    expect(onPatch).toHaveBeenCalledWith({ assignee: 'Antoine' })
  })

  it('assigns a GitHub user from the list', async () => {
    useAssignableUsers.mockReturnValue({
      users: [{ login: 'ada', avatar_url: 'https://example.com/ada.png' }],
      isLoading: false,
    })
    const onPatch = renderSidebar()
    await userEvent.click(screen.getByTestId('card-meta-assignee-edit'))
    await userEvent.click(screen.getByTestId('card-assignee-option-ada'))
    expect(onPatch).toHaveBeenCalledWith({ assignee: 'ada' })
  })

  it('unassigns with null rather than an empty string', async () => {
    const onPatch = renderSidebar({ card: makeCard({ assignee: 'ada' }) })
    await userEvent.click(screen.getByTestId('card-meta-assignee-edit'))
    await userEvent.click(screen.getByTestId('card-assignee-clear'))
    expect(onPatch).toHaveBeenCalledWith({ assignee: null })
  })
})

describe('CardMetaSidebar — due date', () => {
  it('offers to add a deadline rather than stating there is none', () => {
    renderSidebar()
    expect(screen.getByTestId('card-meta-due-date')).toHaveTextContent('Add a due date')
    expect(screen.queryByTestId('card-due-date-input')).not.toBeInTheDocument()
  })

  it('flags a date that has passed', () => {
    renderSidebar({ card: makeCard({ dueDate: '2000-01-01' }) })
    expect(screen.getByTestId('card-due-overdue')).toHaveTextContent('2000-01-01')
  })

  /** The clear button sits beside the displayed date, not inside the editor: a native date input
   * doesn't reliably fire a change when emptied, so the editor-only button mostly didn't work. */
  it('clears the date with null, without opening the editor first', async () => {
    const onPatch = renderSidebar({ card: makeCard({ dueDate: '2030-01-01' }) })
    await userEvent.click(screen.getByTestId('card-due-date-clear'))
    expect(onPatch).toHaveBeenCalledWith({ dueDate: null })
  })

  it('offers no clear button on a closed sprint', () => {
    renderSidebar({ card: makeCard({ dueDate: '2030-01-01' }), readOnly: true })
    expect(screen.queryByTestId('card-due-date-clear')).not.toBeInTheDocument()
  })
})

describe('CardMetaSidebar — kind', () => {
  it('spells the kind out beside its glyph', () => {
    renderSidebar({ card: makeCard({ kind: 'epic' }) })
    expect(screen.getByTestId('card-meta-kind')).toHaveTextContent('Epic')
  })

  /** A task that turns out to be a bug is the normal course of events, so the kind picked at
   * creation is not frozen there. */
  it('saves a changed kind immediately', async () => {
    const onPatch = renderSidebar()
    await userEvent.click(screen.getByTestId('card-meta-kind-edit'))
    await userEvent.selectOptions(screen.getByTestId('card-kind-select'), 'bug')
    expect(onPatch).toHaveBeenCalledWith({ kind: 'bug' })
  })
})

describe('CardMetaSidebar — priority and tags', () => {
  it('shows the current priority', () => {
    renderSidebar({ card: makeCard({ priority: 'high' }) })
    expect(screen.getByTestId('card-priority-high')).toHaveTextContent('High')
  })

  it('saves a changed priority immediately', async () => {
    const onPatch = renderSidebar()
    await userEvent.click(screen.getByTestId('card-meta-priority-edit'))
    await userEvent.selectOptions(screen.getByTestId('card-priority-select'), 'low')
    expect(onPatch).toHaveBeenCalledWith({ priority: 'low' })
  })

  it('offers to add tags when the card has none', () => {
    renderSidebar()
    expect(screen.getByTestId('card-meta-tags')).toHaveTextContent('Add tags')
  })

  it('lists the card’s tags', () => {
    renderSidebar({ card: makeCard({ tagIds: ['t-bug'] }) })
    expect(screen.getByTestId('card-meta-tag-t-bug')).toHaveTextContent('bug')
  })

  it('adds a tag without dropping the ones already set', async () => {
    const onPatch = renderSidebar({ card: makeCard({ tagIds: ['t-bug'] }) })
    await userEvent.click(screen.getByTestId('card-meta-tags-edit'))
    await userEvent.click(screen.getByTestId('card-tag-option-t-ui'))
    expect(onPatch).toHaveBeenCalledWith({ tagIds: ['t-bug', 't-ui'] })
  })

  it('removes a tag that was already set', async () => {
    const onPatch = renderSidebar({ card: makeCard({ tagIds: ['t-bug', 't-ui'] }) })
    await userEvent.click(screen.getByTestId('card-meta-tags-edit'))
    await userEvent.click(screen.getByTestId('card-tag-option-t-bug'))
    expect(onPatch).toHaveBeenCalledWith({ tagIds: ['t-ui'] })
  })

  /**
   * A tag typed on a card lands on the *board*, which is what makes it an existing option for the
   * next card rather than a near-duplicate in another colour.
   *
   * The creation and the assignment are one call on purpose: writing the palette moves the board's
   * revision, which on a local board *is* the card's, so a separate patch from here would be built
   * on a revision the write just invalidated — a guaranteed conflict.
   */
  it('hands the whole create-and-assign to its caller, in one call', async () => {
    const onCreateTag = vi.fn().mockResolvedValue({ id: 'frontend', name: 'frontend', color: '#3b82f6' })
    const onPatch = renderSidebar({ onCreateTag })

    await userEvent.click(screen.getByTestId('card-meta-tags-edit'))
    await userEvent.type(screen.getByTestId('card-tag-search'), 'frontend')
    await userEvent.click(screen.getByTestId('card-tag-create'))

    expect(onCreateTag).toHaveBeenCalledWith('frontend')
    // No second write from here — that is what used to fail.
    expect(onPatch).not.toHaveBeenCalled()
  })

  it('offers no creation for a name the board already has', async () => {
    renderSidebar({ onCreateTag: vi.fn() })
    await userEvent.click(screen.getByTestId('card-meta-tags-edit'))
    await userEvent.type(screen.getByTestId('card-tag-search'), 'bug')
    expect(screen.queryByTestId('card-tag-create')).not.toBeInTheDocument()
  })
})

describe('CardMetaSidebar — read-only', () => {
  it('offers no edit pencils', () => {
    renderSidebar({ readOnly: true })
    expect(screen.queryByTestId('card-meta-assignee-edit')).not.toBeInTheDocument()
    expect(screen.queryByTestId('card-meta-priority-edit')).not.toBeInTheDocument()
    expect(screen.queryByTestId('card-meta-due-date-edit')).not.toBeInTheDocument()
  })

  it('shows a blocking reason as text rather than as a form', () => {
    renderSidebar({ card: makeCard({ blockedReason: 'Waiting on the API' }), readOnly: true })
    expect(screen.getByTestId('card-meta-blocked')).toHaveTextContent('Waiting on the API')
    expect(screen.queryByTestId('card-blocked-switch')).not.toBeInTheDocument()
  })
})
