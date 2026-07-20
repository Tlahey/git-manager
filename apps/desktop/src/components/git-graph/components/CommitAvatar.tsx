import { Avatar, cn } from '@git-manager/ui'
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
  return (
    <Avatar
      data-testid="commit-avatar"
      src={avatarUrl}
      alt={name}
      title={title ?? name}
      fallback={getAuthorInitials(name)}
      size={size}
      square={square}
      // The name-hashed gradient is the fallback fill; Avatar drops it under an image.
      className={cn('shadow-sm', `bg-gradient-to-tr ${getAuthorAvatarStyle(name)}`, className)}
    />
  )
}
