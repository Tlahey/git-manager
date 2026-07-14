import { useState } from 'react'
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@git-manager/ui'
import type { AiPresetDefinition, AiPresetId } from '@git-manager/ai'

interface ProviderComboboxProps {
  presets: AiPresetDefinition[]
  value: AiPresetId
  onChange: (id: AiPresetId) => void
  searchPlaceholder: string
  emptyLabel: string
  comingSoonLabel: string
}

/** Searchable provider picker (Popover + cmdk list) — presentational, no store/IPC of its own. */
export function ProviderCombobox({
  presets,
  value,
  onChange,
  searchPlaceholder,
  emptyLabel,
  comingSoonLabel,
}: ProviderComboboxProps) {
  const [open, setOpen] = useState(false)
  const selected = presets.find((preset) => preset.id === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          data-testid="ai-provider-select"
          className="h-8 w-full justify-between font-normal text-xs"
        >
          {selected?.label ?? value}
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width,280px)] p-0"
        align="start"
      >
        <Command>
          <CommandInput data-testid="ai-provider-search" placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyLabel}</CommandEmpty>
            <CommandGroup>
              {presets.map((preset) => (
                <CommandItem
                  key={preset.id}
                  value={preset.label}
                  disabled={!preset.implemented}
                  data-testid={`ai-provider-option-${preset.id}`}
                  onSelect={() => {
                    onChange(preset.id)
                    setOpen(false)
                  }}
                >
                  <Check
                    className={cn(
                      'h-3.5 w-3.5',
                      preset.id === value ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  {preset.label}
                  {!preset.implemented && (
                    <span className="ml-auto text-[11px] text-muted-foreground">
                      {comingSoonLabel}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
