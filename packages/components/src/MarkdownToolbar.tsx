import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Separator,
  Tooltip,
  cn,
} from '@git-manager/ui'
import { ChevronDown, Heading, Info, MoreHorizontal } from 'lucide-react'
import type { ReactNode } from 'react'
import type { MarkdownCommandId } from './markdownCommands'
import {
  MARKDOWN_ALERT_ITEMS,
  MARKDOWN_HEADING_ITEMS,
  MARKDOWN_OVERFLOW_SECTIONS,
  MARKDOWN_TOOLBAR_GROUPS,
  type MarkdownToolbarItem,
  type MarkdownToolbarLabels,
} from './markdownToolbar.config'

export interface MarkdownToolbarProps {
  /** Runs a formatting command against the editor's current selection. */
  onCommand: (command: MarkdownCommandId) => void
  labels: MarkdownToolbarLabels
  disabled?: boolean
  className?: string
}

/**
 * The formatting bar above a markdown editor: the everyday actions as icon buttons, headings and
 * alerts behind their own menus, and the rest of GitHub's syntax in the `…` panel.
 *
 * Presentational on purpose — it knows nothing of the textarea it formats, and reaches it only
 * through `onCommand` (see `useMarkdownEditor`). Two details are load-bearing rather than
 * cosmetic:
 *  - the buttons cancel their pointer-down default, so the field keeps both focus and selection and
 *    the command applies to what the user actually highlighted;
 *  - the menus are Radix's, which measures and flips them against the viewport. Hand-rolled
 *    anchoring is what made an earlier prototype open its widest panel off the bottom edge, out of
 *    reach — the same reason `useAnchoredMenu` was retired (see `dropdown-menu.tsx`).
 */
export function MarkdownToolbar({ onCommand, labels, disabled, className }: MarkdownToolbarProps) {
  function tooltip(item: MarkdownToolbarItem): string {
    const label = labels.commands[item.command]
    return item.shortcut ? `${label} — ${item.shortcut}` : label
  }

  function renderButton(item: MarkdownToolbarItem) {
    const Icon = item.icon
    return (
      <Tooltip key={item.command} content={tooltip(item)}>
        <Button
          type="button"
          variant="ghost"
          size="iconSm"
          disabled={disabled}
          aria-label={labels.commands[item.command]}
          data-testid={`markdown-toolbar-${item.command}`}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onCommand(item.command)}
        >
          <Icon className="h-3.5 w-3.5" />
        </Button>
      </Tooltip>
    )
  }

  function renderMenuItem(item: MarkdownToolbarItem) {
    const Icon = item.icon
    return (
      <DropdownMenuItem
        key={item.command}
        data-testid={`markdown-toolbar-${item.command}`}
        className="cursor-pointer gap-2 text-xs"
        onSelect={() => onCommand(item.command)}
      >
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        {labels.commands[item.command]}
      </DropdownMenuItem>
    )
  }

  /**
   * The tooltip wraps the *trigger*, not the other way round: as `asChild`'s child it would receive
   * Radix's open/close handlers and drop them, since `Tooltip` only clones the element it is given.
   */
  function renderMenuTrigger(label: string, icon: ReactNode, testId: string, chevron = true) {
    return (
      <Tooltip content={label}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="iconSm"
            disabled={disabled}
            aria-label={label}
            data-testid={testId}
            className={chevron ? 'w-auto gap-0 px-1' : undefined}
          >
            {icon}
            {chevron && <ChevronDown className="h-2.5 w-2.5 text-muted-foreground" />}
          </Button>
        </DropdownMenuTrigger>
      </Tooltip>
    )
  }

  return (
    <div
      className={cn('flex flex-wrap items-center gap-0.5 px-1.5 py-1', className)}
      data-testid="markdown-toolbar"
    >
      <DropdownMenu>
        {renderMenuTrigger(
          labels.headings,
          <Heading className="h-3.5 w-3.5" />,
          'markdown-toolbar-headings'
        )}
        <DropdownMenuContent align="start">
          {MARKDOWN_HEADING_ITEMS.map(renderMenuItem)}
        </DropdownMenuContent>
      </DropdownMenu>

      {MARKDOWN_TOOLBAR_GROUPS.map((group, index) => (
        <div key={group[0].command} className="flex items-center gap-0.5">
          {index > 0 && <Separator orientation="vertical" className="mx-1 h-4" />}
          {group.map(renderButton)}
        </div>
      ))}

      <Separator orientation="vertical" className="mx-1 h-4" />

      <DropdownMenu>
        {renderMenuTrigger(
          labels.alerts,
          <Info className="h-3.5 w-3.5" />,
          'markdown-toolbar-alerts'
        )}
        <DropdownMenuContent align="start">
          {MARKDOWN_ALERT_ITEMS.map(renderMenuItem)}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        {renderMenuTrigger(
          labels.more,
          <MoreHorizontal className="h-3.5 w-3.5" />,
          'markdown-toolbar-more',
          false
        )}
        <DropdownMenuContent align="end" className="flex gap-1">
          {MARKDOWN_OVERFLOW_SECTIONS.map((section) => (
            <div key={section.key} className="min-w-0">
              <p className="px-2 py-1 text-[10px] tracking-wide text-muted-foreground uppercase">
                {labels.sections[section.key]}
              </p>
              {section.items.map(renderMenuItem)}
            </div>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
