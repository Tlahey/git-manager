import { describe, it, expect, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import type { GitGraphEdge } from '@git-manager/git-types'
import { GraphSvg } from './GraphSvg'
import { useSettingsStore } from '../../stores/settings.store'

const INITIAL_SETTINGS = useSettingsStore.getState()

function edge(overrides: Partial<GitGraphEdge> = {}): GitGraphEdge {
  return { fromColumn: 0, toColumn: 0, color: '#ff0000', ...overrides }
}

beforeEach(() => {
  useSettingsStore.setState(INITIAL_SETTINGS, true)
})

function renderSvg(
  props: Partial<React.ComponentProps<typeof GraphSvg>> & { connections: GitGraphEdge[] }
) {
  const { container } = render(<GraphSvg column={0} {...props} />)
  return container.querySelector('svg')!
}

describe('GraphSvg — dimensions', () => {
  it('sizes the svg from the widest column at standard row height', () => {
    const svg = renderSvg({ connections: [edge({ fromColumn: 0, toColumn: 2 })] })
    expect(svg.getAttribute('width')).toBe(String(3 * 36 + 4)) // maxCol=2 => (2+1)*36+4
    expect(svg.getAttribute('height')).toBe('40')
    expect(svg.getAttribute('viewBox')).toBe(`0 0 ${3 * 36 + 4} 40`)
  })

  it('uses a smaller row height when the "small" row-height setting is active', () => {
    useSettingsStore.setState({
      settings: {
        ...INITIAL_SETTINGS.settings,
        appearance: { ...INITIAL_SETTINGS.settings.appearance, rowHeight: 'small' },
      },
    })
    const svg = renderSvg({ connections: [] })
    expect(svg.getAttribute('height')).toBe('32')
  })

  it('renders one path per connection', () => {
    const svg = renderSvg({ connections: [edge(), edge({ toColumn: 1 }), edge({ toColumn: 2 })] })
    expect(svg.querySelectorAll('path')).toHaveLength(3)
  })

  it('applies the edge color, stroke width, and dash pattern', () => {
    const svg = renderSvg({
      connections: [edge({ color: '#123456', dashed: true, startsAtNode: true })],
    })
    const path = svg.querySelector('path')!
    expect(path.getAttribute('stroke')).toBe('#123456')
    expect(path.getAttribute('stroke-width')).toBe('2')
    expect(path.getAttribute('stroke-dasharray')).toBe('4 4')
  })

  it('omits the dash pattern for a solid edge', () => {
    const svg = renderSvg({ connections: [edge({ dashed: false })] })
    expect(svg.querySelector('path')!.getAttribute('stroke-dasharray')).toBeNull()
  })
})

describe('GraphSvg — straight vertical lines', () => {
  it('spans the full row for a plain pass-through line', () => {
    const svg = renderSvg({ connections: [edge()] })
    expect(svg.querySelector('path')!.getAttribute('d')).toBe('M 18 -2 L 18 42')
  })

  it('starts at the node center when startsAtNode is set (non-stash)', () => {
    const svg = renderSvg({ connections: [edge({ startsAtNode: true })] })
    expect(svg.querySelector('path')!.getAttribute('d')).toBe('M 18 20 L 18 42')
  })

  it('starts below the avatar when startsAtNode is set on a stash row', () => {
    const svg = renderSvg({ connections: [edge({ startsAtNode: true })], isStash: true })
    expect(svg.querySelector('path')!.getAttribute('d')).toBe('M 18 36 L 18 42')
  })

  it('ends at the node center when endsAtNode is set (non-stash)', () => {
    const svg = renderSvg({ connections: [edge({ endsAtNode: true })] })
    expect(svg.querySelector('path')!.getAttribute('d')).toBe('M 18 -2 L 18 20')
  })

  it('ends above the avatar when endsAtNode is set on a stash row', () => {
    const svg = renderSvg({ connections: [edge({ endsAtNode: true })], isStash: true })
    expect(svg.querySelector('path')!.getAttribute('d')).toBe('M 18 -2 L 18 4')
  })

  it('renders the arriving line on a stash row solid when the edge is not marked dashed', () => {
    // The line coming from above is the branch's real history passing through the stash's lane;
    // only the stash-to-base tether below carries dashed:true (set in Rust), not this segment.
    const svg = renderSvg({ connections: [edge({ endsAtNode: true, dashed: false })], isStash: true })
    expect(svg.querySelector('path')!.getAttribute('stroke-dasharray')).toBeNull()
  })

  it('does NOT dash the arriving line on a non-stash row', () => {
    const svg = renderSvg({ connections: [edge({ endsAtNode: true, dashed: false })] })
    expect(svg.querySelector('path')!.getAttribute('stroke-dasharray')).toBeNull()
  })

  it('does not dash a solid pass-through line on a stash row for an unrelated column', () => {
    const svg = renderSvg({
      connections: [edge({ fromColumn: 1, toColumn: 1, dashed: false })],
      column: 0,
      isStash: true,
    })
    expect(svg.querySelector('path')!.getAttribute('stroke-dasharray')).toBeNull()
  })

  it('draws the dashed outgoing stash tether as the bottom half below the avatar', () => {
    // Rust marks the stash's downward segment dashed; the geometry must still anchor at the
    // avatar (structural startsAtNode), not fall back to the synthetic-dashed geometry.
    const svg = renderSvg({
      connections: [edge({ startsAtNode: true, dashed: true })],
      isStash: true,
    })
    const path = svg.querySelector('path')!
    expect(path.getAttribute('d')).toBe('M 18 36 L 18 42')
    expect(path.getAttribute('stroke-dasharray')).toBe('4 4')
  })

  it('draws a dashed bridge segment arriving at the base commit to the node center', () => {
    // The base commit row is not itself a stash; the tether arrives dashed at its node center.
    const svg = renderSvg({ connections: [edge({ endsAtNode: true, dashed: true })] })
    const path = svg.querySelector('path')!
    expect(path.getAttribute('d')).toBe('M 18 -2 L 18 20')
    expect(path.getAttribute('stroke-dasharray')).toBe('4 4')
  })

  it('draws a dashed pass-through bridge segment full-height on an intermediate row', () => {
    // An unrelated commit row between the stash and its base: the bridge column (here col 1) is a
    // plain pass-through, marked dashed in Rust, spanning the whole row.
    const svg = renderSvg({
      connections: [edge({ fromColumn: 1, toColumn: 1, dashed: true })],
      column: 0,
    })
    const path = svg.querySelector('path')!
    expect(path.getAttribute('d')).toBe('M 54 -2 L 54 42')
    expect(path.getAttribute('stroke-dasharray')).toBe('4 4')
  })

  it('does NOT dash the outgoing line on a non-stash row when the edge is not marked dashed', () => {
    const svg = renderSvg({ connections: [edge({ startsAtNode: true, dashed: false })] })
    expect(svg.querySelector('path')!.getAttribute('stroke-dasharray')).toBeNull()
  })

  it('the WIP dashed line starts below the avatar', () => {
    const svg = renderSvg({ connections: [edge({ dashed: true })], isWip: true })
    expect(svg.querySelector('path')!.getAttribute('d')).toBe('M 18 36 L 18 42')
  })

  it('the HEAD dashed line ends above the avatar', () => {
    const svg = renderSvg({ connections: [edge({ dashed: true })] })
    expect(svg.querySelector('path')!.getAttribute('d')).toBe('M 18 -2 L 18 4')
  })

  it('hides a plain pass-through line on the very first row', () => {
    const svg = renderSvg({ connections: [edge()], isFirst: true })
    expect(svg.querySelector('path')!.getAttribute('d')).toBe('')
  })
})

describe('GraphSvg — diagonal transitions', () => {
  it("draws a full pass-through diagonal when neither endpoint is this row's column", () => {
    const svg = renderSvg({ connections: [edge({ fromColumn: 1, toColumn: 2 })] })
    const d = svg.querySelector('path')!.getAttribute('d')!
    expect(d).toBe('M 54 -2 L 54 12 Q 54 20, 62 20 L 82 20 Q 90 20, 90 28 L 90 42')
  })

  it("draws a split starting at this row's node", () => {
    const svg = renderSvg({ connections: [edge({ fromColumn: 0, toColumn: 1 })] })
    const d = svg.querySelector('path')!.getAttribute('d')!
    expect(d).toBe('M 18 20 L 46 20 Q 54 20, 54 28 L 54 42')
  })

  it("draws a merge ending at this row's node", () => {
    const svg = renderSvg({ connections: [edge({ fromColumn: 1, toColumn: 0 })] })
    const d = svg.querySelector('path')!.getAttribute('d')!
    expect(d).toBe('M 54 -2 L 54 12 Q 54 20, 46 20 L 18 20')
  })

  it('offsets a stash split by the avatar radius', () => {
    const svg = renderSvg({ connections: [edge({ fromColumn: 0, toColumn: 1 })], isStash: true })
    const d = svg.querySelector('path')!.getAttribute('d')!
    expect(d).toBe('M 34 20 L 46 20 Q 54 20, 54 28 L 54 42') // xStart = 18 + 16 (avatarRadius)
  })

  it('offsets a stash merge by the avatar radius', () => {
    const svg = renderSvg({ connections: [edge({ fromColumn: 1, toColumn: 0 })], isStash: true })
    const d = svg.querySelector('path')!.getAttribute('d')!
    expect(d).toBe('M 54 -2 L 54 12 Q 54 20, 46 20 L 34 20') // xEnd = 18 + 16
  })

  it('renders a diagonal merge solid on a stash row when the edge is not marked dashed', () => {
    const svg = renderSvg({
      connections: [edge({ fromColumn: 1, toColumn: 0, dashed: false })],
      isStash: true,
    })
    expect(svg.querySelector('path')!.getAttribute('stroke-dasharray')).toBeNull()
  })

  it('dashes a diagonal segment when the edge is marked dashed (e.g. a stash bridge)', () => {
    const svg = renderSvg({
      connections: [edge({ fromColumn: 0, toColumn: 1, dashed: true })],
      isStash: true,
    })
    expect(svg.querySelector('path')!.getAttribute('stroke-dasharray')).toBe('4 4')
  })

  it('hides a pass-through diagonal on the very first row', () => {
    const svg = renderSvg({ connections: [edge({ fromColumn: 1, toColumn: 2 })], isFirst: true })
    expect(svg.querySelector('path')!.getAttribute('d')).toBe('')
  })

  it('hides a merge diagonal on the very first row', () => {
    const svg = renderSvg({ connections: [edge({ fromColumn: 1, toColumn: 0 })], isFirst: true })
    expect(svg.querySelector('path')!.getAttribute('d')).toBe('')
  })

  it('still draws a split diagonal on the very first row', () => {
    const svg = renderSvg({ connections: [edge({ fromColumn: 0, toColumn: 1 })], isFirst: true })
    const d = svg.querySelector('path')!.getAttribute('d')!
    expect(d).toBe('M 18 20 L 46 20 Q 54 20, 54 28 L 54 42')
  })
})
