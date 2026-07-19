import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AuthorAvatar, getAuthorColor } from './AuthorAvatar'

const getAvatarUrl = vi.fn<(email?: string, name?: string) => string | null>()
vi.mock('../../../lib/avatar', () => ({
  getAvatarUrl: (email?: string, name?: string) => getAvatarUrl(email, name),
}))

describe('AuthorAvatar', () => {
  beforeEach(() => getAvatarUrl.mockReset())

  it('renders a gravatar img when a URL is available', () => {
    getAvatarUrl.mockReturnValue('https://example.com/a.png')
    render(<AuthorAvatar name="Alice Smith" email="alice@x.com" />)
    const img = screen.getByRole('img', { name: 'Alice Smith' })
    expect(img).toHaveAttribute('src', 'https://example.com/a.png')
  })

  it('falls back to initials when no avatar URL', () => {
    getAvatarUrl.mockReturnValue(null)
    render(<AuthorAvatar name="Alice Smith" email="alice@x.com" />)
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.getByText('AS')).toBeInTheDocument()
  })

  it('renders the stash glyph instead of an avatar when isStash', () => {
    getAvatarUrl.mockReturnValue('https://example.com/a.png')
    const { container } = render(<AuthorAvatar name="whatever" isStash />)
    expect(container.querySelector('[title="Stash"]')).not.toBeNull()
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('getAuthorColor is deterministic for a given name', () => {
    expect(getAuthorColor('Alice')).toBe(getAuthorColor('Alice'))
  })
})
