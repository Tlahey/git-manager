import { Archive, GitCommitHorizontal } from 'lucide-react'
import { cn, Tooltip } from '@git-manager/ui'
import { useTranslation } from '@git-manager/i18n'
import type { WipCommitPanelState } from './wipPanelState'

/**
 * The two tabs, as data rather than as two copies of the same markup. `defaultValue` matches the
 * calls this replaced, so a missing key still renders the English word rather than the key path.
 */
const TABS = [
  {
    key: 'commit' as const,
    testId: 'tab-commit',
    labelKey: 'commit.title',
    defaultValue: 'Commit',
    Icon: GitCommitHorizontal,
  },
  {
    key: 'stash' as const,
    testId: 'tab-stash',
    labelKey: 'toolbar.stash',
    defaultValue: 'Stash',
    Icon: Archive,
  },
]

interface WipPanelTabsProps {
  activeTab: WipCommitPanelState['activeTab']
  onSelect: WipCommitPanelState['setActiveTab']
}

/**
 * Switches the WIP panel between committing and stashing.
 *
 * Only the active tab shows its label — the inactive one is its icon alone, which is why both
 * carry a tooltip: an icon-only control has to say what it is somewhere.
 */
export function WipPanelTabs({ activeTab, onSelect }: WipPanelTabsProps) {
  const { t } = useTranslation('git')

  return (
    <div className="flex items-center gap-1 px-1">
      {TABS.map(({ key, testId, labelKey, defaultValue, Icon }) => {
        const label = t(labelKey, { defaultValue })
        const isActive = activeTab === key
        return (
          <Tooltip key={key} content={label}>
            <button
              type="button"
              data-testid={testId}
              onClick={() => onSelect(key)}
              className={cn(
                'flex cursor-pointer items-center gap-1.5 rounded-t-md px-2.5 py-1 text-xs font-semibold transition-colors',
                isActive
                  ? 'border border-b-0 border-border/60 bg-card text-foreground shadow-xs'
                  : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground'
              )}
            >
              <Icon className="h-3.5 w-3.5 text-primary" />
              {isActive && <span>{label}</span>}
            </button>
          </Tooltip>
        )
      })}
    </div>
  )
}
