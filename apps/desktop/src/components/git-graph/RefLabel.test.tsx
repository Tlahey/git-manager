import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { GitRef } from '@git-manager/git-types'
import { RefLabel } from './RefLabel'
import { RefDropProvider } from './RefDropContext'
import { useRefDragStore } from '../../stores/refDrag.store'

// RefDropProvider pulls in the graph's stores via useRefDrop; stub it to a bare handler so the
// context supplies a droppable handler without wiring react-query / repo stores. Hoisted so the
// vi.mock factory can reference it safely (it runs during the hoisted static imports).
const { handleDrop } = vi.hoisted(() => ({ handleDrop: vi.fn() }))
vi.mock('../../hooks/useRefDrop', () => ({ useRefDrop: () => ({ handleDrop }) }))

/**
 * jsdom reports 0 for scrollWidth/clientWidth, so overflow never triggers by
 * default. Stub the prototype getters to simulate a name that does (or doesn't)
 * overflow its badge, matching the pattern in HoverExpandLabel.test.tsx.
 */
function stubOverflow(overflowing: boolean) {
  Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
    configurable: true,
    get: () => (overflowing ? 300 : 100),
  })
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get: () => 100,
  })
}
afterEach(() => {
  Reflect.deleteProperty(HTMLElement.prototype, 'scrollWidth')
  Reflect.deleteProperty(HTMLElement.prototype, 'clientWidth')
})

function ref(overrides: Partial<GitRef> = {}): GitRef {
  return {
    name: 'refs/heads/feature-x',
    shortName: 'feature-x',
    type: 'branch',
    commitOid: 'abc',
    ...overrides,
  }
}

describe('RefLabel — HEAD', () => {
  it('renders "HEAD" with the commit icon and emerald styling', () => {
    const { container } = render(<RefLabel gitRef={ref({ type: 'HEAD', shortName: 'HEAD' })} />)
    expect(screen.getByText('HEAD')).toBeInTheDocument()
    expect(container.querySelector('.lucide-git-commit-horizontal')).toBeTruthy()
    expect(screen.getByText('HEAD').parentElement).toHaveClass('text-emerald-300')
  })
})

describe('RefLabel — local branches', () => {
  it('colors "main" blue, shows a Check and Laptop icon', () => {
    const { container } = render(<RefLabel gitRef={ref({ shortName: 'main' })} />)
    expect(screen.getByText('main')).toBeInTheDocument()
    const badge = screen.getByText('main').parentElement!
    expect(badge.style.color).toBe('rgb(37, 99, 235)') // #2563eb
    expect(container.querySelector('.lucide-check')).toBeTruthy()
    expect(container.querySelector('.lucide-laptop')).toBeTruthy()
  })

  it('colors "master" the same blue as main', () => {
    render(<RefLabel gitRef={ref({ shortName: 'master' })} />)
    expect(screen.getByText('master').parentElement!.style.color).toBe('rgb(37, 99, 235)')
  })

  it('uses the provided color for a non-main/master branch', () => {
    render(<RefLabel gitRef={ref({ shortName: 'feature-x' })} color="#ff0000" />)
    expect(screen.getByText('feature-x').parentElement!.style.color).toBe('rgb(255, 0, 0)')
  })

  it('defaults to the same blue when no color prop is given', () => {
    render(<RefLabel gitRef={ref({ shortName: 'feature-x' })} />)
    expect(screen.getByText('feature-x').parentElement!.style.color).toBe('rgb(37, 99, 235)')
  })

  it('darkens the tinted background while hovered', () => {
    render(<RefLabel gitRef={ref({ shortName: 'feature-x' })} color="#ff0000" />)
    const badge = screen.getByTestId('ref-label-branch-feature-x')
    expect(badge.style.backgroundImage).toContain('#ff000025')
    fireEvent.mouseEnter(badge)
    expect(badge.style.backgroundImage).toContain('#ff000045')
    fireEvent.mouseLeave(badge)
    expect(badge.style.backgroundImage).toContain('#ff000025')
  })
})

