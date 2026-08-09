import { Button, Badge, Tag, Tooltip, cn } from '@git-manager/ui'
import {
  X,
  Copy,
  Check as CheckedIcon,
  GitCompare,
  FileText,
  Eye,
  History,
  UserSearch,
} from 'lucide-react'
import { useTranslation } from '@git-manager/i18n'
import type { GitDiffFile } from '@git-manager/git-types'
import './diffToolbar.css'

const STATUS_LABEL_KEYS: Record<string, string> = {
  added: 'diffToolbar.status.added',
  modified: 'diffToolbar.status.modified',
  deleted: 'diffToolbar.status.deleted',
  renamed: 'diffToolbar.status.renamed',
  copied: 'diffToolbar.status.copied',
  typechange: 'diffToolbar.status.typechange',
  untracked: 'diffToolbar.status.untracked',
}

const STATUS_VARIANTS: Record<string, 'success' | 'destructive' | 'secondary' | 'warning'> = {
  added: 'success',
  modified: 'secondary',
  deleted: 'destructive',
  renamed: 'warning',
  copied: 'success',
  typechange: 'secondary',
  untracked: 'secondary',
}

interface DiffToolbarProps {
  parsedPath: { dir: string; name: string }
  diffData: GitDiffFile | undefined
  file: { path: string; staged: boolean; oid?: string }
  isWip: boolean
  copied: boolean
  onCopyPath: () => void
  onClose: () => void
  activeTab: 'diff' | 'file' | 'preview'
  onChangeActiveTab: (tab: 'diff' | 'file' | 'preview') => void
  activeLeftPanel: 'sidebar' | 'blame' | 'history'
  onChangeActiveLeftPanel: (panel: 'sidebar' | 'blame' | 'history') => void
  hasPreview?: boolean
}

/**
 * Header/toolbar for `DiffViewCenter`: file identity + status, diff/file view tabs, and the
 * blame/history toggle.
 *
 * It carries no stage/discard actions, deliberately. It used to, and that made the same file
 * stageable from two places at once — here and in the working-tree panel on the right, which is
 * where every other file in the change set is acted on. One file behaving differently from its
 * neighbours because it happens to be the one open is the kind of split that costs more than the
 * shortcut saves; the viewer shows, the panel acts.
 *
 * Diff-viewing controls (change navigation, whitespace, collapse-unchanged) live in
 * `ConflictResolver`'s own header now that the diff tab renders through `@git-manager/editor`'s
 * `ThreeWayMergeEditor` instead of a raw Monaco diff editor. Purely presentational — all state
 * and handlers live in `DiffViewCenter`.
 */
