import * as React from 'react'
import { cn } from '../lib/utils'

// A themed range slider built on a native `<input type="range">`. Native rather than
// a custom widget on purpose: the element already carries `role="slider"` with
// aria-valuemin/max/now kept in sync by the browser, and full keyboard operation
// (arrows, Home/End, PageUp/Down) that a div-based rebuild has to reimplement and
// usually gets wrong. Only the painting is ours.
//
// The track is drawn as a gradient whose hard stop sits at the current value, so the
// filled portion needs no extra element — which keeps the thumb's position and the
// fill mathematically in sync at any min/max/step.

export interface SliderProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> {
  value: number
  onValueChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  /** Rendered next to the slider; required because a bare slider announces only numbers. */
  'aria-label': string
}

const Slider = React.forwardRef<HTMLInputElement, SliderProps>(
  ({ className, value, onValueChange, min = 0, max = 100, step = 1, disabled, ...props }, ref) => {
    // Guard against a zero-width range (min === max), which would divide by zero and
    // leave the gradient stop as NaN — the track would render unfilled at every value.
    const span = max - min
    const percent = span === 0 ? 0 : ((value - min) / span) * 100

    return (
      <input
        ref={ref}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onValueChange(Number(e.target.value))}
        // The fill rides `--badge-bg` rather than raw --primary: it is the
        // contrast-graded brand fill (deep enough on light-content themes), which is
        // what keeps the filled track distinguishable from the empty one everywhere.
        style={{
          background: `linear-gradient(to right, hsl(var(--badge-bg)) 0%, hsl(var(--badge-bg)) ${percent}%, hsl(var(--muted)) ${percent}%, hsl(var(--muted)) 100%)`,
        }}
        className={cn(
          'h-1.5 w-full cursor-pointer appearance-none rounded-full outline-none',
          'focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          // The thumb has no cross-browser standard property, so both vendor
          // pseudo-elements are styled. It uses --background with a brand ring so it
          // stays visible against its own filled track on light and dark themes alike.
          '[&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-badge [&::-webkit-slider-thumb]:bg-background [&::-webkit-slider-thumb]:shadow-sm [&::-webkit-slider-thumb]:transition-transform active:[&::-webkit-slider-thumb]:scale-110',
          '[&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-badge [&::-moz-range-thumb]:bg-background',
          disabled && 'cursor-not-allowed opacity-50',
          className
        )}
        {...props}
      />
    )
  }
)
Slider.displayName = 'Slider'

export { Slider }
