import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../lib/utils'

const buttonVariants = cva(
  // The radius rides --control-radius (Tier-3 component token, defaults to the old
  // `rounded-md`) so a theme can change the *shape* of every button — glass makes
  // them full capsules — without a variant fork here. The size variants below
  // deliberately don't set their own radius: two competing rounded-* utilities
  // resolve by stylesheet order, not class order, so the winner would be arbitrary.
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--control-radius)] text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        // Filled variants consume the Tier-3 component tokens (--button-*-bg /
        // -foreground), which default to their semantic pair in themes.css. A theme
        // can re-point any of them for a component-specific fix without editing here.
        // outline/ghost have no solid fill (page surface + accent hover). link has no
        // fill either but its text rides --link (defaults to --primary) so a
        // light-content theme can darken it for AA without touching --primary.
        default: 'bg-button text-button-foreground shadow hover:bg-button/90',
        destructive:
          'bg-button-destructive text-button-destructive-foreground shadow-sm hover:bg-button-destructive/90',
        success:
          'bg-button-success text-button-success-foreground shadow-sm hover:bg-button-success/90',
        outline:
          'border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground',
        secondary:
          'bg-button-secondary text-button-secondary-foreground shadow-sm hover:bg-button-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-link underline-offset-4 hover:underline',
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

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    )
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
