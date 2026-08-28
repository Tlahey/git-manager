import { useTranslation } from '@git-manager/i18n'
import { ToggleGroup, Tooltip, cn } from '@git-manager/ui'
import { ChevronDown, ChevronRight, FolderTree, List, Plus, Minus } from 'lucide-react'

interface CommitFileListHeaderProps {
  title: string
  collapsible?: boolean
  collapsed: boolean
  onToggleCollapse: () => void
  bodyVisible: boolean
  viewMode: 'tree' | 'list'
  onViewModeChange: (mode: 'tree' | 'list') => void
  showExpandCollapseAll: boolean
  expandCollapseButtonState: 'expand' | 'collapse'
  onToggleExpandAll: () => void
  hoverStage?: 'add' | 'remove'
  onBulkStage?: () => void
  bulkStageTestId: string
}

/** The row above a {@link CommitFileList}'s body: its title, the optional collapse toggle and
 * bulk stage/unstage button, the expand/collapse-all link, and the tree/list view switch. */
export function CommitFileListHeader({
  title,
  collapsible,
  collapsed,
  onToggleCollapse,
  bodyVisible,
  viewMode,
  onViewModeChange,
  showExpandCollapseAll,
  expandCollapseButtonState,
  onToggleExpandAll,
  hoverStage,
  onBulkStage,
  bulkStageTestId,
}: CommitFileListHeaderProps) {
  const { t } = useTranslation('git')

  return (
    <div
      onClick={collapsible ? onToggleCollapse : undefined}
      className={cn(
        'flex items-center justify-between transition-colors',
        collapsible
          ? 'cursor-pointer bg-muted/15 px-3 py-2 select-none hover:bg-muted/25'
          : 'rounded-lg border border-border/30 bg-muted/10 p-1.5'
      )}
      role={collapsible ? 'button' : undefined}
      tabIndex={collapsible ? 0 : undefined}
      onKeyDown={
        collapsible
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') onToggleCollapse()
            }
          : undefined
      }
      data-testid={collapsible ? 'file-list-zone-header' : undefined}
    >
      <div className="flex items-center gap-2 pl-1">
        {collapsible &&
          (collapsed ? (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          ))}
        <span className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase select-none">
          {title}
        </span>
        {onBulkStage && hoverStage && (
          <Tooltip
            content={hoverStage === 'add' ? t('workingTree.stageAll') : t('workingTree.unstageAll')}
          >
            <button
              onClick={(e) => {
                e.stopPropagation()
                onBulkStage()
              }}
              className={cn(
                'flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded border transition-colors',
                hoverStage === 'add'
                  ? 'border-green-500/40 text-green-500 hover:bg-green-500/10'
                  : 'border-red-500/40 text-red-500 hover:bg-red-500/10'
              )}
              aria-label={
                hoverStage === 'add' ? t('workingTree.stageAll') : t('workingTree.unstageAll')
              }
              data-testid={bulkStageTestId}
            >
              {hoverStage === 'add' ? (
                <Plus className="h-2.5 w-2.5" />
              ) : (
                <Minus className="h-2.5 w-2.5" />
              )}
            </button>
          </Tooltip>
        )}
        {bodyVisible && viewMode === 'tree' && showExpandCollapseAll && (
          <>
            <span className="text-[10px] text-muted-foreground/30 select-none">•</span>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onToggleExpandAll()
              }}
              className="cursor-pointer text-[10px] font-semibold text-primary hover:underline"
            >
              {expandCollapseButtonState === 'expand'
                ? t('commitDetails.expandAll')
                : t('commitDetails.collapseAll')}
            </button>
          </>
        )}
      </div>
      {/* Always rendered (even collapsed) so the header row's height stays constant —
          `invisible` hides it without collapsing its box, avoiding layout shift on toggle. */}
      <div className={cn(!bodyVisible && 'invisible')} onClick={(e) => e.stopPropagation()}>
        <ToggleGroup
          value={viewMode}
          onValueChange={onViewModeChange}
          options={[
            {
              value: 'tree',
              icon: <FolderTree className="h-3.5 w-3.5" />,
              label: t('commitDetails.viewModeTree') || 'Tree structure',
            },
            {
              value: 'list',
              icon: <List className="h-3.5 w-3.5" />,
              label: t('commitDetails.viewModeList') || 'Flat list',
            },
          ]}
        />
      </div>
    </div>
  )
}
