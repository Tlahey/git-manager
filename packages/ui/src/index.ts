export { Button, buttonVariants } from './components/button'
export type { ButtonProps } from './components/button'

export { Badge, NumberBadge } from './components/badge'
export type { BadgeProps, NumberBadgeProps } from './components/badge'
export { Chip } from './components/chip'
export type { ChipProps } from './components/chip'
export { Tag } from './components/tag'
export type { TagProps, TagTone } from './components/tag'

export { ScrollArea, ScrollBar } from './components/scroll-area'

export { Separator } from './components/separator'

export { Input } from './components/input'
export type { InputProps, InputVariant } from './components/input'

export { Textarea } from './components/textarea'
export type { TextareaProps } from './components/textarea'

export { Spinner } from './components/spinner'

export { toast, Toaster } from './components/toast'
export type { ToastVariant, ToastOptions } from './components/toast'

export { cn } from './lib/utils'

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
} from './components/dialog'

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from './components/dropdown-menu'

export { Popover, PopoverTrigger, PopoverAnchor, PopoverContent } from './components/popover'

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from './components/tooltip'

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
} from './components/select'

export {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
} from './components/context-menu'

export {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
} from './components/command'

// ─── Theme validation (accessibility / token consistency) ──────────────────────
// Re-exported from @git-manager/theme (the single source of truth) so existing
// `@git-manager/ui` consumers keep working unchanged.
export {
  parseThemeTokens,
  evaluateThemeContrast,
  validateThemeTokens,
  isThemeValid,
  THEME_TOKEN_KEYS,
  NON_COLOR_TOKENS,
  CONTRAST_PAIRS,
  AA_NORMAL_TEXT,
  AA_LARGE_TEXT,
  parseHslTriplet,
  hslToRgb,
  relativeLuminance,
  contrastRatio,
  contrastRatioForHslTriplets,
} from '@git-manager/theme'
export type {
  ThemeTokens,
  ThemeValidation,
  ContrastPair,
  ContrastResult,
  Rgb,
} from '@git-manager/theme'
