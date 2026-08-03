import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '../lib/utils'

const Dialog = DialogPrimitive.Root
const DialogTrigger = DialogPrimitive.Trigger
const DialogPortal = DialogPrimitive.Portal
const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-popover bg-black/60 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

/** Where the content sits: centered (the default modal) or flush against the right edge, full
 * height — a side panel. */
export type DialogContentPosition = 'center' | 'right'

export interface DialogContentProps extends React.ComponentPropsWithoutRef<
  typeof DialogPrimitive.Content
> {
  position?: DialogContentPosition
}

/**
 * A drag strip across the top of the viewport, so the window can still be moved while a modal is up.
 *
 * The app has no native title bar (`titleBarStyle: "Overlay"`); the window is moved by grabbing the
 * `data-tauri-drag-region` on the tab bar. A modal's `fixed inset-0` overlay sits on top of that
 * region, which pinned the window in place for as long as any dialog was open. Harmless enough for a
 * dialog you dismiss in seconds, not for a side panel you keep open while working — which is how it
 * got noticed.
 *
 * Rendered *before* the content so the content wins wherever they overlap: the panel's own close
 * button lives in these top 40px and has to stay clickable. That leaves the strip effective exactly
 * where nothing else is — over the backdrop — which is the part you would reach for anyway.
 *
 * `pointer-events-auto` is required, not decorative: Radix sets `pointer-events: none` on `body`
 * while a modal is open, and a portalled child inherits it.
 */
const DialogDragStrip = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  (props, ref) => (
    <div
      ref={ref}
      data-tauri-drag-region
      aria-hidden
      className="pointer-events-auto fixed inset-x-0 top-0 z-popover h-10"
      {...props}
    />
  )
)
DialogDragStrip.displayName = 'DialogDragStrip'

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(({ className, children, position = 'center', ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogDragStrip />
    {/*
      A side panel is the same modal surface as a centered dialog — focus trap, Escape, the
      backdrop, the portal — with different geometry, so it is a variant here rather than a
      hand-rolled overlay somewhere else.

      The two branches are mutually exclusive whole class lists rather than a base plus overrides.
      Centering is not one property but seven that only make sense together (`left`/`top` +
      `translate` + `grid` + `max-w` + `rounded` + `p` + the entrance animation), and a caller
      unpicking them one Tailwind class at a time is how a panel ends up half-centered.

      The entrance/exit is timed with `animate-duration-200`, not `duration-200`: the latter also
      sets `transition-duration` on an element that declares no `transition-*`, which leaves
      `transition-property` at its initial `all` and turns every later property change into a
      200ms animation. See the plugin note in packages/config/tailwind.js.

      It carries the same `data-[state=…]` variants as the animation it times, and not for
      symmetry: `animate-in` itself sets `animation-duration`, and Tailwind emits variant rules
      after plain ones, so an unprefixed duration here would be overwritten back to the plugin's
      150ms default. Verified against the compiled CSS.
    */}
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'fixed z-popover border border-border bg-background shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:animate-duration-200 data-[state=open]:animate-duration-200',
        position === 'center'
          ? 'left-[50%] top-[50%] grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg p-6 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]'
          : 'inset-y-0 right-0 flex max-w-none flex-col border-y-0 border-r-0 data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right',
        className
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 cursor-pointer rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
))
DialogContent.displayName = DialogPrimitive.Content.displayName

function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex flex-col space-y-1.5 text-center sm:text-left', className)}
      {...props}
    />
  )
}
DialogHeader.displayName = 'DialogHeader'

function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2', className)}
      {...props}
    />
  )
}
DialogFooter.displayName = 'DialogFooter'

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('text-lg font-semibold leading-none tracking-tight', className)}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
