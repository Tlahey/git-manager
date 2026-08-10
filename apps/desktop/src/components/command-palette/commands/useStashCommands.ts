import { createElement } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { useQueryClient } from '@tanstack/react-query'
import { mutate } from 'swr'
import { Archive, ArchiveRestore, Trash2 } from 'lucide-react'
import { toast } from '@git-manager/ui'
import { useRepoUIStore } from '../../../stores/repoUI.store'
import { goToRepoContent } from '../../../stores/repoView.store'
import { apiStashApply, apiStashPop, apiStashDrop } from '../../../api/git.api'
import type { PaletteCommand } from './types'

/**
 * Stash-scoped palette commands, gated on the selected row being a stash entry
 * (`selectedStashIndex`, published by `GitGraph.tsx` alongside `selectedCommitOid`). Mirrors
 * `useGraphRowMenus.ts`'s native stash-menu handlers (`onApply`/`onPop`/`onDelete`) exactly —
 * same API calls, same `mutate`/`invalidateQueries` follow-up — since apply/pop/drop have no
 * dialog and were otherwise reachable only through the native stash context menu.
 */
export function useStashCommands(): PaletteCommand[] {
  const { t } = useTranslation('common')
  const queryClient = useQueryClient()
  const activeRepo = useRepoUIStore((s) => s.activeRepo)
  const selectedStashIndex = useRepoUIStore((s) => s.selectedStashIndex)

  if (selectedStashIndex === null || !activeRepo) return []

  function refresh() {
    mutate(['git-stashes', activeRepo])
    queryClient.invalidateQueries({ queryKey: ['git-log', activeRepo] })
    queryClient.invalidateQueries({ queryKey: ['git-status', activeRepo] })
  }

  const index = selectedStashIndex
  const keywords = [`stash@{${index}}`]

  // All three move the repository and show their result on the graph, while the palette can be
  // opened from the board or the files view — so landing on the content view is part of running one,
  // the same rule `useRefCommands` follows. One funnel rather than three copies of the same
  // then/catch, which is what let the three drift apart in the first place.
  function run(action: () => Promise<unknown>) {
    goToRepoContent()
    action()
      .then(refresh)
      .catch((err) => toast.error(String(err)))
  }

  return [
    {
      id: 'stash-apply',
      group: 'stash',
      title: t('commandPalette.stash.apply'),
      keywords,
      icon: createElement(ArchiveRestore),
      run: () => run(() => apiStashApply(activeRepo, index)),
    },
    {
      id: 'stash-pop',
      group: 'stash',
      title: t('commandPalette.stash.pop'),
      keywords,
      icon: createElement(Archive),
      run: () => run(() => apiStashPop(activeRepo, index)),
    },
    {
      id: 'stash-drop',
      group: 'stash',
      title: t('commandPalette.stash.drop'),
      keywords,
      icon: createElement(Trash2),
      run: () => run(() => apiStashDrop(activeRepo, index)),
    },
  ]
}
