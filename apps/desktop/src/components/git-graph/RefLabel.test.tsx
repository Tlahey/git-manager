import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { GitRef } from '@git-manager/git-types'
import { RefLabel } from './RefLabel'

function ref(overrides: Partial<GitRef> = {}): GitRef {
  return { name: 'refs/heads/feature-x', shortName: 'feature-x', type: 'branch', commitOid: 'abc', ...overrides }
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
    const { container } = render(<RefLabel gitRef={ref({ type: 'remote', shortName: 'origin/main' })} />)
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

describe('RefLabel — stash', () => {
  it('shows the Archive icon, purple color, and dashed border by default', () => {
    const { container } = render(<RefLabel gitRef={ref({ type: 'stash', shortName: 'stash@{0}' })} />)
    const badge = screen.getByText('stash@{0}').parentElement!
    expect(container.querySelector('.lucide-archive')).toBeTruthy()
    expect(badge.style.color).toBe('rgb(167, 139, 250)') // #a78bfa
    expect(badge.style.borderStyle).toBe('dashed')
  })
})
