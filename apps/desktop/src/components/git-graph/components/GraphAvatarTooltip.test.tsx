import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { GitGraphNode } from '@git-manager/git-types'
import { GraphAvatarTooltip, getAuthorInitials } from './GraphAvatarTooltip'
import { useSettingsStore } from '../../../stores/settings.store'

const INITIAL_SETTINGS = useSettingsStore.getState()

function node(overrides: Partial<GitGraphNode> = {}): GitGraphNode {
  return {
    commit: {
      oid: 'abc1234567890',
      shortOid: 'abc1234',
      message: 'Subject',
      subject: 'Subject line',
      body: '',
      // No email -> getAvatarUrl() returns null -> falls back to initials, which we can target
      author: { name: 'Ada Lovelace', email: '', timestamp: 0 },
      committer: { name: 'Ada Lovelace', email: '', timestamp: 0 },
      parentOids: [],
    },
    column: 0,
    color: '#2563eb',
    connections: [],
    refs: [],
    ...overrides,
  }
}

beforeEach(() => {
  useSettingsStore.setState(INITIAL_SETTINGS, true)
})

describe('getAuthorInitials', () => {
  it('takes the first letter of the first and last words', () => {
    expect(getAuthorInitials('Ada Lovelace')).toBe('AL')
    expect(getAuthorInitials('Ada King Lovelace')).toBe('AL')
  })

  it('falls back to the first two characters for single-word names', () => {
    expect(getAuthorInitials('ada')).toBe('AD')
  })
})

describe('GraphAvatarTooltip', () => {
  it('shows a name/email tooltip on hover and hides it on mouse leave', () => {
    render(<GraphAvatarTooltip node={node()} />)
    expect(screen.queryByText('ada@example.com')).not.toBeInTheDocument()

    fireEvent.mouseEnter(screen.getByText('AL'))
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument()

    fireEvent.mouseLeave(screen.getByText('AL'))
    expect(screen.queryByText('Ada Lovelace')).not.toBeInTheDocument()
  })

  it('shows a dashed archive icon instead of initials for a stash node', () => {
    const stashNode = node({
      refs: [
        { name: 'stash@{0}', shortName: 'stash@{0}', type: 'stash', commitOid: 'abc1234567890' },
      ],
    })
    const { container } = render(<GraphAvatarTooltip node={stashNode} />)
    expect(container.querySelector('.lucide-archive')).toBeTruthy()
    expect(screen.queryByText('AL')).not.toBeInTheDocument()
  })

  it('shows a flat color-filled circle instead of an avatar for a merge commit', () => {
    const mergeNode = node({
      color: '#16a34a',
      commit: { ...node().commit, parentOids: ['parent1', 'parent2'] },
    })
    const { container } = render(<GraphAvatarTooltip node={mergeNode} />)
    expect(screen.queryByText('AL')).not.toBeInTheDocument()
    const circle = container.querySelector('.pointer-events-auto > div') as HTMLElement
    expect(circle.style.backgroundColor).toBe('rgb(22, 163, 74)')
  })

  it('does not treat a normal commit (0-1 parents) as a merge', () => {
    const normalNode = node({ commit: { ...node().commit, parentOids: ['parent1'] } })
    render(<GraphAvatarTooltip node={normalNode} />)
    expect(screen.getByText('AL')).toBeInTheDocument()
  })

  it('positions itself on the natural lane center by default (column * 22 + 11)', () => {
    const { container } = render(<GraphAvatarTooltip node={node({ column: 2 })} />)
    const wrapper = container.firstElementChild as HTMLElement
    // center 55 - half of the 32px avatar = 39
    expect(wrapper.style.left).toBe('39px')
    expect(wrapper.style.opacity).toBe('')
  })

  it('honors an explicit centerX and a fractional opacity', () => {
    const { container } = render(
      <GraphAvatarTooltip node={node({ column: 5 })} centerX={90} opacity={0.64} />
    )
    const wrapper = container.firstElementChild as HTMLElement
    expect(wrapper.style.left).toBe('74px')
    expect(wrapper.style.opacity).toBe('0.64')
  })

  it('sets no opacity style when the marker is fully opaque', () => {
    const { container } = render(<GraphAvatarTooltip node={node()} opacity={1} />)
    const wrapper = container.firstElementChild as HTMLElement
    expect(wrapper.style.opacity).toBe('')
  })

  it('renders the avatar image when the email resolves to a URL, then falls back to initials on load error', () => {
    const n = node()
    n.commit.author = { name: 'Ada Lovelace', email: 'ada@example.com', timestamp: 0 }
    const { container } = render(<GraphAvatarTooltip node={n} />)
    const img = container.querySelector('img')
    expect(img).toBeTruthy()
    expect(screen.queryByText('AL')).not.toBeInTheDocument()

    fireEvent.error(img!)
    expect(screen.getByText('AL')).toBeInTheDocument()
  })

  it('uses the smaller stash icon for the small row height setting', () => {
    useSettingsStore.setState((s) => ({
      ...s,
      settings: {
        ...s.settings,
        appearance: { ...s.settings.appearance, rowHeight: 'small' as const },
      },
    }))
    const stashNode = node({
      refs: [
        { name: 'stash@{0}', shortName: 'stash@{0}', type: 'stash', commitOid: 'abc1234567890' },
      ],
    })
    const { container } = render(<GraphAvatarTooltip node={stashNode} />)
    expect(container.querySelector('.lucide-archive')).toHaveClass('h-3', 'w-3')
  })

  it('uses the smaller 24px avatar for the small row height setting', () => {
    useSettingsStore.setState((s) => ({
      ...s,
      settings: {
        ...s.settings,
        appearance: { ...s.settings.appearance, rowHeight: 'small' as const },
      },
    }))
    const { container } = render(<GraphAvatarTooltip node={node()} />)
    const wrapper = container.firstElementChild as HTMLElement
    // center 11 - half of the 24px avatar = -1
    expect(wrapper.style.left).toBe('-1px')
    expect(wrapper.style.width).toBe('24px')
  })
})
