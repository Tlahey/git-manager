import React, { useState, useEffect, useRef } from 'react'
import { ChevronDown, CheckCircle2 } from 'lucide-react'

export interface MultiSelectDropdownProps {
  label: string
  icon: React.ReactNode
  options: string[]
  selected: Set<string>
  onToggle: (value: string) => void
  onClear: () => void
  /** Label for the "clear all" action, e.g. "Clear all". */
  clearAllLabel: string
  /** Message shown when there are no options, e.g. "No options available". */
  emptyLabel: string
  /** Header label for the active-selection count, e.g. `(n) => `${n} selected``. */
  selectedLabel: (count: number) => string
}

export function MultiSelectDropdown({
  label,
  icon,
  options,
  selected,
  onToggle,
  onClear,
  clearAllLabel,
  emptyLabel,
  selectedLabel,
}: MultiSelectDropdownProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const activeCount = selected.size

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[11px] font-medium transition-all duration-150 ${
          activeCount > 0
            ? 'border-primary/30 bg-primary/10 text-primary shadow-sm shadow-primary/5'
            : open
              ? 'border-border/80 bg-accent/60 text-foreground'
              : 'border-border text-muted-foreground hover:border-border/80 hover:bg-accent/30 hover:text-foreground'
        }`}
      >
        <span className="text-muted-foreground/70">{icon}</span>
        {label}
        {activeCount > 0 && (
          <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary/20 px-1 text-[9px] font-bold leading-none text-primary">
            {activeCount}
          </span>
        )}
        <ChevronDown
          className={`h-2.5 w-2.5 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="animate-in fade-in slide-in-from-top-1 absolute left-0 top-full z-popover mt-1.5 max-h-[280px] min-w-[180px] overflow-hidden rounded-lg border border-border bg-popover shadow-xl duration-150">
          {/* Header with clear button */}
          {activeCount > 0 && (
            <div className="flex items-center justify-between border-b border-border/50 bg-muted/10 px-3 py-1.5">
              <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                {selectedLabel(activeCount)}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onClear()
                }}
                className="text-[9px] text-muted-foreground/60 underline transition-colors hover:text-primary"
              >
                {clearAllLabel}
              </button>
            </div>
          )}

          {/* Options list */}
          <div className="max-h-[240px] overflow-y-auto py-1">
            {options.length === 0 ? (
              <div className="px-3 py-3 text-center text-[10px] italic text-muted-foreground/50">
                {emptyLabel}
              </div>
            ) : (
              options.map((opt) => {
                const isActive = selected.has(opt)
                return (
                  <button
                    key={opt}
                    onClick={() => onToggle(opt)}
                    className="group/opt flex w-full items-center gap-2.5 px-3 py-1.5 text-xs transition-colors hover:bg-accent/50"
                  >
                    <div
                      className={`flex h-3.5 w-3.5 items-center justify-center rounded border transition-all duration-100 ${
                        isActive
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border/80 bg-transparent group-hover/opt:border-muted-foreground/50'
                      }`}
                    >
                      {isActive && <CheckCircle2 className="h-2.5 w-2.5" />}
                    </div>
                    <span
                      className={`truncate transition-colors ${
                        isActive ? 'font-medium text-foreground' : 'text-muted-foreground'
                      }`}
                    >
                      {opt}
                    </span>
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
