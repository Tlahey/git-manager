import type { ReactNode } from 'react'
import { useTranslation } from '@git-manager/i18n'
import {
  Checkbox,
  Tooltip,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@git-manager/ui'
import {
  ChevronDown,
  ChevronRight,
  MoreVertical,
  X,
  RefreshCw,
  ArrowDownToLine,
  Code,
} from 'lucide-react'
import type { PullStrategy } from '../../../lib/tauri'
import type { SectionAction } from '../hooks/useSectionActions'
import type { RepoSelection } from '../hooks/useRepoSelection'
import type { BulkRunState } from '../hooks/useBulkRepoAction'
import { useDashboardStore, type SectionColor } from '../../../stores/dashboard.store'
import { SectionColorPicker, SECTION_COLOR_HEADER } from './SectionColorPicker'
import type { DashboardSectionId } from '../../../stores/dashboard.store'

interface RepoSectionHeaderProps {
  sectionId: DashboardSectionId
  icon: ReactNode
  title: string
  count: number
  isCollapsed: boolean
  onToggleCollapse: () => void
  selection: RepoSelection
  /** Every path in the section — what an action targets when nothing is checked. */
  allPaths: string[]
  lead: SectionAction | null
  showRepoTools: boolean
  extraOptions: SectionAction[]
  onFetch: (paths: string[]) => void
  onPull: (paths: string[], strategy: PullStrategy) => void
  onOpenInEditor: (paths: string[]) => void
  bulkState: BulkRunState
}

const GHOST =
  'flex cursor-pointer items-center gap-1 rounded px-1.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

const PULL_STRATEGIES: { strategy: PullStrategy; labelKey: string }[] = [
  { strategy: 'fast-forward-if-possible', labelKey: 'dashboard.pull.fastForwardIfPossible' },
  { strategy: 'fast-forward-only', labelKey: 'dashboard.pull.fastForwardOnly' },
  { strategy: 'rebase', labelKey: 'dashboard.pull.rebase' },
]

/**
 * The bar above each dashboard section: fold control, select-all, title and count, then the
 * section's actions.
 *
 * Every action targets the checked rows when there are any, and the whole section otherwise — the
 * "N selected" chip is what tells the two apart, so it stays visible next to the buttons rather
 * than replacing them.
 */
export function RepoSectionHeader({
  sectionId,
  icon,
  title,
  count,
  isCollapsed,
  onToggleCollapse,
  selection,
  allPaths,
  lead,
  showRepoTools,
  extraOptions,
  onFetch,
  onPull,
  onOpenInEditor,
  bulkState,
}: RepoSectionHeaderProps) {
  const { t } = useTranslation('dashboard')
  const hideSection = useDashboardStore((s) => s.hideSection)
  const sectionColor = useDashboardStore((s) => s.sectionColors[sectionId] ?? null)
  const setSectionColor = useDashboardStore((s) => s.setSectionColor)

  // Nothing checked means "act on the whole section" — the same rule for every action here.
  const targets = selection.selectedPaths.length > 0 ? selection.selectedPaths : allPaths
  const hasRepos = count > 0
  const busy = bulkState.isRunning

  function pickColor(color: SectionColor | null) {
    setSectionColor(sectionId, color)
  }

  return (
    <div
      data-testid={`dashboard-section-header-${sectionId}`}
      data-color={sectionColor ?? 'none'}
      className={`flex items-center gap-2 rounded-md px-2 py-1.5 ${
        sectionColor ? SECTION_COLOR_HEADER[sectionColor] : 'bg-muted/30'
      }`}
    >
      <Tooltip
        content={isCollapsed ? t('dashboard.section.expand') : t('dashboard.section.collapse')}
      >
        <button
          type="button"
          data-testid={`dashboard-section-toggle-${sectionId}`}
          aria-expanded={!isCollapsed}
          aria-label={isCollapsed ? t('dashboard.section.expand') : t('dashboard.section.collapse')}
          onClick={onToggleCollapse}
          className="flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {isCollapsed ? (
            <ChevronRight className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </button>
      </Tooltip>

      {hasRepos && (
        <Checkbox
          data-testid={`dashboard-section-select-all-${sectionId}`}
          checked={selection.allSelected}
          indeterminate={selection.someSelected}
          onChange={selection.toggleAll}
          aria-label={t('dashboard.section.selectAll')}
        />
      )}

      <span className="shrink-0">{icon}</span>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">{title}</h3>
      <span className="rounded-full bg-muted/70 px-1.5 py-0.5 font-mono text-[10px] leading-none text-muted-foreground">
        {count}
      </span>

      {selection.selectedPaths.length > 0 && (
        <span
          data-testid={`dashboard-section-selected-count-${sectionId}`}
          className="font-mono text-[10px] text-muted-foreground"
        >
          {t('dashboard.bulk.selected', { count: selection.selectedPaths.length })}
        </span>
      )}

      {busy && (
        <span
          data-testid={`dashboard-section-progress-${sectionId}`}
          className="font-mono text-[10px] text-muted-foreground"
        >
          {t('dashboard.bulk.running', { done: bulkState.done, total: bulkState.total })}
        </span>
      )}

      <div className="ml-auto flex items-center gap-1">
        {lead && hasRepos && (
          <button
            type="button"
            data-testid={`dashboard-section-lead-${sectionId}`}
            onClick={() => lead.run(targets)}
            className={`${GHOST} hover:bg-destructive/10 hover:text-destructive`}
          >
            <X className="h-3 w-3" />
            {lead.label}
          </button>
        )}

        {showRepoTools && hasRepos && (
          <>
            <Tooltip content={t('dashboard.section.fetchRepos')}>
              <button
                type="button"
                data-testid={`dashboard-section-fetch-${sectionId}`}
                aria-label={t('dashboard.section.fetchRepos')}
                disabled={busy}
                onClick={() => onFetch(targets)}
                className={GHOST}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} />
              </button>
            </Tooltip>

            {/* One icon button rather than a split control: the chevron is part of it, and every
                strategy — including git's default — is picked from the menu, so a click can never
                run a pull the user didn't choose. */}
            <DropdownMenu>
              <Tooltip content={t('dashboard.section.pullRepos')}>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    data-testid={`dashboard-section-pull-${sectionId}`}
                    aria-label={t('dashboard.section.pullRepos')}
                    disabled={busy}
                    className={GHOST}
                  >
                    <ArrowDownToLine className="h-3.5 w-3.5" />
                    <ChevronDown className="h-3 w-3" />
                  </button>
                </DropdownMenuTrigger>
              </Tooltip>
              <DropdownMenuContent align="end" className="w-64">
                {PULL_STRATEGIES.map(({ strategy, labelKey }) => (
                  <DropdownMenuItem
                    key={strategy}
                    data-testid={`dashboard-section-pull-${sectionId}-${strategy}`}
                    onSelect={() => onPull(targets, strategy)}
                    className="text-xs"
                  >
                    {t(labelKey)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <Tooltip content={t('dashboard.section.openInEditor')}>
              <button
                type="button"
                data-testid={`dashboard-section-editor-${sectionId}`}
                aria-label={t('dashboard.section.openInEditor')}
                disabled={busy}
                onClick={() => onOpenInEditor(targets)}
                className={GHOST}
              >
                <Code className="h-3.5 w-3.5" />
              </button>
            </Tooltip>
          </>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              data-testid={`dashboard-section-menu-${sectionId}`}
              aria-label={t('dashboard.section.options')}
              className={GHOST}
            >
              <MoreVertical className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuItem
              data-testid={`dashboard-section-menu-${sectionId}-hide`}
              onSelect={() => hideSection(sectionId)}
              className="text-xs"
            >
              {t('dashboard.section.hide')}
            </DropdownMenuItem>

            {hasRepos && (
              <>
                <DropdownMenuItem
                  data-testid={`dashboard-section-menu-${sectionId}-select-all`}
                  onSelect={() => selection.selectAll()}
                  className="text-xs"
                >
                  {t('dashboard.section.selectAll')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  data-testid={`dashboard-section-menu-${sectionId}-unselect-all`}
                  onSelect={() => selection.clear()}
                  className="text-xs"
                >
                  {t('dashboard.section.unselectAll')}
                </DropdownMenuItem>
              </>
            )}

            {extraOptions.map((action) => (
              <DropdownMenuItem
                key={action.id}
                data-testid={`dashboard-section-menu-${sectionId}-${action.id}`}
                onSelect={() => action.run(targets)}
                className="text-xs"
              >
                {action.label}
              </DropdownMenuItem>
            ))}

            <DropdownMenuSeparator />
            {/* Kept open on click: the swatches live inside the menu, so selecting one must not
                dismiss it before the click lands. */}
            <div
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
              role="presentation"
            >
              <p className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                {t('dashboard.section.changeColor')}
              </p>
              <SectionColorPicker sectionId={sectionId} value={sectionColor} onChange={pickColor} />
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
