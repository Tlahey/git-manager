import * as React from 'react'
import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area'
import { cn } from '../lib/utils'

const ScrollArea = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root>
>(({ className, children, ...props }, ref) => (
  <ScrollAreaPrimitive.Root
    ref={ref}
    className={cn('relative overflow-hidden', className)}
    {...props}
  >
    {/*
      `[&>div]:!block` overrides a Radix internal, and removing it brings back a real bug.

      `ScrollArea.Viewport` wraps its children in a div it styles `{ minWidth: "100%", display:
      "table" }`. A table box is shrink-to-fit: it sizes to its *min-content* width and is free to
      exceed the space it was given. So one unbreakable token — a file path in inline code, a long
      URL — makes that wrapper wider than the panel, and nothing wraps, because at min-content width
      there is no line to break.

      `overflow-wrap: break-word` does not save you here: per CSS Text, it breaks a word during line
      layout but is explicitly ignored when computing min-content, which is what the table asks for.

      The overflow isn't even scrollable: this component only ever renders a vertical ScrollBar, so
      Radix sets `overflowX: hidden` on the viewport and the excess is simply clipped — text that
      runs off the right edge with no way to reach it. Forcing the wrapper back to `block` pins it to
      the viewport width, which is what makes `break-word` (and `overflow-x-auto` on a code block or
      a wide table) behave.

      If a horizontal ScrollBar is ever added here, this override has to become conditional: `table`
      is what would let content exceed 100% and actually scroll sideways.
    */}
    <ScrollAreaPrimitive.Viewport className="h-full w-full rounded-[inherit] [&>div]:!block">
      {children}
    </ScrollAreaPrimitive.Viewport>
    <ScrollBar />
    <ScrollAreaPrimitive.Corner />
  </ScrollAreaPrimitive.Root>
))
ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName

const ScrollBar = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>
>(({ className, orientation = 'vertical', ...props }, ref) => (
  <ScrollAreaPrimitive.ScrollAreaScrollbar
    ref={ref}
    orientation={orientation}
    className={cn(
      'flex touch-none select-none transition-colors',
      orientation === 'vertical' && 'h-full w-2.5 border-l border-l-transparent p-[1px]',
      orientation === 'horizontal' && 'h-2.5 flex-col border-t border-t-transparent p-[1px]',
      className
    )}
    {...props}
  >
    <ScrollAreaPrimitive.ScrollAreaThumb className="relative flex-1 rounded-full bg-border" />
  </ScrollAreaPrimitive.ScrollAreaScrollbar>
))
ScrollBar.displayName = ScrollAreaPrimitive.ScrollAreaScrollbar.displayName

export { ScrollArea, ScrollBar }
