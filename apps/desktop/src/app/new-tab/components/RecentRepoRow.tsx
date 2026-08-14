import { FolderGit2 } from 'lucide-react'
import { useTranslation } from '@git-manager/i18n'
import { Tag } from '@git-manager/ui'

interface RecentRepoRowProps {
  path: string
  name: string
  /** Whether this repo already has a tab — clicking it then just focuses that tab. */
  isOpen: boolean
  onSelect: () => void
}

/** One row of the New Tab page's recent-repositories list: name, full path, and an "Open" marker. */
export function RecentRepoRow({ path, name, isOpen, onSelect }: RecentRepoRowProps) {
  const { t } = useTranslation('common')

  return (
    <button
      type="button"
      onClick={onSelect}
      data-testid={`new-tab-recent-repo-${path}`}
      className="group flex w-full cursor-pointer items-center gap-3 border-b border-border/10 px-4 py-2.5 text-left transition-colors last:border-0 hover:bg-accent/40"
    >
      <FolderGit2 className="h-4 w-4 shrink-0 text-primary/70" />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-xs font-medium text-foreground transition-colors group-hover:text-primary">
          {name}
        </span>
        <span className="truncate font-mono text-[10px] text-muted-foreground/60">{path}</span>
      </div>
      {isOpen && (
        <Tag tone="info" className="shrink-0">
          {t('newTab.alreadyOpen')}
        </Tag>
      )}
    </button>
  )
}
