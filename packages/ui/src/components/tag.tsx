import * as React from 'react'
import { cn } from '../lib/utils'

export type TagTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info'

// A small inline status/count tag (file-change counts, state labels). Accepts text
// and/or an icon. The fill is a translucent /15 tint of the tone; the *text* rides
// the --tone-*-foreground component tokens so its shade adapts to the surface
// (dark text on light content, light text on the dark nav) and clears WCAG AA —
// the previous fixed shades (text-amber-600 / text-blue-600 / raw text-success)
// were too light on light content (Twilight) and too dark on the dark chrome.
const TONE_CLASSES: Record<TagTone, string> = {
  neutral: 'bg-muted text-muted-foreground',
  success: 'bg-success/15 text-tone-success',
  warning: 'bg-amber-500/15 text-tone-warning',
  danger: 'bg-destructive/15 text-tone-danger',
  info: 'bg-blue-500/15 text-tone-info',
}

export interface TagProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: TagTone
}

// Forwards its ref so a Tag can act as the trigger of a Tooltip/Popover, which position themselves
// against the trigger's measured rect and silently render nothing when the ref stays null.
const Tag = React.forwardRef<HTMLSpanElement, TagProps>(
  ({ tone = 'neutral', className, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] leading-none font-semibold',
        TONE_CLASSES[tone],
        className
      )}
      {...props}
    />
  )
)
Tag.displayName = 'Tag'

export { Tag }
