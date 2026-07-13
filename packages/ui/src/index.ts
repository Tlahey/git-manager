export { Button, buttonVariants } from './components/button'
export type { ButtonProps } from './components/button'

export { Badge } from './components/badge'
export type { BadgeProps } from './components/badge'

export { ScrollArea, ScrollBar } from './components/scroll-area'

export { Separator } from './components/separator'

export { Input } from './components/input'
export type { InputProps } from './components/input'

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
} from './lib/themeTokens'
export type { ThemeTokens, ThemeValidation, ContrastPair, ContrastResult } from './lib/themeTokens'
export {
  parseHslTriplet,
  hslToRgb,
  relativeLuminance,
  contrastRatio,
  contrastRatioForHslTriplets,
} from './lib/colorContrast'
export type { Rgb } from './lib/colorContrast'
