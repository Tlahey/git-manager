import type { SVGProps } from 'react'
import { cn } from '../lib/utils'

/**
 * Indeterminate loading spinner.
 *
 * Takes the full set of SVG props so callers can attach what the surrounding markup needs — a
 * `data-testid`, or `role="status"` + `aria-label` when the spinner is the *only* thing announcing
 * that work is in progress. It previously accepted `className` alone and silently dropped the rest.
 */
export function Spinner({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      className={cn('animate-spin', className)}
      {...props}
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  )
}
