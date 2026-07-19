import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@git-manager/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

// cmdk + Popover internals are brittle in jsdom (same rationale as BranchCombobox.test.tsx); fake
// the primitives down to an always-open list so we can test this component's own wiring.
vi.mock('@git-manager/ui', () => ({
  cn: (...c: unknown[]) => c.filter(Boolean).join(' '),
  Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Command: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandInput: (p: { placeholder?: string }) => <input placeholder={p.placeholder} />,
  CommandList: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandEmpty: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandItem: (props: {
    children: React.ReactNode
    onSelect: () => void
    'data-testid'?: string
  }) => (
    <button type="button" onClick={props.onSelect} data-testid={props['data-testid']}>
      {props.children}
    </button>
  ),
}))

// Avatar reads the settings store for gravatar; stub it to plain initials to keep the DOM simple.
vi.mock('./components/AuthorAvatar', () => ({
  AuthorAvatar: ({ name }: { name: string }) => <span data-testid="avatar">{name[0]}</span>,
}))

import { GraphHeaderAuthorFilter } from './GraphHeaderAuthorFilter'
import { useGraphAuthorFilterStore } from '../../stores/graphAuthorFilter.store'
import type { AuthorOption } from './graphAuthors'

const authors: AuthorOption[] = [
  { email: 'alice@x.com', name: 'Alice', count: 3 },
  { email: 'bob@x.com', name: 'Bob', count: 1 },
]

beforeEach(() => {
  useGraphAuthorFilterStore.setState({ selected: new Set<string>() })
})

describe('GraphHeaderAuthorFilter', () => {
  it('renders one option per author', () => {
    render(<GraphHeaderAuthorFilter authors={authors} />)
    expect(screen.getByTestId('author-filter-option-alice@x.com')).toBeInTheDocument()
    expect(screen.getByTestId('author-filter-option-bob@x.com')).toBeInTheDocument()
  })

  it('shows no count badge and no clear/chips when nothing is selected', () => {
    render(<GraphHeaderAuthorFilter authors={authors} />)
    expect(screen.queryByTestId('author-filter-count')).toBeNull()
    expect(screen.queryByTestId('author-filter-clear')).toBeNull()
  })

  it('selecting an option adds it to the store and shows a removable chip + count', async () => {
    const user = userEvent.setup()
    render(<GraphHeaderAuthorFilter authors={authors} />)
    await user.click(screen.getByTestId('author-filter-option-alice@x.com'))

    expect(useGraphAuthorFilterStore.getState().selected).toEqual(new Set(['alice@x.com']))
    expect(screen.getByTestId('author-filter-count')).toHaveTextContent('1')
    expect(screen.getByTestId('author-filter-chip-alice@x.com')).toBeInTheDocument()
  })

  it('clicking a selected option again deselects it', async () => {
    const user = userEvent.setup()
    render(<GraphHeaderAuthorFilter authors={authors} />)
    const option = screen.getByTestId('author-filter-option-alice@x.com')
    await user.click(option)
    await user.click(option)
    expect(useGraphAuthorFilterStore.getState().selected.size).toBe(0)
  })

  it('a chip remove button removes just that author', async () => {
    const user = userEvent.setup()
    useGraphAuthorFilterStore.setState({ selected: new Set(['alice@x.com', 'bob@x.com']) })
    render(<GraphHeaderAuthorFilter authors={authors} />)
    await user.click(screen.getByTestId('author-filter-chip-remove-alice@x.com'))
    expect(useGraphAuthorFilterStore.getState().selected).toEqual(new Set(['bob@x.com']))
  })

  it('Clear filter empties the whole selection', async () => {
    const user = userEvent.setup()
    useGraphAuthorFilterStore.setState({ selected: new Set(['alice@x.com', 'bob@x.com']) })
    render(<GraphHeaderAuthorFilter authors={authors} />)
    await user.click(screen.getByTestId('author-filter-clear'))
    expect(useGraphAuthorFilterStore.getState().selected.size).toBe(0)
  })
})
