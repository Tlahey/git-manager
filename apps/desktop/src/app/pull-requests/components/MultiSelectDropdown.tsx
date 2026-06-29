import React, { useState, useEffect, useRef } from 'react'
import { ChevronDown, CheckCircle2 } from 'lucide-react'

interface MultiSelectDropdownProps {
  label: string
  icon: React.ReactNode
  options: string[]
  selected: Set<string>
  onToggle: (value: string) => void
  onClear: () => void
}

export function MultiSelectDropdown({
  label,
  icon,
  options,
  selected,
  onToggle,
  onClear,
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
        className={`flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-[11px] font-medium transition-all duration-150 ${
          activeCount > 0
            ? 'bg-primary/10 border-primary/30 text-primary shadow-sm shadow-primary/5'
            : open
              ? 'bg-accent/60 border-border/80 text-foreground'
              : 'border-border text-muted-foreground hover:text-foreground hover:border-border/80 hover:bg-accent/30'
        }`}
      >
        <span className="text-muted-foreground/70">{icon}</span>
        {label}
        {activeCount > 0 && (
          <span className="flex items-center justify-center min-w-[16px] h-4 rounded-full bg-primary/20 text-primary text-[9px] font-bold px-1 leading-none">
            {activeCount}
          </span>
        )}
        <ChevronDown
          className={`h-2.5 w-2.5 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1.5 min-w-[180px] max-h-[280px] rounded-lg border border-border bg-popover shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
          {/* Header with clear button */}
          {activeCount > 0 && (
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/50 bg-muted/10">
              <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                {activeCount} selected
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onClear()
                }}
                className="text-[9px] text-muted-foreground/60 hover:text-primary underline transition-colors"
              >
                Clear all
              </button>
            </div>
          )}

          {/* Options list */}
          <div className="overflow-y-auto max-h-[240px] py-1">
            {options.length === 0 ? (
              <div className="px-3 py-3 text-[10px] text-muted-foreground/50 text-center italic">
                No options available
              </div>
            ) : (
              options.map((opt) => {
                const isActive = selected.has(opt)
                return (
                  <button
                    key={opt}
                    onClick={() => onToggle(opt)}
                    className="flex w-full items-center gap-2.5 px-3 py-1.5 text-xs transition-colors hover:bg-accent/50 group/opt"
                  >
                    <div
                      className={`flex items-center justify-center w-3.5 h-3.5 rounded border transition-all duration-100 ${
                        isActive
                          ? 'bg-primary border-primary text-primary-foreground'
                          : 'border-border/80 bg-transparent group-hover/opt:border-muted-foreground/50'
                      }`}
                    >
                      {isActive && <CheckCircle2 className="h-2.5 w-2.5" />}
                    </div>
                    <span
                      className={`truncate transition-colors ${
                        isActive ? 'text-foreground font-medium' : 'text-muted-foreground'
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
