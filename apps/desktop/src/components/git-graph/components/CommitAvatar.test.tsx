import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CommitAvatar } from './CommitAvatar'

describe('CommitAvatar', () => {
  it('renders the GitHub image when a URL is provided', () => {
    render(<CommitAvatar avatarUrl="https://example.com/a.png" name="Ada Lovelace" />)
    const img = screen.getByRole('img')
    expect(img).toHaveAttribute('src', 'https://example.com/a.png')
    expect(img).toHaveAttribute('alt', 'Ada Lovelace')
  })

  it('renders colored initials when no URL is provided', () => {
    render(<CommitAvatar name="Ada Lovelace" />)
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByText('AL')).toBeInTheDocument()
  })

  it('falls back to initials when the image fails to load', () => {
    render(<CommitAvatar avatarUrl="https://example.com/broken.png" name="Ada Lovelace" />)
    fireEvent.error(screen.getByRole('img'))
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByText('AL')).toBeInTheDocument()
  })

  it('applies the requested pixel size', () => {
    render(<CommitAvatar name="Ada" size={32} />)
    const el = screen.getByTestId('commit-avatar')
    expect(el).toHaveStyle({ width: '32px', height: '32px' })
  })
})
