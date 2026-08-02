import * as React from 'react'
import * as ContextMenuPrimitive from '@radix-ui/react-context-menu'
import { cn } from '../lib/utils'

const ContextMenu = ContextMenuPrimitive.Root
const ContextMenuTrigger = ContextMenuPrimitive.Trigger

/**
 * Menu anchored to the cursor (right click) rather than to a trigger button. Same
 * collision-aware positioning as `DropdownMenuContent` (see dropdown-menu.tsx), except the
 * anchor is the click point instead of an element's rect.
 */
const ContextMenuContent = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Content>
>(({ className, collisionPadding = 8, ...props }, ref) => (
  <ContextMenuPrimitive.Portal>
    <ContextMenuPrimitive.Content
      ref={ref}
      collisionPadding={collisionPadding}
      className={cn(
        'border-border bg-popover text-popover-foreground z-popover min-w-[8rem] overflow-hidden rounded-md border p-1 shadow-lg',
        className
      )}
      {...props}
    />
  </ContextMenuPrimitive.Portal>
))
ContextMenuContent.displayName = ContextMenuPrimitive.Content.displayName

const ContextMenuItem = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Item>
>(({ className, ...props }, ref) => (
  <ContextMenuPrimitive.Item
    ref={ref}
    className={cn(
      'focus:bg-accent focus:text-accent-foreground relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-xs outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-40',
      className
    )}
    {...props}
  />
))
ContextMenuItem.displayName = ContextMenuPrimitive.Item.displayName

const ContextMenuLabel = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Label>
>(({ className, ...props }, ref) => (
  <ContextMenuPrimitive.Label
    ref={ref}
    className={cn(
      'text-muted-foreground px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide',
      className
    )}
    {...props}
  />
))
ContextMenuLabel.displayName = ContextMenuPrimitive.Label.displayName

export { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuLabel }
