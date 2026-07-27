import type { SVGProps } from 'react'
import { cn } from '../lib/utils'

/**
 * The mark for **every action that calls the language model**, and for nothing else.
 *
 * It exists because the app had two of them. `Sparkles` marked most AI actions, `Wand2` marked the
 * rest, and `Sparkles` *also* marked things that are not AI at all (the dev notification simulator),
 * so the icon told the user nothing reliable: seeing it could mean "this spends a model run and may
 * take a minute" or could mean "this is a shortcut". A local model is slow enough and its output
 * uncertain enough that "am I about to invoke it?" has to be answerable at a glance, from one shape.
 *
 * **Speech bubble + spark**, rather than a bare spark: a bubble is a thing that *answers*, which is
 * what separates an LLM action from a generic enhancement, and it stays distinguishable from
 * `Sparkles` at the 14px this renders at in toolbars and menus — two bare sparks would not.
 *
 * Drawn on lucide's grid (24×24, 2px stroke, round caps and joins) because it sits inline with
 * lucide icons everywhere; anything else reads as visually foreign at the same size. The spark is
 * filled rather than stroked — at 14px a stroked 6px star closes up into a blob.
 *
 * Takes the full set of SVG props, like {@link Spinner}, so callers can attach a `data-testid` or an
 * `aria-label` when the icon is the only thing naming the action.
 */
export function LlmIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('shrink-0', className)}
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {/* Bubble: lucide's message-square geometry, so the silhouette matches its neighbours. */}
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      {/* Spark: a concave four-point star, filled so it survives being scaled down. */}
      <path
        fill="currentColor"
        stroke="none"
        d="M12 6.4c.55 2.4 1.25 3.1 3.6 3.6-2.35.5-3.05 1.2-3.6 3.6-.55-2.4-1.25-3.1-3.6-3.6 2.35-.5 3.05-1.2 3.6-3.6Z"
      />
    </svg>
  )
}
