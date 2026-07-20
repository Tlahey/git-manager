import * as React from 'react'
import { cn } from '../lib/utils'

// A presentational avatar: shows `src` when it loads, otherwise the `fallback`
// (initials or an icon). No data-fetching or app types — callers resolve the URL and
// the fallback (and pick the fallback background via `className`), so it stays a pure,
// snapshot-testable shell shared by the commit/author avatars. Size either with the
// `size` prop (px → width/height + a proportional font size) or with `className`.
export interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Image URL; `null`/`undefined` (or a load failure) shows the fallback. */
  src?: string | null
  /** Accessible name for the image / avatar (the person's name). */
  alt: string
  /** Rendered when there's no `src` or it fails to load. */
  fallback: React.ReactNode
  /** Diameter (circle) or side (square) in px. Omit to size via `className`. */
  size?: number
  /** Square instead of the default circle (e.g. a blame gutter). */
  square?: boolean
}

const Avatar = React.forwardRef<HTMLDivElement, AvatarProps>(
  ({ src, alt, fallback, size, square = false, className, style, ...props }, ref) => {
    const [imgError, setImgError] = React.useState(false)
    // Reset the error when the source changes so a new URL gets a fresh attempt.
    React.useEffect(() => setImgError(false), [src])

    const resolvedSrc = src ?? undefined
    const showImage = Boolean(resolvedSrc) && !imgError
    const sizeStyle = size
      ? { width: size, height: size, fontSize: Math.max(8, Math.round(size * 0.42)) }
      : undefined

    return (
      <div
        ref={ref}
        title={props.title ?? alt}
        className={cn(
          'flex shrink-0 items-center justify-center overflow-hidden font-bold text-white',
          square ? 'rounded-none' : 'rounded-full',
          className
        )}
        style={{ ...sizeStyle, ...style }}
        {...props}
      >
        {showImage ? (
          <img
            src={resolvedSrc}
            alt={alt}
            className="h-full w-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          fallback
        )}
      </div>
    )
  }
)
Avatar.displayName = 'Avatar'

export { Avatar }
