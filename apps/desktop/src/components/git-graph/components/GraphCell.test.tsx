import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { GitGraphNode, WorktreeAgentActivity } from '@git-manager/git-types'
import { GraphCell, isWipRow } from './GraphCell'
import { getGraphColumnLayout, getMarkerPlacement } from '../graphColumnSizing'
import { useSettingsStore } from '../../../stores/settings.store'

const { lastGraphSvgProps } = vi.hoisted(() => ({
  lastGraphSvgProps: { current: null as Record<string, unknown> | null },
}))
vi.mock('../GraphSvg', () => ({
  GraphSvg: (props: Record<string, unknown>) => {
    lastGraphSvgProps.current = props
    return <div data-testid="graph-svg" />
  },
}))

const INITIAL_SETTINGS = useSettingsStore.getState()
const AVATAR = 32

function node(overrides: Partial<GitGraphNode> = {}): GitGraphNode {
  return {
    commit: {
      oid: 'abc1234567890',
      shortOid: 'abc1234',
      message: 'Subject',
      subject: 'Subject line',
      body: '',
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

function renderCell(
  n: GitGraphNode,
  graphWidth: number,
  maxColumn: number,
  agentActivity?: WorktreeAgentActivity
) {
  const layout = getGraphColumnLayout(graphWidth, maxColumn, AVATAR)
  const marker = getMarkerPlacement(n.column, layout, AVATAR)
  const utils = render(
    <GraphCell
      node={n}
      refsWidth={160}
      graphWidth={graphWidth}
      layout={layout}
      marker={marker}
      avatarSize={AVATAR}
      agentActivity={agentActivity}
    />
  )
  return { ...utils, layout, marker }
}

beforeEach(() => {
  lastGraphSvgProps.current = null
  useSettingsStore.setState(INITIAL_SETTINGS, true)
})

describe('isWipRow', () => {
  it('matches the primary WIP row and per-worktree WIP rows only', () => {
    expect(isWipRow('WIP')).toBe(true)
    expect(isWipRow('WIP:/some/path')).toBe(true)
    expect(isWipRow('CONFLICT')).toBe(false)
    expect(isWipRow('abc123')).toBe(false)
  })
})

describe('GraphCell — full mode', () => {
  it('renders the connection lines and the avatar at its natural lane position', () => {
    const { container } = renderCell(node({ column: 1 }), 200, 3)
    expect(screen.getByTestId('graph-svg')).toBeInTheDocument()
    expect(lastGraphSvgProps.current).toMatchObject({ column: 1, isWip: false, isStash: false })
    const avatarWrapper = container.querySelector('.pointer-events-auto')!
      .parentElement as HTMLElement
    // laneCenterX(1) = 33, minus half the 32px avatar = 17
    expect(avatarWrapper.style.left).toBe('17px')
    expect(avatarWrapper.style.opacity).toBe('')
  })

  it('flags WIP-like rows on the svg and renders the dashed ring instead of an avatar', () => {
    const { container } = renderCell(
      node({ commit: { ...node().commit, oid: 'WIP' } }),
      200,
      3
    )
    expect(lastGraphSvgProps.current).toMatchObject({ isWip: true })
    expect(container.querySelector('.border-dashed')).toBeTruthy()
    expect(container.querySelector('.lucide-triangle-alert')).not.toBeInTheDocument()
  })

  it('renders the agent glyph and recolours the ring when an agent is working on a WIP row', () => {
    const activity: WorktreeAgentActivity = {
      path: '/repo-worktree',
      agent: 'claude',
      state: 'working',
      lastActivityMs: 1_700_000_000_000,
    }
    const { container } = renderCell(
      node({ commit: { ...node().commit, oid: 'WIP:/repo-worktree' } }),
      200,
      3,
      activity
    )
    const ring = container.querySelector('.border-dashed') as HTMLElement
    // Claude burst glyph (12 rays) sits inside the dashed ring, tinted with the agent accent.
    expect(ring.querySelectorAll('line')).toHaveLength(12)
    expect(ring.style.borderColor).toBe('rgb(217, 119, 87)') // #D97757
    // "working" pulses the ring.
    expect(ring.className).toContain('animate-pulse')
  })

  it('does not render the agent glyph on the CONFLICT ring', () => {
    const activity: WorktreeAgentActivity = {
      path: '/repo-worktree',
      agent: 'claude',
      state: 'working',
      lastActivityMs: 1_700_000_000_000,
    }
    const { container } = renderCell(
      node({ commit: { ...node().commit, oid: 'CONFLICT' } }),
      200,
      3,
      activity
    )
    expect(container.querySelector('.lucide-triangle-alert')).toBeTruthy()
    expect(container.querySelector('.border-dashed svg line')).toBeNull()
  })

  it('shows the warning triangle inside the CONFLICT ring', () => {
    const { container } = renderCell(
      node({ commit: { ...node().commit, oid: 'CONFLICT' } }),
      200,
      3
    )
    expect(container.querySelector('.lucide-triangle-alert')).toBeTruthy()
  })

  it('flags stash rows on the svg', () => {
    renderCell(
      node({
        refs: [
          { name: 'stash@{0}', shortName: 'stash@{0}', type: 'stash', commitOid: 'abc1234567890' },
        ],
      }),
      200,
      3
    )
    expect(lastGraphSvgProps.current).toMatchObject({ isStash: true })
  })
})

describe('GraphCell — overflow mode', () => {
  it('clips the connection lines at the start of the fade zone', () => {
    const { container, layout } = renderCell(node({ column: 1 }), 120, 6)
    expect(layout.mode).toBe('overflow')
    const clip = container.querySelector('.overflow-hidden') as HTMLElement
    // right offset = graphWidth - overlayStart = 120 - 72 = 48
    expect(clip.style.right).toBe('48px')
    expect(screen.getByTestId('graph-svg')).toBeInTheDocument()
  })

  it('pins an avatar past the zone end shy of the right edge, fully dimmed', () => {
    const { container, marker } = renderCell(node({ column: 5 }), 120, 6)
    expect(marker.overflowed).toBe(true)
    expect(marker.x).toBe(90) // innerWidth 112 - half avatar - 6px gap
    const avatarWrapper = container.querySelector('.pointer-events-auto')!
      .parentElement as HTMLElement
    expect(avatarWrapper.style.left).toBe(`${marker.x - AVATAR / 2}px`)
    expect(avatarWrapper.style.opacity).toBe('0.45')
  })

  it('keeps the connection lines fully opaque in wide overflow and fades them near compact', () => {
    const wide = renderCell(node({ column: 1 }), 120, 6)
    const wideClip = wide.container.querySelector('.overflow-hidden') as HTMLElement
    expect(wideClip.style.opacity).toBe('1')
    wide.unmount()

    // overlayStart 27 → linesOpacity (27 - 22) / 22 ≈ 0.23
    const narrow = renderCell(node({ column: 1 }), 75, 6)
    const narrowClip = narrow.container.querySelector('.overflow-hidden') as HTMLElement
    expect(narrowClip.style.opacity).toBe('0.23')
  })

  it('lets an avatar travel inside the zone at its natural position, partially dimmed', () => {
    const { container, marker } = renderCell(node({ column: 3 }), 120, 6)
    expect(marker.overflowed).toBe(true)
    expect(marker.x).toBe(77) // natural lane center, not yet pinned
    const avatarWrapper = container.querySelector('.pointer-events-auto')!
      .parentElement as HTMLElement
    expect(avatarWrapper.style.left).toBe(`${77 - AVATAR / 2}px`)
    expect(avatarWrapper.style.opacity).toBe('0.64')
  })

  it('renders a translucent pinned ring for an overflowing WIP row', () => {
    const wip = node({ column: 5, commit: { ...node().commit, oid: 'WIP' } })
    const { container, marker } = renderCell(wip, 120, 6)
    const ringWrapper = container.querySelector('.border-dashed')!.parentElement as HTMLElement
    expect(ringWrapper.style.left).toBe(`${marker.x - AVATAR / 2}px`)
    expect(ringWrapper.style.opacity).toBe('0.45')
  })

  it('keeps a lane that still fits at full opacity and natural position', () => {
    const { container, marker } = renderCell(node({ column: 0 }), 120, 6)
    expect(marker.overflowed).toBe(false)
    const avatarWrapper = container.querySelector('.pointer-events-auto')!
      .parentElement as HTMLElement
    expect(avatarWrapper.style.left).toBe('-5px') // laneCenterX(0)=11 - 16
    expect(avatarWrapper.style.opacity).toBe('')
  })
})

describe('GraphCell — compact mode', () => {
  it('renders no connection lines at all', () => {
    const { layout } = renderCell(node({ column: 3 }), 48, 6)
    expect(layout.mode).toBe('compact')
    expect(screen.queryByTestId('graph-svg')).not.toBeInTheDocument()
  })

  it('centers every marker in the column at full opacity', () => {
    const { container, layout } = renderCell(node({ column: 5 }), 48, 6)
    const avatarWrapper = container.querySelector('.pointer-events-auto')!
      .parentElement as HTMLElement
    expect(avatarWrapper.style.left).toBe(`${layout.innerWidth / 2 - AVATAR / 2}px`)
    expect(avatarWrapper.style.opacity).toBe('')
  })

  it('still renders the WIP dashed ring, centered', () => {
    const wip = node({ column: 2, commit: { ...node().commit, oid: 'WIP' } })
    const { container, layout } = renderCell(wip, 48, 6)
    expect(screen.queryByTestId('graph-svg')).not.toBeInTheDocument()
    const ringWrapper = container.querySelector('.border-dashed')!.parentElement as HTMLElement
    expect(ringWrapper.style.left).toBe(`${layout.innerWidth / 2 - AVATAR / 2}px`)
  })
})