describe('RefLabel — tag context-menu marker', () => {
  // The badge only marks itself with `data-ref-tag`; the row's context-menu handler reads it to open
  // the tag menu (WKWebView doesn't reliably deliver mouse events to the draggable badge itself).
  it('marks an interactive tag badge with data-ref-tag carrying its short name', () => {
    render(
      <RefLabel gitRef={ref({ type: 'tag', shortName: 'v1.0.0', name: 'refs/tags/v1.0.0' })} />
    )
    expect(screen.getByTestId('ref-label-tag-v1.0.0')).toHaveAttribute('data-ref-tag', 'v1.0.0')
  })

  it('does not mark a branch badge', () => {
    render(<RefLabel gitRef={ref({ type: 'branch', shortName: 'feature-x' })} />)
    expect(screen.getByTestId('ref-label-branch-feature-x')).not.toHaveAttribute('data-ref-tag')
  })

  it('does not mark a non-interactive (lane-hint) tag badge', () => {
    render(
      <RefLabel
        gitRef={ref({ type: 'tag', shortName: 'v1.0.0', name: 'refs/tags/v1.0.0' })}
        interactive={false}
      />
    )
    expect(screen.getByTestId('ref-label-tag-v1.0.0')).not.toHaveAttribute('data-ref-tag')
  })
})

describe('RefLabel — remote branches', () => {
  it('strips the remote prefix from the display name', () => {
    render(<RefLabel gitRef={ref({ type: 'remote', shortName: 'origin/feature-x' })} />)
    expect(screen.getByText('feature-x')).toBeInTheDocument()
  })

  it('keeps a single-segment remote name unchanged', () => {
    render(<RefLabel gitRef={ref({ type: 'remote', shortName: 'origin' })} />)
    expect(screen.getByText('origin')).toBeInTheDocument()
  })

  it('colors origin/main purple, dashed border, and shows the GitHub icon instead of Laptop', () => {
    const { container } = render(
      <RefLabel gitRef={ref({ type: 'remote', shortName: 'origin/main' })} />
    )
    const badge = screen.getByText('main').parentElement!
    expect(badge.style.color).toBe('rgb(124, 58, 237)') // #7c3aed
    expect(badge.style.borderStyle).toBe('dashed')
    expect(container.querySelector('[role="img"]')).toBeTruthy() // GithubIcon
    expect(container.querySelector('.lucide-laptop')).toBeFalsy()
  })
})

describe('RefLabel — tags', () => {
  it('shows the Tag icon and the raw short name', () => {
    const { container } = render(<RefLabel gitRef={ref({ type: 'tag', shortName: 'v1.0.0' })} />)
    expect(screen.getByText('v1.0.0')).toBeInTheDocument()
    expect(container.querySelector('.lucide-tag')).toBeTruthy()
    expect(screen.getByText('v1.0.0').parentElement).toHaveClass('opacity-90')
  })
})

describe('RefLabel — long name hover overlay', () => {
  it('reveals a full-name overlay clone when hovering an overflowing (ellipsis) badge', () => {
    stubOverflow(true)
    render(<RefLabel gitRef={ref({ type: 'tag', shortName: 'a-very-long-tag-name-1.0.0' })} />)
    const badge = screen.getByTestId('ref-label-tag-a-very-long-tag-name-1.0.0')
    expect(screen.getAllByText('a-very-long-tag-name-1.0.0')).toHaveLength(1)
    fireEvent.mouseEnter(badge)
    // Two copies now: the truncated inline badge + the fixed overlay clone.
    expect(screen.getAllByText('a-very-long-tag-name-1.0.0')).toHaveLength(2)
    fireEvent.mouseLeave(badge)
    expect(screen.getAllByText('a-very-long-tag-name-1.0.0')).toHaveLength(1)
  })

  it('shows no overlay when the label fits', () => {
    stubOverflow(false)
    render(<RefLabel gitRef={ref({ type: 'tag', shortName: 'v1.0.0' })} />)
    fireEvent.mouseEnter(screen.getByTestId('ref-label-tag-v1.0.0'))
    expect(screen.getAllByText('v1.0.0')).toHaveLength(1)
  })
})

