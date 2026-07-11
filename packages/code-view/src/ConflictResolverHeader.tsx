import { type ReactNode } from 'react'
import { Wand2, RefreshCw, X, FoldVertical } from 'lucide-react'
import { CombinedMergeIcon } from './conflict-resolver-header/CombinedMergeIcon'
import { HeaderDropdown } from './conflict-resolver-header/HeaderDropdown'

/** Per-button visibility switches for the toolbar. Everything defaults to visible; the wand and
 * recalculate buttons additionally require their corresponding callback to be wired on
 * `ConflictResolver` (no callback ⇒ hidden regardless of this config). */
export interface ConflictResolverActionsConfig {
  navigation?: boolean
  applyNonConflicting?: boolean
  autoMerge?: boolean
  reset?: boolean
  recalculate?: boolean
  whitespace?: boolean
  highlight?: boolean
  stats?: boolean
  collapseUnchanged?: boolean
}

export interface ConflictResolverHeaderProps {
  actions: ConflictResolverActionsConfig
  whitespaceMode: 'compare' | 'ignore' | 'trim'
  setWhitespaceMode: (mode: 'compare' | 'ignore' | 'trim') => void
  highlightMode: 'words' | 'lines'
  setHighlightMode: (mode: 'words' | 'lines') => void
  collapseUnchanged: boolean
  setCollapseUnchanged: (collapse: boolean) => void
  onNavigate: (direction: 'next' | 'prev') => void
  canNavigatePrev: boolean
  canNavigateNext: boolean
  onApplyLeft: () => void
  onApplyRight: () => void
  onApplyAll: () => void
  onApplyAuto?: () => void
  onReset: () => void
  onRecalculate?: () => void
  changesCount: number
  conflictsCount: number
  /** Status nodes rendered above each pane (left / center / right), host-provided — e.g. the
   * desktop app shows "Rebasing <sha> from theirs" here. */
  statuses: [ReactNode, ReactNode, ReactNode]
  panelWidths: [number, number, number]
  gapWidth: number
}

