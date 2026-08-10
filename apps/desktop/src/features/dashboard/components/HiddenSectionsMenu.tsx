import { useTranslation } from '@git-manager/i18n'
import {
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@git-manager/ui'
import { EyeOff } from 'lucide-react'
import {
  useDashboardStore,
  DASHBOARD_SECTION_IDS,
  type DashboardSectionId,
} from '../stores/dashboard.store'

interface HiddenSectionsMenuProps {
  /** Display title per section id, so this component stays free of copy decisions. */
  titles: Record<DashboardSectionId, string>
}

/**
 * The only way back for a section hidden from its options menu. It sits next to the search bar and
 * appears only when something is actually hidden — otherwise hiding a section would be a one-way
 * door.
 */
export function HiddenSectionsMenu({ titles }: HiddenSectionsMenuProps) {
  const { t } = useTranslation('dashboard')
  const hiddenSections = useDashboardStore((s) => s.hiddenSections)
  const showSection = useDashboardStore((s) => s.showSection)
  const showAllSections = useDashboardStore((s) => s.showAllSections)

  const hidden = DASHBOARD_SECTION_IDS.filter((id) => hiddenSections[id])
  if (hidden.length === 0) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          data-testid="dashboard-hidden-sections"
          size="sm"
          variant="ghost"
          aria-label={t('dashboard.hidden.button')}
          className="h-8 shrink-0 text-xs"
        >
          <EyeOff className="mr-1.5 h-3.5 w-3.5" />
          {hidden.length}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <p className="px-2 py-1 text-[10px] tracking-wider text-muted-foreground uppercase">
          {t('dashboard.hidden.title', { count: hidden.length })}
        </p>
        {hidden.map((id) => (
          <DropdownMenuItem
            key={id}
            data-testid={`dashboard-restore-section-${id}`}
            onSelect={() => showSection(id)}
            className="text-xs"
          >
            {titles[id]}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          data-testid="dashboard-restore-all-sections"
          onSelect={() => showAllSections()}
          className="text-xs"
        >
          {t('dashboard.hidden.restoreAll')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
