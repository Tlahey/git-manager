import { useTranslation } from '@git-manager/i18n'
import { useQuery } from '@tanstack/react-query'
import type { GitRef } from '@git-manager/git-types'
import { Trash2, Upload } from 'lucide-react'
import { useRepoUIStore } from '../../../stores/repoUI.store'
import { apiGetTags, apiPushTag, apiDeleteTag } from '../../../api/git.api'
import { MAX_REFS_PER_KIND, useRefRunner } from './refCommandRunner'
import type { RefTarget, RefVerb } from './refCommandRows'

/**
 * The three tag verbs the palette offers: push, delete locally, delete on the remote.
 *
 * Shaped exactly like the branch ones (`useBranchVerbs`) and rendered by the same builder, which is
 * what got them out of the list: three rows *per tag* meant a repository with sixty of them spent a
 * hundred and eighty entries before any other command was reached. A tag is a version the user can
 * name, so naming it second — or in the same breath, `delete-tag v1.2` — costs nothing.
 *
 * Each mirrors its native-menu handler exactly — same API call, same refresh, same dialog bridge:
 * the palette is a second *entry point*, never a second implementation. Deleting a tag on the remote
 * keeps its confirmation dialog, opened through the shared `pendingTagDialog` state as the menus do.
 */
export function useTagVerbs(): RefVerb[] {
  const { t } = useTranslation('common')
  const activeRepo = useRepoUIStore((s) => s.activeRepo)
  const setPendingTagDialog = useRepoUIStore((s) => s.setPendingTagDialog)
  const run = useRefRunner(activeRepo)
  const { data: tags } = useQuery<GitRef[]>({
    queryKey: ['tags', activeRepo],
    queryFn: () => apiGetTags(activeRepo as string),
    enabled: !!activeRepo,
    staleTime: 30_000,
  })

  if (!activeRepo) return []

  const loaded = (tags ?? []).slice(0, MAX_REFS_PER_KIND)

  /** The tags, each bound to what applying this verb to it does — all a palette row needs. */
  function targets(apply: (tag: GitRef) => void): RefTarget[] {
    return loaded.map((tag) => ({ name: tag.shortName, run: () => apply(tag) }))
  }

  return [
    {
      verb: 'pushTag',
      words: ['push-tag', 'publish-tag'],
      title: t('commandPalette.ref.pushTagStep'),
      icon: Upload,
      targets: targets((tag) =>
        run(
          () => apiPushTag(activeRepo, tag.shortName),
          t('commandPalette.ref.tagPushed', { tag: tag.shortName })
        )
      ),
    },
    {
      verb: 'deleteTag',
      words: ['delete-tag'],
      title: t('commandPalette.ref.deleteTagStep'),
      icon: Trash2,
      targets: targets((tag) =>
        run(
          () => apiDeleteTag(activeRepo, tag.shortName, { targetOid: tag.commitOid }),
          t('commandPalette.ref.tagDeleted', { tag: tag.shortName })
        )
      ),
    },
    {
      verb: 'deleteRemoteTag',
      words: ['delete-remote-tag', 'unpublish-tag'],
      title: t('commandPalette.ref.deleteRemoteTagStep'),
      icon: Trash2,
      targets: targets((tag) =>
        setPendingTagDialog({
          kind: 'deleteRemote',
          tagName: tag.shortName,
          oid: tag.commitOid,
          remote: 'origin',
        })
      ),
    },
  ]
}