export function ConflictResolverHeader({
  actions,
  whitespaceMode,
  setWhitespaceMode,
  highlightMode,
  setHighlightMode,
  collapseUnchanged,
  setCollapseUnchanged,
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
  statuses,
  panelWidths,
  gapWidth,
}: ConflictResolverHeaderProps) {
  const whitespaceLabels: Record<'compare' | 'ignore' | 'trim', string> = {
    compare: 'Do not ignore',
    ignore: 'Ignore whitespace',
    trim: 'Ignore leading/trailing whitespace',
  }

  const highlightLabels: Record<'words' | 'lines', string> = {
    words: 'Highlight words',
    lines: 'Highlight lines',
  }

  const showNavigation = actions.navigation !== false
  const showApply = actions.applyNonConflicting !== false
  const showAutoMerge = actions.autoMerge !== false && onApplyAuto !== undefined
  const showReset = actions.reset !== false
  const showRecalculate = actions.recalculate !== false && onRecalculate !== undefined
  const showWhitespace = actions.whitespace !== false
  const showHighlight = actions.highlight !== false
  const showStats = actions.stats !== false

  return (
    <div className="flex flex-col w-full bg-[#1b1b1b] border-b border-[#2d2d2d] text-foreground select-none font-sans">
      {/* 1. TOOLBAR SUPÉRIEUR */}
      <div className="flex h-9 items-center justify-between px-3 border-b border-[#2a2a2a] min-w-0">

        {/* Left container: Delta navigation and Apply changes module */}
        <div className="flex items-center gap-1.5 min-w-0 shrink-0">
          {/* A. À gauche : Navigation dans les deltas & fusion globale */}
          {showNavigation && (
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

              {showApply && (
                <>
                  <div className="h-4 w-px bg-[#2d2d2d] mx-1.5" />

                  <button
                    onClick={onApplyAll}
                    className="flex h-6 w-6 items-center justify-center rounded hover:bg-[#2e2e2e] active:bg-[#3e3e3e] text-muted-foreground/80 hover:text-foreground transition-colors"
                    title="Apply all non-conflicting changes"
                    data-testid="merge-apply-all-icon"
                  >
                    <CombinedMergeIcon className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </div>
          )}

          {/* B. Au centre : Module "Apply non-conflicting changes" */}
          {showApply && (
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
              {showAutoMerge && (
                <button
                  onClick={onApplyAuto}
                  className="flex h-6 w-6 items-center justify-center rounded hover:bg-[#2e2e2e] active:bg-[#3e3e3e] text-muted-foreground/80 hover:text-foreground transition-colors ml-0.5"
                  title="Smart auto-resolve lines"
                  data-testid="merge-wand-btn"
                >
                  <Wand2 className="h-3.5 w-3.5" />
                </button>
              )}

              <div className="h-4 w-px bg-[#2d2d2d] mx-1.5 shrink-0" />
            </div>
          )}
        </div>

        {/* D. Au centre : État des conflits */}
        {showStats && (
          <div className="text-[11px] font-medium text-muted-foreground/85 select-none px-4 whitespace-nowrap hidden md:block" data-testid="merge-stats">
            {changesCount} {changesCount === 1 ? 'change' : 'changes'}. {conflictsCount} {conflictsCount === 1 ? 'conflict' : 'conflicts'}.
          </div>
        )}

        {/* C. Au centre-droit : Filtres et confort */}
        <div className="flex items-center gap-1.5 shrink-0">

          {/* Whitespace Dropdown */}
          {showWhitespace && (
            <HeaderDropdown
              options={['compare', 'ignore', 'trim'] as const}
              value={whitespaceMode}
              onChange={setWhitespaceMode}
              labels={whitespaceLabels}
              menuWidthClass="w-52"
              testId="merge-whitespace-dropdown-btn"
            />
          )}

          {/* Highlight Mode Dropdown */}
          {showHighlight && (
            <HeaderDropdown
              options={['words', 'lines'] as const}
              value={highlightMode}
              onChange={setHighlightMode}
              labels={highlightLabels}
              menuWidthClass="w-44"
              testId="merge-highlight-dropdown-btn"
            />
          )}

          {/* Collapse Unchanged Toggle */}
          {actions.collapseUnchanged !== false && (
            <button
              onClick={() => setCollapseUnchanged(!collapseUnchanged)}
              className={`flex h-6 w-6 items-center justify-center rounded border transition-colors ${
                collapseUnchanged
                  ? 'border-[#4b9dfa] bg-[#1e293b] text-[#4b9dfa]'
                  : 'border-[#3c3c3c] bg-[#202020] hover:bg-[#262626] active:bg-[#2c2c2c] text-muted-foreground/80 hover:text-foreground'
              }`}
              title="Collapse unchanged fragments"
              data-testid="merge-collapse-unchanged-btn"
            >
              <FoldVertical className="h-3.5 w-3.5" />
            </button>
          )}

          {/* Reset button (X) */}
          {showReset && (
            <button
              onClick={onReset}
              className="flex h-6 w-6 items-center justify-center rounded hover:bg-[#2e2e2e] active:bg-[#3e3e3e] text-muted-foreground/80 hover:text-foreground transition-colors ml-0.5"
              title="Reset merge decisions"
              data-testid="merge-reset-btn"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}

          {/* Sync / Force Recalculate button */}
          {showRecalculate && (
            <button
              onClick={onRecalculate}
              className="flex h-6 w-6 items-center justify-center rounded hover:bg-[#2e2e2e] active:bg-[#3e3e3e] text-muted-foreground/80 hover:text-foreground transition-colors"
              title="Recalculate diff"
              data-testid="merge-recalc-btn"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          )}

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
          {statuses[0]}
        </div>

        {/* Left Gap Filler */}
        <div style={{ width: gapWidth }} className="shrink-0" />

        {/* B. Au-dessus de l'éditeur CENTRAL */}
        <div
          style={{ flex: `${panelWidths[1]} 1 0%` }}
          className="flex items-center px-3 min-w-0"
          data-testid="merge-header-center-status"
        >
          {statuses[1]}
        </div>

        {/* 2-panel (isTwoWay) mode has no third pane — panelWidths[2] is 0 then. */}
        {panelWidths[2] > 0 && (
          <>
            {/* Right Gap Filler */}
            <div style={{ width: gapWidth }} className="shrink-0" />

            {/* C. Au-dessus de l'éditeur DROIT */}
            <div
              style={{ flex: `${panelWidths[2]} 1 0%` }}
              className="flex items-center px-3 min-w-0"
              data-testid="merge-header-right-status"
            >
              {statuses[2]}
            </div>
          </>
        )}

      </div>
    </div>
  )
}
