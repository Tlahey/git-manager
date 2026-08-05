import React from 'react'
import { resolveImageSrc } from './resolveImageSrc'

interface MarkdownVideoProps extends React.VideoHTMLAttributes<HTMLVideoElement> {
  repoPath?: string
}

/**
 * Renders a `<video>` in user-authored markdown (board cards and their comments).
 *
 * Source resolution is `MarkdownImage`'s, unchanged — a repo-relative path becomes an `asset://` URL,
 * anything remote or inline passes through — because an attachment is an attachment whatever its
 * media type. It only reaches the DOM under `authoredMarkdownSanitizeSchema`, which is why the
 * strict schema used for READMEs and third-party pull requests still drops the tag entirely.
 *
 * Deliberately not autoplaying and not preloading: a card can carry several recordings, and a
 * dialog that starts playing on open — or pulls megabytes off disk for a video nobody clicked — is
 * a worse default than one extra click.
 */
export function MarkdownVideo({
  src,
  repoPath,
  className = '',
  controls = true,
  ...props
}: MarkdownVideoProps) {
  const resolvedSrc = resolveImageSrc(src, repoPath)
  if (!resolvedSrc) return null

  return (
    <video
      src={resolvedSrc}
      controls={controls}
      preload="none"
      className={`my-2 max-h-[500px] max-w-full rounded border border-border ${className}`}
      data-testid="markdown-video"
      {...props}
    />
  )
}