export function DiffToolbar({
  parsedPath,
  diffData,
  file,
  isWip,
  copied,
  onCopyPath,
  onClose,
  activeTab,
  onChangeActiveTab,
  activeLeftPanel,
  onChangeActiveLeftPanel,
  hasPreview,
}: DiffToolbarProps) {
  const { t } = useTranslation('git')

  return (
    // `diff-toolbar` declares the container the labels' folding is queried against — see
    // diffToolbar.css. The browser owns that decision entirely; nothing here re-renders for it.
    <div className="diff-toolbar flex shrink-0 items-center justify-between gap-2 overflow-hidden border-b border-border bg-card px-4 py-3 shadow-xs">
      {/* Left Side: file info */}
      {/* `overflow-hidden` is what makes an overlap impossible rather than unlikely: this column is
          the only one allowed to shrink, and without it its badges and path keep their intrinsic
          width and paint straight over the tabs once the pane gets tight. Clipping is the graceful
          failure; the folding in diffToolbar.css is what keeps it from being reached at all. */}
      <div className="flex min-w-44 flex-1 items-center gap-3 overflow-hidden">
        {/* No back chevron here. It did exactly what the X on the right of this same bar does, and
            said it worse: "Back to the graph" is the label whichever view opened the diff, so on the
            files view it named a screen that wasn't behind it. One way out, correctly labelled. */}

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {parsedPath.dir && (
            <span
              data-testid="diff-header-path"
              className="mb-0.5 truncate font-mono text-[10px] leading-none text-muted-foreground select-none"
            >
              {parsedPath.dir}
            </span>
          )}
          <div className="flex items-center gap-2">
            <span
              data-testid="diff-header-name"
              className="truncate font-mono text-xs leading-tight text-foreground select-all"
            >
              {parsedPath.name}
            </span>
            <Tooltip content={t('actions.copyPath')}>
              <Button
                data-testid="diff-copy-path-btn"
                variant="ghost"
                size="icon"
                className="h-5 w-5 shrink-0 hover:bg-accent"
                onClick={onCopyPath}
                aria-label={t('actions.copyPath')}
              >
                {copied ? (
                  <CheckedIcon className="h-3 w-3 text-green-400" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </Button>
            </Tooltip>
          </div>

          {diffData && (
            // One line, clipped — never wrapped: stacking the counts under the status is what turned
            // a cramped toolbar into three overlapping rows.
            <div className="mt-0.5 flex items-center gap-1.5 overflow-hidden">
              <Badge
                variant={STATUS_VARIANTS[diffData.status] ?? 'secondary'}
                className="shrink-0 px-1 py-0 text-[9px] select-none"
              >
                {diffData.status in STATUS_LABEL_KEYS
                  ? t(STATUS_LABEL_KEYS[diffData.status])
                  : diffData.status}
              </Badge>
              {/* Counts go through `Tag`, like every other count in the app: its tone tokens are
                  graded against each theme's surfaces, which raw green/red shades are not. */}
              {!diffData.isBinary && (
                <>
                  <Tag tone="success" data-testid="diff-additions" className="shrink-0 select-none">
                    +{diffData.additions}
                  </Tag>
                  <Tag tone="danger" data-testid="diff-deletions" className="shrink-0 select-none">
                    -{diffData.deletions}
                  </Tag>
                </>
              )}
              {isWip && (
                <Badge
                  variant={file.staged ? 'success' : 'secondary'}
                  className="shrink-0 px-1 py-0 text-[9px] select-none"
                >
                  {file.staged ? t('diffToolbar.staged') : t('diffToolbar.unstaged')}
                </Badge>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Center: View mode tabs (Diff, File, Preview) */}
      {/* Diff and File are always offered, images included: a PNG's diff is the binary placeholder
          (which is the answer to "what changed?"), and an SVG or an ICO diffs and reads as text
          just fine. Hiding them left `activeTab` pointing at a tab with no button to leave it. */}
      <div className="flex shrink-0 items-center rounded-lg border border-border/50 bg-muted/60 p-0.5">
        <ViewTab
          id="diff"
          icon={<GitCompare className="h-3.5 w-3.5" />}
          label={t('diffToolbar.tabDiff')}
          isActive={activeTab === 'diff'}
          onSelect={() => onChangeActiveTab('diff')}
        />
        <ViewTab
          id="file"
          icon={<FileText className="h-3.5 w-3.5" />}
          label={t('diffToolbar.tabFile')}
          isActive={activeTab === 'file'}
          onSelect={() => onChangeActiveTab('file')}
        />
        {hasPreview && (
          <ViewTab
            id="preview"
            icon={<Eye className="h-3.5 w-3.5" />}
            label={t('diffToolbar.tabPreview')}
            isActive={activeTab === 'preview'}
            onSelect={() => onChangeActiveTab('preview')}
          />
        )}
      </div>

      {/* Right Side: Blame/History toggles */}
      <div className="flex shrink-0 items-center gap-2">
        {/* Blame & History Toggles */}
        <div className="flex items-center overflow-hidden rounded border border-border bg-card">
          {/* Not an eye: that one belongs to the Preview tab a few pixels to the left, and two
              identical icons side by side are a coin toss — all the more once the labels fold away.
              Blame answers "who wrote this line", hence the search-for-a-person glyph. */}
          <ActionButton
            testId="diff-blame-toggle"
            icon={<UserSearch className="h-3.5 w-3.5" />}
            label={t('diffToolbar.blame')}
            tooltip={t('diffToolbar.blameTitle')}
            variant={activeLeftPanel === 'blame' ? 'default' : 'ghost'}
            className="rounded-none border-r border-border"
            onClick={() =>
              onChangeActiveLeftPanel(activeLeftPanel === 'blame' ? 'sidebar' : 'blame')
            }
          />
          <ActionButton
            testId="diff-history-toggle"
            icon={<History className="h-3.5 w-3.5" />}
            label={t('diffToolbar.history')}
            tooltip={t('diffToolbar.historyTitle')}
            variant={activeLeftPanel === 'history' ? 'default' : 'ghost'}
            className="rounded-none"
            onClick={() =>
              onChangeActiveLeftPanel(activeLeftPanel === 'history' ? 'sidebar' : 'history')
            }
          />
        </div>

        <Tooltip content={t('actions.close')}>
          <Button
            variant="ghost"
            size="icon"
            className="ml-1 h-8 w-8 hover:bg-accent"
            onClick={onClose}
            aria-label={t('actions.close')}
          >
            <X className="h-4 w-4" />
          </Button>
        </Tooltip>
      </div>
    </div>
  )
}

/**
 * One of the segmented view tabs.
 *
 * The label is always rendered and always tooltipped; `diffToolbar.css` is what hides it when the
 * container gets tight. `aria-label` is therefore permanent too — a `display: none` label leaves no
 * accessible name behind, and the tab has to keep one whether or not it's showing text.
 */
function ViewTab({
  id,
  icon,
  label,
  isActive,
  onSelect,
}: {
  id: string
  icon: React.ReactNode
  label: string
  isActive: boolean
  onSelect: () => void
}) {
  return (
    <Tooltip content={label}>
      <button
        data-testid={`diff-tab-${id}`}
        onClick={onSelect}
        aria-label={label}
        aria-current={isActive ? 'page' : undefined}
        className={cn(
          'diff-toolbar-tab flex cursor-pointer items-center gap-1.5 rounded-md px-4 py-1 text-xs font-medium transition-all duration-200',
          isActive
            ? 'border-b border-border/10 bg-background font-semibold text-foreground shadow-xs'
            : 'text-muted-foreground hover:text-foreground'
        )}
      >
        {icon}
        <span className="diff-toolbar-tab-label">{label}</span>
      </button>
    </Tooltip>
  )
}

/**
 * A toolbar action whose label folds into its tooltip when the toolbar runs out of room — see
 * `ViewTab` above for why the label stays in the DOM.
 */
function ActionButton({
  testId,
  icon,
  label,
  tooltip,
  variant,
  disabled,
  className,
  onClick,
}: {
  testId: string
  icon: React.ReactNode
  label: string
  /** Richer tooltip text where the label alone is too terse; defaults to the label. */
  tooltip?: string
  variant: 'default' | 'ghost' | 'outline' | 'destructive'
  disabled?: boolean
  className?: string
  onClick: () => void
}) {
  return (
    <Tooltip content={tooltip ?? label}>
      <Button
        data-testid={testId}
        variant={variant}
        size="sm"
        aria-label={label}
        className={cn('diff-toolbar-action h-7 gap-1 px-2.5 text-[10px] font-bold', className)}
        onClick={onClick}
        disabled={disabled}
      >
        {icon}
        <span className="diff-toolbar-action-label">{label}</span>
      </Button>
    </Tooltip>
  )
}
