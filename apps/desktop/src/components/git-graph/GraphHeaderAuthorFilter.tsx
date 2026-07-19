import { useTranslation } from '@git-manager/i18n'
import {
  cn,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@git-manager/ui'
import { Check, ListFilter, X } from 'lucide-react'
import { AuthorAvatar } from './components/AuthorAvatar'
import type { AuthorOption } from './graphAuthors'
import { useGraphAuthorFilterStore } from '../../stores/graphAuthorFilter.store'

interface GraphHeaderAuthorFilterProps {
  /** Unique authors of the loaded commits, sorted for the autocomplete list. */
  authors: AuthorOption[]
}

/**
 * Funnel button in the AUTHOR column header opening a popover to filter the graph by author.
 * Picking one or more authors dims every row not written by them (see `GitGraph`'s `dimmed`
 * wiring), the same opacity treatment as the ⌘F commit search. Selected authors show as
 * removable chips below the trigger, and "Clear filter" drops them all.
 */
export function GraphHeaderAuthorFilter({ authors }: GraphHeaderAuthorFilterProps) {
  const { t } = useTranslation('git')
  const selected = useGraphAuthorFilterStore((s) => s.selected)
  const toggle = useGraphAuthorFilterStore((s) => s.toggle)
  const remove = useGraphAuthorFilterStore((s) => s.remove)
  const clear = useGraphAuthorFilterStore((s) => s.clear)

  const activeCount = selected.size
  const hasSelection = activeCount > 0
  const selectedAuthors = authors.filter((a) => selected.has(a.email))

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          // Stop the header cell's context-menu / resize handlers from also reacting to this click.
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          aria-label={t('gitTree.filterAuthor')}
          title={t('gitTree.filterAuthor')}
          data-testid="author-filter-trigger"
          className={cn(
            'flex h-5 shrink-0 items-center gap-1 rounded px-1 transition-colors',
            hasSelection
              ? 'bg-primary/15 text-primary'
              : 'text-muted-foreground/70 hover:bg-accent hover:text-foreground'
          )}
        >
          <ListFilter className="h-3.5 w-3.5" />
          {hasSelection && (
            <span
              className="text-[9px] font-bold leading-none tabular-nums"
              data-testid="author-filter-count"
            >
              {activeCount}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        className="w-72 p-0"
        // Keep the popover open while toggling authors; only outside clicks / Escape dismiss it.
        onOpenAutoFocus={(e) => e.preventDefault()}
        data-testid="author-filter-popover"
      >
        {hasSelection && (
          <div className="border-b border-border/60 p-2">
            <button
              type="button"
              onClick={() => clear()}
              data-testid="author-filter-clear"
              className="mb-2 flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <X className="h-3 w-3" />
              {t('gitTree.authorFilter.clear')}
            </button>
            <div className="flex flex-wrap gap-1">
              {selectedAuthors.map((a) => (
                <span
                  key={a.email}
                  data-testid={`author-filter-chip-${a.email}`}
                  className="flex max-w-full items-center gap-1 rounded-full bg-accent py-0.5 pl-1 pr-1.5 text-[10px] text-foreground"
                >
                  <AuthorAvatar name={a.name} email={a.email} className="h-3.5 w-3.5 text-[6px]" />
                  <span className="truncate">{a.name}</span>
                  <button
                    type="button"
                    onClick={() => remove(a.email)}
                    aria-label={t('gitTree.authorFilter.remove', { name: a.name })}
                    data-testid={`author-filter-chip-remove-${a.email}`}
                    className="shrink-0 rounded-full text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        <Command>
          <CommandInput placeholder={t('gitTree.authorFilter.placeholder')} />
          <CommandList>
            <CommandEmpty>{t('gitTree.authorFilter.empty')}</CommandEmpty>
            <CommandGroup>
              {authors.map((a) => {
                const isActive = selected.has(a.email)
                return (
                  <CommandItem
                    key={a.email}
                    // `value` feeds cmdk's built-in autocomplete filtering (name + email).
                    value={`${a.name} ${a.email}`}
                    onSelect={() => toggle(a.email)}
                    data-testid={`author-filter-option-${a.email}`}
                    className="gap-2"
                  >
                    <Check className={cn('h-3.5 w-3.5 shrink-0', isActive ? 'opacity-100' : 'opacity-0')} />
                    <AuthorAvatar name={a.name} email={a.email} className="h-4 w-4 text-[7px]" />
                    <span className="truncate">{a.name}</span>
                    <span className="ml-auto shrink-0 text-[10px] text-muted-foreground/60">
                      {a.email}
                    </span>
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
