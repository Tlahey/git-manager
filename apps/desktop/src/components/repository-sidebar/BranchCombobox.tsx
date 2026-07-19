import { useEffect, useRef, useState } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'
import {
  Button,
  cn,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandInput,
  CommandList,
} from '@git-manager/ui'

export interface BranchComboboxOption {
  shortName: string
  /** True when the branch is already checked out by an existing worktree (main included). */
  isCheckedOut: boolean
}

interface BranchComboboxProps {
  branches: BranchComboboxOption[]
  value: string
  onChange: (branch: string) => void
  placeholder: string
  searchPlaceholder: string
  emptyLabel: string
  inUseLabel: string
}

/** Searchable base-branch picker. The dropdown is rendered inline (NOT through a portal) so it stays
 * inside the Dialog's focus scope — a portaled Popover fights the Dialog's focus trap and snaps shut
 * the moment cmdk's input grabs focus. Lists every local branch so the current one can be the
 * default; branches already used by a worktree stay selectable but are flagged, the parent decides
 * whether to block on them. */
export function BranchCombobox({
  branches,
  value,
  onChange,
  placeholder,
  searchPlaceholder,
  emptyLabel,
  inUseLabel,
}: BranchComboboxProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Close on a click anywhere outside the picker. Capture phase so we see the event before cmdk's
  // own handlers; clicks on the trigger/list are inside `containerRef`, so they don't close it.
  useEffect(() => {
    if (!open) return
    function handlePointerDown(event: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', handlePointerDown, true)
    return () => document.removeEventListener('pointerdown', handlePointerDown, true)
  }, [open])

  return (
    <div ref={containerRef} className="relative">
      <Button
        type="button"
        variant="outline"
        role="combobox"
        aria-expanded={open}
        data-testid="worktree-add-branch-select"
        onClick={() => setOpen((prev) => !prev)}
        className="h-8 w-full justify-between font-normal text-sm"
      >
        <span className="truncate">{value || placeholder}</span>
        <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
      </Button>
      {open && (
        <div
          className="absolute left-0 top-full z-popover mt-1 w-full rounded-md border border-border bg-popover shadow-lg"
          onKeyDown={(event) => {
            // Swallow Escape so it dismisses the dropdown without also closing the parent Dialog.
            if (event.key === 'Escape') {
              event.stopPropagation()
              setOpen(false)
            }
          }}
        >
          <Command>
            <CommandInput
              autoFocus
              data-testid="worktree-add-branch-search"
              placeholder={searchPlaceholder}
            />
            <CommandList>
              <CommandEmpty>{emptyLabel}</CommandEmpty>
              <CommandGroup>
                {branches.map((b) => (
                  <CommandItem
                    key={b.shortName}
                    value={b.shortName}
                    data-testid={`worktree-add-branch-option-${b.shortName}`}
                    onSelect={() => {
                      onChange(b.shortName)
                      setOpen(false)
                    }}
                  >
                    <Check
                      className={cn(
                        'h-3.5 w-3.5',
                        b.shortName === value ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                    <span className="truncate">{b.shortName}</span>
                    {b.isCheckedOut && (
                      <span className="ml-auto text-[11px] text-muted-foreground">{inUseLabel}</span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </div>
      )}
    </div>
  )
}
