import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AvatarStack } from './AvatarStack'
import type { Collaborator } from '../types'

function users(n: number): Collaborator[] {
  return Array.from({ length: n }, (_, i) => ({ login: `user${i}`, avatar: `https://x/${i}.png` }))
}

describe('AvatarStack', () => {
  it('renders an avatar image per user, up to the default max of 3', () => {
    render(<AvatarStack users={users(3)} />)
    expect(screen.getAllByRole('img')).toHaveLength(3)
  })

  it('shows a "+N" overflow badge beyond the max', () => {
    render(<AvatarStack users={users(5)} />)
    expect(screen.getAllByRole('img')).toHaveLength(3)
    expect(screen.getByText('+2')).toBeInTheDocument()
  })

  it('respects a custom max', () => {
    render(<AvatarStack users={users(5)} max={2} />)
    expect(screen.getAllByRole('img')).toHaveLength(2)
    expect(screen.getByText('+3')).toBeInTheDocument()
  })

  it('omits the overflow badge when everyone fits', () => {
    render(<AvatarStack users={users(2)} />)
    expect(screen.queryByText(/^\+/)).not.toBeInTheDocument()
  })

  it('sets alt/title to the user login', () => {
    render(<AvatarStack users={[{ login: 'octocat', avatar: 'a.png' }]} />)
    expect(screen.getByAltText('octocat')).toBeInTheDocument()
  })
})
