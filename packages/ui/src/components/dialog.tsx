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
      'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-popover bg-black/60',
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

/** Where the content sits: centered (the default modal) or flush against the right edge, full
 * height — a side panel. */
export type DialogContentPosition = 'center' | 'right'

export interface DialogContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
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

      Note the `animate-in`/`slide-in-*`/`zoom-*` classes here are inert: `tailwindcss-animate` is
      not installed and the preset defines no matching keyframes, so they emit nothing. They are
      kept because they cost nothing and become correct the day the plugin is added — but do not
      read them as a description of what the dialog currently does, which is appear instantly.
    */}
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'border-border bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed z-popover border shadow-lg duration-200',
        position === 'center'
          ? 'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] left-[50%] top-[50%] grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg p-6'
          : 'data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right inset-y-0 right-0 flex max-w-none flex-col border-y-0 border-r-0',
        className
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:pointer-events-none">
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
    className={cn('text-muted-foreground text-sm', className)}
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