describe('RefLabel — stash', () => {
  it('shows the Archive icon, purple color, and dashed border by default', () => {
    const { container } = render(
      <RefLabel gitRef={ref({ type: 'stash', shortName: 'stash@{0}' })} />
    )
    const badge = screen.getByText('stash@{0}').parentElement!
    expect(container.querySelector('.lucide-archive')).toBeTruthy()
    expect(badge.style.color).toBe('rgb(167, 139, 250)') // #a78bfa
    expect(badge.style.borderStyle).toBe('dashed')
  })
})

describe('RefLabel — drag and drop', () => {
  function fakeDataTransfer() {
    return { setData: vi.fn(), dropEffect: '', effectAllowed: '' } as unknown as DataTransfer
  }

  function renderPair() {
    return render(
      <RefDropProvider repoPath="/r">
        <RefLabel gitRef={ref({ shortName: 'feat', name: 'refs/heads/feat' })} />
        <RefLabel gitRef={ref({ shortName: 'main', name: 'refs/heads/main' })} />
      </RefDropProvider>
    )
  }

  beforeEach(() => {
    vi.clearAllMocks()
    useRefDragStore.setState({ draggingRef: null, hoverRef: null })
  })

  it('arms a branch badge as draggable only while the left button is held', () => {
    render(
      <RefDropProvider repoPath="/r">
        <RefLabel gitRef={ref({ shortName: 'feat' })} />
      </RefDropProvider>
    )
    const badge = screen.getByTestId('ref-label-branch-feat')
    // Inert by default: a permanently-draggable element never receives `contextmenu` in WKWebView,
    // which broke the tag right-click menu. `select-auto` (needed to drag at all) stays on.
    expect(badge).not.toHaveAttribute('draggable')
    expect(badge.className).not.toContain('[-webkit-user-drag:element]')
    expect(badge).toHaveClass('select-auto')
    // Left press arms the native drag machinery…
    fireEvent.mouseDown(badge, { button: 0 })
    expect(badge).toHaveAttribute('draggable', 'true')
    expect(badge.className).toContain('[-webkit-user-drag:element]')
    // …and releasing anywhere disarms it.
    fireEvent.mouseUp(window)
    expect(badge).not.toHaveAttribute('draggable')
    expect(badge.className).not.toContain('[-webkit-user-drag:element]')
  })

  it('does not arm on a right press (the tag context menu must win)', () => {
    render(
      <RefDropProvider repoPath="/r">
        <RefLabel gitRef={ref({ shortName: 'feat' })} />
      </RefDropProvider>
    )
    const badge = screen.getByTestId('ref-label-branch-feat')
    fireEvent.mouseDown(badge, { button: 2 })
    expect(badge).not.toHaveAttribute('draggable')
  })

  it('disarms when the drag ends', () => {
    renderPair()
    const badge = screen.getByTestId('ref-label-branch-feat')
    fireEvent.mouseDown(badge, { button: 0 })
    fireEvent.dragStart(badge, { dataTransfer: fakeDataTransfer() })
    expect(badge).toHaveAttribute('draggable', 'true')
    fireEvent.dragEnd(badge)
    expect(badge).not.toHaveAttribute('draggable')
  })

  it('does not make the bare HEAD or a stash draggable', () => {
    render(
      <RefDropProvider repoPath="/r">
        <RefLabel gitRef={ref({ type: 'HEAD', shortName: 'HEAD' })} />
        <RefLabel gitRef={ref({ type: 'stash', shortName: 'stash@{0}' })} />
      </RefDropProvider>
    )
    expect(screen.getByTestId('ref-label-HEAD-HEAD')).not.toHaveAttribute('draggable')
    expect(screen.getByTestId('ref-label-stash-stash@{0}')).not.toHaveAttribute('draggable')
  })

  it('a non-interactive lane-hint badge never drags nor shows the sticky-hover overlay', () => {
    // Simulate a drag already in progress with `main` as the sticky target.
    useRefDragStore.setState({
      draggingRef: ref({ shortName: 'feat', name: 'refs/heads/feat' }),
      hoverRef: ref({ shortName: 'main', name: 'refs/heads/main' }),
    })
    render(
      <RefDropProvider repoPath="/r">
        <RefLabel
          gitRef={ref({ shortName: 'main', name: 'refs/heads/main' })}
          interactive={false}
        />
      </RefDropProvider>
    )
    const badge = screen.getByTestId('ref-label-branch-main')
    expect(badge).not.toHaveAttribute('draggable')
    // Even though `main` is the sticky target, a hint badge shows no overlay clone (no duplication).
    expect(screen.getAllByText('main')).toHaveLength(1)
  })

  it('records the dragged ref on drag start', () => {
    renderPair()
    fireEvent.dragStart(screen.getByTestId('ref-label-branch-feat'), {
      dataTransfer: fakeDataTransfer(),
    })
    expect(useRefDragStore.getState().draggingRef?.shortName).toBe('feat')
  })

  it('allows the drop with a copy cursor over a different ref', () => {
    renderPair()
    fireEvent.dragStart(screen.getByTestId('ref-label-branch-feat'), {
      dataTransfer: fakeDataTransfer(),
    })
    const dtOver = fakeDataTransfer()
    fireEvent.dragOver(screen.getByTestId('ref-label-branch-main'), { dataTransfer: dtOver })
    expect(dtOver.dropEffect).toBe('copy')
  })

  it('calls the drop handler with (dragged source, drop target)', () => {
    renderPair()
    fireEvent.dragStart(screen.getByTestId('ref-label-branch-feat'), {
      dataTransfer: fakeDataTransfer(),
    })
    fireEvent.drop(screen.getByTestId('ref-label-branch-main'), {
      dataTransfer: fakeDataTransfer(),
    })
    expect(handleDrop).toHaveBeenCalledTimes(1)
    expect(handleDrop.mock.calls[0][0].shortName).toBe('feat')
    expect(handleDrop.mock.calls[0][1].shortName).toBe('main')
  })

  it('reveals the target’s full name and keeps it (sticky) until the drag ends', () => {
    renderPair()
    const source = screen.getByTestId('ref-label-branch-feat')
    fireEvent.dragStart(source, { dataTransfer: fakeDataTransfer() })
    const target = screen.getByTestId('ref-label-branch-main')
    // A short name that fits gets no hover overlay, but a drag-hover forces it (like a hover).
    expect(screen.getAllByText('main')).toHaveLength(1)
    fireEvent.dragEnter(target)
    expect(screen.getAllByText('main')).toHaveLength(2)
    // Sticky: leaving the badge keeps the overlay up (no onDragLeave clears it).
    fireEvent.dragLeave(target)
    expect(screen.getAllByText('main')).toHaveLength(2)
    // Ending the drag clears the sticky target.
    fireEvent.dragEnd(source)
    expect(screen.getAllByText('main')).toHaveLength(1)
  })

  it('switches the sticky highlight when the drag enters a different target', () => {
    render(
      <RefDropProvider repoPath="/r">
        <RefLabel gitRef={ref({ shortName: 'feat', name: 'refs/heads/feat' })} />
        <RefLabel gitRef={ref({ shortName: 'main', name: 'refs/heads/main' })} />
        <RefLabel gitRef={ref({ shortName: 'dev', name: 'refs/heads/dev' })} />
      </RefDropProvider>
    )
    fireEvent.dragStart(screen.getByTestId('ref-label-branch-feat'), {
      dataTransfer: fakeDataTransfer(),
    })
    fireEvent.dragEnter(screen.getByTestId('ref-label-branch-main'))
    expect(screen.getAllByText('main')).toHaveLength(2)
    fireEvent.dragEnter(screen.getByTestId('ref-label-branch-dev'))
    // The previous target's overlay is gone; the new one's is up.
    expect(screen.getAllByText('main')).toHaveLength(1)
    expect(screen.getAllByText('dev')).toHaveLength(2)
  })

  it('does not fire the handler when dropping a ref onto itself', () => {
    renderPair()
    const feat = screen.getByTestId('ref-label-branch-feat')
    fireEvent.dragStart(feat, { dataTransfer: fakeDataTransfer() })
    fireEvent.drop(feat, { dataTransfer: fakeDataTransfer() })
    expect(handleDrop).not.toHaveBeenCalled()
  })
})
