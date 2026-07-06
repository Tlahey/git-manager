import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Wand2, RefreshCw, Lock, X } from 'lucide-react'

// Custom SVG global merge icon (branch merge symbol)
const CombinedMergeIcon = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    {/* Horizontal line with left arrow */}
    <path d="M12 5H4M7 2L4 5l3 3" />
    {/* Branch curve merging downward */}
    <path d="M4 11h5a3 3 0 0 0 3-3V7" />
    <path d="m10 9 2 2-2 2" />
  </svg>
)

export interface MergeHeaderProps {
  whitespaceMode: 'compare' | 'ignore' | 'trim'
  setWhitespaceMode: (mode: 'compare' | 'ignore' | 'trim') => void
  highlightMode: 'words' | 'lines'
  setHighlightMode: (mode: 'words' | 'lines') => void
  onNavigate: (direction: 'next' | 'prev') => void
  canNavigatePrev: boolean
  canNavigateNext: boolean
  onApplyLeft: () => void
  onApplyRight: () => void
  onApplyAll: () => void
  onApplyAuto: () => void
  onReset: () => void
  onRecalculate: () => void
  changesCount: number
  conflictsCount: number
  commitSha: string
  fileName: string
  panelWidths: [number, number, number]
  gapWidth: number
}

export function MergeHeader({
  whitespaceMode,
  setWhitespaceMode,
  highlightMode,
  setHighlightMode,
  onNavigate,
  canNavigatePrev,
  canNavigateNext,
  onApplyLeft,
  onApplyRight,
  onApplyAll,
  onApplyAuto,
  onReset,
  onRecalculate,
  changesCount,
  conflictsCount,
  commitSha,
  fileName,
  panelWidths,
  gapWidth,
}: MergeHeaderProps) {
  const [whitespaceOpen, setWhitespaceOpen] = useState(false)
  const [highlightOpen, setHighlightOpen] = useState(false)

  const whitespaceRef = useRef<HTMLDivElement>(null)
  const highlightRef = useRef<HTMLDivElement>(null)

  // Handle click outside to close dropdowns
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (whitespaceRef.current && !whitespaceRef.current.contains(event.target as Node)) {
        setWhitespaceOpen(false)
      }
      if (highlightRef.current && !highlightRef.current.contains(event.target as Node)) {
        setHighlightOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const whitespaceLabels = {
    compare: 'Do not ignore',
    ignore: 'Ignore whitespace',
    trim: 'Ignore leading/trailing whitespace',
  }

  const highlightLabels = {
    words: 'Highlight words',
    lines: 'Highlight lines',
  }

  return (
    <div className="flex flex-col w-full bg-[#1b1b1b] border-b border-[#2d2d2d] text-foreground select-none font-sans">
      {/* 1. TOOLBAR SUPÉRIEUR */}
      <div className="flex h-9 items-center justify-between px-3 border-b border-[#2a2a2a] min-w-0">
        
        {/* Left container: Delta navigation and Apply changes module */}
        <div className="flex items-center gap-1.5 min-w-0 shrink-0">
          {/* A. À gauche : Navigation dans les deltas & fusion globale */}
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              onClick={() => onNavigate('prev')}
              disabled={!canNavigatePrev}
              className="flex h-6 w-6 items-center justify-center rounded hover:bg-[#2e2e2e] active:bg-[#3e3e3e] text-muted-foreground/80 hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent disabled:text-muted-foreground/45 transition-colors"
              title="Go to previous conflict/change"
              data-testid="merge-nav-prev"
            >
              <span className="text-sm font-bold">↑</span>
            </button>
            <button
              onClick={() => onNavigate('next')}
              disabled={!canNavigateNext}
              className="flex h-6 w-6 items-center justify-center rounded hover:bg-[#2e2e2e] active:bg-[#3e3e3e] text-muted-foreground/80 hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent disabled:text-muted-foreground/45 transition-colors"
              title="Go to next conflict/change"
              data-testid="merge-nav-next"
            >
              <span className="text-sm font-bold">↓</span>
            </button>
            
            <div className="h-4 w-px bg-[#2d2d2d] mx-1.5" />
            
            <button
              onClick={onApplyAll}
              className="flex h-6 w-6 items-center justify-center rounded hover:bg-[#2e2e2e] active:bg-[#3e3e3e] text-muted-foreground/80 hover:text-foreground transition-colors"
              title="Apply all non-conflicting changes"
              data-testid="merge-apply-all-icon"
            >
              <CombinedMergeIcon className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* B. Au centre : Module "Apply non-conflicting changes" */}
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[11px] text-muted-foreground/70 mr-1 truncate">
              Apply non-conflicting changes:
            </span>
            <button
              onClick={onApplyLeft}
              className="text-[11px] font-medium px-2 py-0.5 rounded border border-[#3e3e3e] bg-[#242424] hover:bg-[#2e2e2e] active:bg-[#363636] text-foreground/90 transition-colors shadow-sm whitespace-nowrap"
              data-testid="merge-apply-left-btn"
            >
              » Left
            </button>
            <button
              onClick={onApplyAll}
              className="text-[11px] font-medium px-2 py-0.5 rounded border border-[#3e3e3e] bg-[#242424] hover:bg-[#2e2e2e] active:bg-[#363636] text-foreground/90 transition-colors shadow-sm whitespace-nowrap"
              data-testid="merge-apply-all-btn"
            >
              »« All
            </button>
            <button
              onClick={onApplyRight}
              className="text-[11px] font-medium px-2 py-0.5 rounded border border-[#3e3e3e] bg-[#242424] hover:bg-[#2e2e2e] active:bg-[#363636] text-foreground/90 transition-colors shadow-sm whitespace-nowrap"
              data-testid="merge-apply-right-btn"
            >
              « Right
            </button>
            <button
              onClick={onApplyAuto}
              className="flex h-6 w-6 items-center justify-center rounded hover:bg-[#2e2e2e] active:bg-[#3e3e3e] text-muted-foreground/80 hover:text-foreground transition-colors ml-0.5"
              title="Smart auto-resolve lines"
              data-testid="merge-wand-btn"
            >
              <Wand2 className="h-3.5 w-3.5" />
            </button>
            
            <div className="h-4 w-px bg-[#2d2d2d] mx-1.5 shrink-0" />
          </div>
        </div>

        {/* D. Au centre : État des conflits */}
        <div className="text-[11px] font-medium text-muted-foreground/85 select-none px-4 whitespace-nowrap hidden md:block">
          {changesCount} {changesCount === 1 ? 'change' : 'changes'}. {conflictsCount} {conflictsCount === 1 ? 'conflict' : 'conflicts'}.
        </div>

        {/* C. Au centre-droit : Filtres et confort */}
        <div className="flex items-center gap-1.5 shrink-0">
          
          {/* Whitespace Dropdown */}
          <div className="relative" ref={whitespaceRef}>
            <button
              onClick={() => setWhitespaceOpen(!whitespaceOpen)}
              className="flex items-center justify-between gap-1 text-[11px] h-6 px-2.5 rounded border border-[#3c3c3c] bg-[#202020] hover:bg-[#262626] active:bg-[#2c2c2c] text-foreground/90 transition-colors"
              data-testid="merge-whitespace-dropdown-btn"
            >
              <span>{whitespaceLabels[whitespaceMode]}</span>
              <ChevronDown className="h-3 w-3 text-muted-foreground/60" />
            </button>
            {whitespaceOpen && (
              <div className="absolute right-0 mt-1 w-52 rounded-md bg-[#252525] border border-[#3c3c3c] shadow-lg z-50 py-1 text-[11px] animate-fadeIn">
                {(['compare', 'ignore', 'trim'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => {
                      setWhitespaceMode(mode)
                      setWhitespaceOpen(false)
                    }}
                    className={`w-full text-left px-3 py-1.5 hover:bg-[#343434] transition-colors ${
                      whitespaceMode === mode ? 'text-[#4b9dfa] font-semibold' : 'text-foreground/80'
                    }`}
                  >
                    {whitespaceLabels[mode]}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Highlight Mode Dropdown */}
          <div className="relative" ref={highlightRef}>
            <button
              onClick={() => setHighlightOpen(!highlightOpen)}
              className="flex items-center justify-between gap-1 text-[11px] h-6 px-2.5 rounded border border-[#3c3c3c] bg-[#202020] hover:bg-[#262626] active:bg-[#2c2c2c] text-foreground/90 transition-colors"
              data-testid="merge-highlight-dropdown-btn"
            >
              <span>{highlightLabels[highlightMode]}</span>
              <ChevronDown className="h-3 w-3 text-muted-foreground/60" />
            </button>
            {highlightOpen && (
              <div className="absolute right-0 mt-1 w-44 rounded-md bg-[#252525] border border-[#3c3c3c] shadow-lg z-50 py-1 text-[11px] animate-fadeIn">
                {(['words', 'lines'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => {
                      setHighlightMode(mode)
                      setHighlightOpen(false)
                    }}
                    className={`w-full text-left px-3 py-1.5 hover:bg-[#343434] transition-colors ${
                      highlightMode === mode ? 'text-[#4b9dfa] font-semibold' : 'text-foreground/80'
                    }`}
                  >
                    {highlightLabels[mode]}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Reset button (X) */}
          <button
            onClick={onReset}
            className="flex h-6 w-6 items-center justify-center rounded hover:bg-[#2e2e2e] active:bg-[#3e3e3e] text-muted-foreground/80 hover:text-foreground transition-colors ml-0.5"
            title="Reset merge decisions"
            data-testid="merge-reset-btn"
          >
            <X className="h-3.5 w-3.5" />
          </button>

          {/* Sync / Force Recalculate button */}
          <button
            onClick={onRecalculate}
            className="flex h-6 w-6 items-center justify-center rounded hover:bg-[#2e2e2e] active:bg-[#3e3e3e] text-muted-foreground/80 hover:text-foreground transition-colors"
            title="Recalculate diff"
            data-testid="merge-recalc-btn"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>



        </div>
      </div>

      {/* 2. LE STATUS & CONTEXT BAR */}
      <div className="flex h-7 w-full items-center bg-[#151515] py-0.5 px-0 text-[11px] select-none text-muted-foreground/80 border-b border-[#232323]">
        
        {/* A. Au-dessus de l'éditeur GAUCHE */}
        <div
          style={{ flex: `${panelWidths[0]} 1 0%` }}
          className="flex items-center px-3 min-w-0"
          data-testid="merge-header-left-status"
        >
          <div className="flex items-center gap-1.5 min-w-0 text-muted-foreground/75">
            <Lock className="h-3 w-3 shrink-0 text-muted-foreground/45" />
            <span className="truncate">
              Rebasing <span className="font-mono text-foreground/90 font-medium">{commitSha}</span> from <strong className="text-foreground/95 font-semibold">theirs</strong>
            </span>
          </div>
        </div>

        {/* Left Gap Filler */}
        <div style={{ width: gapWidth }} className="shrink-0" />

        {/* B. Au-dessus de l'éditeur CENTRAL */}
        <div
          style={{ flex: `${panelWidths[1]} 1 0%` }}
          className="flex items-center px-3 min-w-0"
          data-testid="merge-header-center-status"
        >
          <div className="truncate text-muted-foreground/70">
            <span className="text-foreground/95 font-semibold text-xs mr-1">Result</span>
            <span className="font-mono text-muted-foreground/85">{fileName}</span>
          </div>
        </div>

        {/* Right Gap Filler */}
        <div style={{ width: gapWidth }} className="shrink-0" />

        {/* C. Au-dessus de l'éditeur DROIT */}
        <div
          style={{ flex: `${panelWidths[2]} 1 0%` }}
          className="flex items-center px-3 min-w-0"
          data-testid="merge-header-right-status"
        >
          <div className="flex items-center gap-1.5 min-w-0 text-muted-foreground/75">
            <Lock className="h-3 w-3 shrink-0 text-muted-foreground/45" />
            <span className="truncate">
              Already rebased commits and commits from <strong className="text-foreground/95 font-semibold">ours</strong>
            </span>
          </div>
        </div>

      </div>
    </div>
  )
}
