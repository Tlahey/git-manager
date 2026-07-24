import React from 'react'
import { convertFileSrc } from '@tauri-apps/api/core'

interface MarkdownImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  repoPath?: string
}

export function resolveImageSrc(src?: string, repoPath?: string): string {
  if (!src) return ''
  if (
    src.startsWith('http://') ||
    src.startsWith('https://') ||
    src.startsWith('data:') ||
    src.startsWith('blob:') ||
    src.startsWith('asset:')
  ) {
    return src
  }

  // If path is already absolute (e.g. /Users/...) or relative to repoPath
  const targetPath = src.startsWith('/')
    ? src
    : repoPath
      ? repoPath.endsWith('/')
        ? `${repoPath}${src.replace(/^\.\//, '')}`
        : `${repoPath}/${src.replace(/^\.\//, '')}`
      : src

  if (targetPath.startsWith('/')) {
    try {
      return convertFileSrc(targetPath)
    } catch {
      return `file://${targetPath}`
    }
  }

  return src
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
