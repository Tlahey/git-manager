import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { GithubIcon, GitlabIcon, GithubMark } from './forge-icons'

function svgOf(container: HTMLElement): SVGSVGElement {
  const svg = container.querySelector('svg')
  if (!svg) throw new Error('no svg rendered')
  return svg
}

describe('GithubIcon / GitlabIcon', () => {
  /** They sit inline with lucide icons; a different grid or weight reads as visually foreign. */
  it('are drawn on lucide’s 24×24 grid with a matching stroke', () => {
    for (const svg of [
      svgOf(render(<GithubIcon />).container),
      svgOf(render(<GitlabIcon />).container),
    ]) {
      expect(svg).toHaveAttribute('viewBox', '0 0 24 24')
      expect(svg).toHaveAttribute('stroke', 'currentColor')
      expect(svg).toHaveAttribute('stroke-width', '2')
      expect(svg).toHaveAttribute('stroke-linecap', 'round')
      expect(svg).toHaveAttribute('stroke-linejoin', 'round')
      expect(svg).toHaveAttribute('fill', 'none')
    }
  })

  /** Stands in for the `lucide-<name>` class the deprecated lucide brand icons used to carry. */
  it('carry a stable data-icon hook', () => {
    expect(svgOf(render(<GithubIcon />).container)).toHaveAttribute('data-icon', 'github')
    expect(svgOf(render(<GitlabIcon />).container)).toHaveAttribute('data-icon', 'gitlab')
  })

  /** Decorative: they sit next to a text label that already names the forge. */
  it('are hidden from assistive tech', () => {
    expect(svgOf(render(<GithubIcon />).container)).toHaveAttribute('aria-hidden', 'true')
    expect(svgOf(render(<GitlabIcon />).container)).toHaveAttribute('aria-hidden', 'true')
  })

  it('merge a caller className with their own', () => {
    const svg = svgOf(render(<GithubIcon className="h-3.5 w-3.5 text-primary" />).container)
    expect(svg).toHaveClass('shrink-0', 'h-3.5', 'w-3.5', 'text-primary')
  })

  it('let a caller pass arbitrary props through', () => {
    const svg = svgOf(render(<GitlabIcon data-testid="gl" aria-label="GitLab" />).container)
    expect(svg).toHaveAttribute('data-testid', 'gl')
    expect(svg).toHaveAttribute('aria-label', 'GitLab')
  })
})

describe('GithubMark', () => {
  /** The solid Octocat silhouette — filled, not stroked like its outline sibling. */
  it('paints with a fill instead of a stroke', () => {
    const svg = svgOf(render(<GithubMark />).container)
    expect(svg).toHaveAttribute('fill', 'currentColor')
    expect(svg).not.toHaveAttribute('stroke-width')
    expect(svg).toHaveAttribute('data-icon', 'github-mark')
  })

  /**
   * Announced, unlike `GithubIcon`: where it's used it is the only thing marking a ref badge as
   * living on a remote, so it has to carry its own name.
   */
  it('is announced with an accessible name by default', () => {
    const { container, getByTitle } = render(<GithubMark />)
    const svg = svgOf(container)
    expect(svg).toHaveAttribute('role', 'img')
    expect(svg).not.toHaveAttribute('aria-hidden')
    expect(getByTitle('GitHub')).toBeInTheDocument()
  })

  it('takes a caller-supplied name', () => {
    const { getByTitle } = render(<GithubMark title="Remote branch on GitHub" />)
    expect(getByTitle('Remote branch on GitHub')).toBeInTheDocument()
  })

  /** An empty title is the opt-out for a spot where surrounding text already says it. */
  it('drops both the title and the role when asked to be decorative', () => {
    const { container } = render(<GithubMark title="" />)
    const svg = svgOf(container)
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svg).not.toHaveAttribute('role')
    expect(container.querySelector('title')).toBeNull()
  })

  it('merges a caller className with its own', () => {
    const svg = svgOf(render(<GithubMark className="ml-0.5 h-3 w-3" />).container)
    expect(svg).toHaveClass('shrink-0', 'ml-0.5', 'h-3', 'w-3')
  })
})
