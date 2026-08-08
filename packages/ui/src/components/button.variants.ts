import { cva } from 'class-variance-authority'

/**
 * The Button's class recipe, kept out of `button.tsx` so that file exports components only —
 * a module mixing a component with a non-component export breaks Vite's Fast Refresh for it
 * (`react/only-export-components`).
 */
export const buttonVariants = cva(
  // The radius rides --control-radius (Tier-3 component token, defaults to the old
  // `rounded-md`) so a theme can change the *shape* of every button — glass makes
  // them full capsules — without a variant fork here. The size variants below
  // deliberately don't set their own radius: two competing rounded-* utilities
  // resolve by stylesheet order, not class order, so the winner would be arbitrary.
  // `enabled:` gates every hover:* below rather than relying on disabled:pointer-events-none —
  // pointer-events-none disables hit-testing, which silently defeats disabled:cursor-not-allowed
  // (the cursor property never applies without hit-testing, so the "not-allowed" cursor would
  // never actually paint).
  'inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-(--control-radius) text-sm font-medium transition-colors focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
  {
    variants: {
      variant: {
        // Filled variants consume the Tier-3 component tokens (--button-*-bg /
        // -foreground), which default to their semantic pair in themes.css. A theme
        // can re-point any of them for a component-specific fix without editing here.
        // outline/ghost have no solid fill (page surface + accent hover). link has no
        // fill either but its text rides --link (defaults to --primary) so a
        // light-content theme can darken it for AA without touching --primary.
        default: 'bg-button text-button-foreground shadow-sm hover:enabled:bg-button/90',
        destructive:
          'bg-button-destructive text-button-destructive-foreground shadow-xs hover:enabled:bg-button-destructive/90',
        success:
          'bg-button-success text-button-success-foreground shadow-xs hover:enabled:bg-button-success/90',
        outline:
          'border border-input bg-background shadow-xs hover:enabled:bg-accent hover:enabled:text-accent-foreground',
        secondary:
          'bg-button-secondary text-button-secondary-foreground shadow-xs hover:enabled:bg-button-secondary/80',
        ghost: 'hover:enabled:bg-accent hover:enabled:text-accent-foreground',
        link: 'text-link underline-offset-4 hover:enabled:underline',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 px-3 text-xs',
        lg: 'h-10 px-8',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)
