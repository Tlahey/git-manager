import { useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@git-manager/ui'
import { Wrench } from 'lucide-react'
import { apiGetPendingFixups } from '../../api/git.api'
import { AutosquashPreviewDialog } from './AutosquashPreviewDialog'

interface PendingFixupsBannerProps {
  repoPath: string
}

export function PendingFixupsBanner({ repoPath }: PendingFixupsBannerProps) {
  const { t } = useTranslation('git')
  const [dialogOpen, setDialogOpen] = useState(false)

  const { data: fixups = [] } = useQuery({
    queryKey: ['pending-fixups', repoPath],
    queryFn: () => apiGetPendingFixups(repoPath),
    enabled: !!repoPath,
    staleTime: 30_000,
  })

  if (fixups.length === 0) return null

  return (
    <>
      <div
        data-testid="pending-fixups-banner"
        className="flex items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-3 py-1.5"
      >
        <Wrench className="h-3.5 w-3.5 shrink-0 text-amber-500" />
        <span className="flex-1 text-xs text-amber-600 dark:text-amber-400">
          {t('fixup.pending', { count: fixups.length })}
        </span>
        <Button
          data-testid="autosquash-button"
          size="sm"
          variant="outline"
          className="h-6 px-2 text-xs border-amber-500/40 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20"
          onClick={() => setDialogOpen(true)}
        >
          Autosquash
        </Button>
      </div>

      <AutosquashPreviewDialog
        repoPath={repoPath}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
      />
    </>
  )
}
