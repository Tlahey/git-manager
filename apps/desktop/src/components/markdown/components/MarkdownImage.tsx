import React from 'react'
import { resolveImageSrc } from './resolveImageSrc'

interface MarkdownImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  repoPath?: string
}

export function MarkdownImage({
  src,
  alt,
  width,
  height,
  repoPath,
  className = '',
  style,
  ...props
}: MarkdownImageProps) {
  const resolvedSrc = resolveImageSrc(src, repoPath)

  return (
    <img
      src={resolvedSrc}
      alt={alt || ''}
      width={width}
      height={height}
      style={{
        width: width ? (typeof width === 'number' ? `${width}px` : width) : undefined,
        height: height ? (typeof height === 'number' ? `${height}px` : height) : undefined,
        maxHeight: width || height ? undefined : '500px',
        ...style,
      }}
      className={`inline-block max-w-full align-middle transition-opacity duration-200 ${className}`}
      loading="lazy"
      data-testid="markdown-image"
      {...props}
    />
  )
}
