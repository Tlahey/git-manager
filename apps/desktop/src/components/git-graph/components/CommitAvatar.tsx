import { useState, useEffect } from 'react'
import { cn } from '@git-manager/ui'
import { getAuthorAvatarStyle, getAuthorInitials } from '../../../lib/authorAvatar'

interface CommitAvatarProps {
  /** GitHub-resolved avatar URL; when absent or it fails to load, colored initials are shown. */
  avatarUrl?: string
  name: string
  /** Pixel size of the avatar (diameter for a circle, side length for a square). */
  size?: number
  /** Render a square (line-height blame gutter) instead of the default circle. */
  square?: boolean
  className?: string
  title?: string
}

/**
 * Presentational commit-author avatar: renders the GitHub image when available, otherwise
 * deterministic colored initials. No store/IPC/data-fetching — the resolved `avatarUrl` is passed
 * in (see `useCommitAvatars`), so it stays reusable across the blame gutter and history panel.
 */
export function CommitAvatar({
  avatarUrl,
  name,
  size = 20,
  square = false,
  className,
  title,
}: CommitAvatarProps) {
  const [imgError, setImgError] = useState(false)

  useEffect(() => {
    setImgError(false)
  }, [avatarUrl])

  const showImage = avatarUrl && !imgError
  const fontSize = Math.max(8, Math.round(size * 0.42))

  return (
    <div
      data-testid="commit-avatar"
      title={title ?? name}
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden font-bold text-white shadow-sm',
        square ? 'rounded-none' : 'rounded-full',
        showImage ? '' : `bg-gradient-to-tr ${getAuthorAvatarStyle(name)}`,
        className
      )}
      style={{ width: size, height: size, fontSize }}
    >
      {showImage ? (
        <img
          src={avatarUrl}
          alt={name}
          className="h-full w-full object-cover"
          onError={() => setImgError(true)}
        />
      ) : (
        getAuthorInitials(name)
      )}
    </div>
  )
}
