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
    expect(d).toBe('M 54 -2 L 54 16 Q 54 20, 58 20 L 86 20 Q 90 20, 90 24 L 90 42')
  })

  it("draws a split starting at this row's node", () => {
    const svg = renderSvg({ connections: [edge({ fromColumn: 0, toColumn: 1 })] })
    const d = svg.querySelector('path')!.getAttribute('d')!
    expect(d).toBe('M 18 20 L 50 20 Q 54 20, 54 24 L 54 42')
  })

  it("draws a merge ending at this row's node", () => {
    const svg = renderSvg({ connections: [edge({ fromColumn: 1, toColumn: 0 })] })
    const d = svg.querySelector('path')!.getAttribute('d')!
    expect(d).toBe('M 54 -2 L 54 16 Q 54 20, 50 20 L 18 20')
  })

  it('offsets a stash split by the avatar radius', () => {
    const svg = renderSvg({ connections: [edge({ fromColumn: 0, toColumn: 1 })], isStash: true })
    const d = svg.querySelector('path')!.getAttribute('d')!
    expect(d).toBe('M 34 20 L 50 20 Q 54 20, 54 24 L 54 42') // xStart = 18 + 16 (avatarRadius)
  })

  it('offsets a stash merge by the avatar radius', () => {
    const svg = renderSvg({ connections: [edge({ fromColumn: 1, toColumn: 0 })], isStash: true })
    const d = svg.querySelector('path')!.getAttribute('d')!
    expect(d).toBe('M 54 -2 L 54 16 Q 54 20, 50 20 L 34 20') // xEnd = 18 + 16
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
    expect(d).toBe('M 18 20 L 50 20 Q 54 20, 54 24 L 54 42')
  })
})
