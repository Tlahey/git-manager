import { createElement } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { GitRef } from '@git-manager/git-types'
import { GitMerge, FastForward, Trash2, Upload } from 'lucide-react'
import { toast } from '@git-manager/ui'
import { useRepoUIStore } from '../../../stores/repoUI.store'
import { goToRepoContent } from '../../../stores/repoView.store'
import { useRepoDataStore } from '../../../stores/repoData.store'
import { useBranches } from '../../../hooks/useBranches'
import {
  apiGetTags,
  apiMergeBranch,
  apiFastForwardBranch,
  apiPushTag,
  apiDeleteTag,
  apiDeleteBranch,
} from '../../../api/git.api'
import type { PaletteCommand } from './types'

/**
 * Most refs a repo can offer per kind before the list stops being worth building. cmdk filters
 * client-side, so every command is materialised whether or not it matches — a repo with a thousand
 * stale branches would pay for all of them on each keystroke. Refs are ordered by the branch/tag
 * list's own order, so the cap keeps the head of that list.
 */
const MAX_REFS_PER_KIND = 60

/**
 * Branch- and tag-scoped palette commands: merge, fast-forward, tag push, tag delete (local and
 * remote), remote-branch delete.
 *
 * These exist because the native context menus were the **only** way to reach them. That is a
 * limitation before it is a testing problem: merging a branch or publishing a tag required a mouse,
 * with no keyboard route at all. Every entry names its ref in the title, so the palette's own fuzzy
 * filter is the ref picker ("merge login", "push v1.2") — the same idiom `useFileLookupCommands`
 * uses for paths, rather than a selection the user has to make first.
 *
 * Each command mirrors its native-menu handler exactly — same API call, same refresh, same dialog
 * bridge — the rule `useStashCommands` already follows: the palette is a second *entry point*, never
 * a second implementation. The two destructive-on-the-remote actions deliberately keep their
 * confirmation dialog, opened through the shared store (`pendingRemoteBranchDelete`,
 * `pendingTagDialog`) exactly as the menus do.
 */
export function useRefCommands(): PaletteCommand[] {
  const { t } = useTranslation('common')
  const queryClient = useQueryClient()
  const activeRepo = useRepoUIStore((s) => s.activeRepo)
  const setPendingRemoteBranchDelete = useRepoUIStore((s) => s.setPendingRemoteBranchDelete)
  const setPendingTagDialog = useRepoUIStore((s) => s.setPendingTagDialog)
  const repo = useRepoDataStore((s) => (activeRepo ? s.repoCache[activeRepo] : undefined))
  const { data: branches } = useBranches(activeRepo || '')
  const { data: tags } = useQuery<GitRef[]>({
    queryKey: ['tags', activeRepo],
    queryFn: () => apiGetTags(activeRepo as string),
    enabled: !!activeRepo,
    staleTime: 30_000,
  })

  if (!activeRepo) return []

  const currentBranch = repo && !repo.isDetached ? repo.head : null

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['branches', activeRepo] })
    queryClient.invalidateQueries({ queryKey: ['git-log', activeRepo] })
    queryClient.invalidateQueries({ queryKey: ['tags', activeRepo] })
  }

  // The single funnel for every entry that moves the repository, which is also the right place to
  // answer "where does the user see this happen": all of them land in the graph, and the palette can
  // be opened from the board or the files view. The two dialog-based entries below deliberately do
  // *not* come through here — their dialogs are mounted outside the view switch (`RepoWorkspace`),
  // so they already work whichever view is up, and dragging the user to the graph to confirm a
  // remote-tag deletion would be a detour, not a destination.
  function run(action: () => Promise<unknown>, success: string) {
    goToRepoContent()
    action()
      .then(() => {
        toast.success(success)
        refresh()
      })
      .catch((err) => toast.error(String(err)))
  }

  const commands: PaletteCommand[] = []

  // ── Branch actions ─────────────────────────────────────────────────────────
  // Merge and fast-forward are *relative to HEAD*, so they need a branch to be on: a detached HEAD
  // has nothing to merge into. The branch itself must not be the current one either — the menus
  // gate the same way, since merging a branch into itself is a no-op.
  const localBranches = (branches ?? [])
    .filter((b) => !b.isRemote && b.shortName !== currentBranch)
    .slice(0, MAX_REFS_PER_KIND)

  if (currentBranch) {
    for (const branch of localBranches) {
      const params = { branch: branch.shortName, current: currentBranch }
      commands.push({
        id: `ref-merge-${branch.shortName}`,
        group: 'ref',
        title: t('commandPalette.ref.merge', params),
        keywords: [branch.shortName],
        icon: createElement(GitMerge),
        run: () =>
          run(
            () => apiMergeBranch(activeRepo, branch.shortName, currentBranch),
            t('commandPalette.ref.merged', params)
          ),
      })
      commands.push({
        id: `ref-fast-forward-${branch.shortName}`,
        group: 'ref',
        title: t('commandPalette.ref.fastForward', params),
        keywords: [branch.shortName],
        icon: createElement(FastForward),
        run: () =>
          run(
            () => apiFastForwardBranch(activeRepo, branch.shortName, currentBranch),
            t('commandPalette.ref.fastForwarded', params)
          ),
      })
    }
  }

  // Deleting a *local* branch, gated on the same "not the one you are on" rule as merge above:
  // git refuses to delete the branch HEAD points at, so offering it would only produce an error.
  for (const branch of localBranches) {
    commands.push({
      id: `ref-delete-branch-${branch.shortName}`,
      group: 'ref',
      title: t('commandPalette.ref.deleteBranch', { branch: branch.shortName }),
      keywords: [branch.shortName],
      icon: createElement(Trash2),
      run: () =>
        run(
          () => apiDeleteBranch(activeRepo, branch.shortName, { targetOid: branch.commitOid }),
          t('commandPalette.ref.branchDeleted', { branch: branch.shortName })
        ),
    })
  }

  // Deleting a remote branch needs the remote and the branch apart. Split `name`, NOT `shortName`:
  // on a `GitBranch` the remote prefix is already stripped from `shortName` (`feature/x`), so
  // splitting that would name the remote "feature". `GitRef` uses the opposite convention — its
  // `shortName` keeps the prefix, which is what `remoteBranchTarget` splits — and the two are easy
  // to mistake for each other.
  for (const branch of (branches ?? []).filter((b) => b.isRemote).slice(0, MAX_REFS_PER_KIND)) {
    const [remote, ...rest] = branch.name.split('/')
    const branchName = rest.join('/')
    if (!remote || !branchName) continue
    commands.push({
      id: `ref-delete-remote-branch-${branch.name}`,
      group: 'ref',
      title: t('commandPalette.ref.deleteRemoteBranch', { branch: branch.name }),
      keywords: [branch.name, branchName],
      icon: createElement(Trash2),
      run: () => setPendingRemoteBranchDelete({ remote, branchName }),
    })
  }

  // ── Tag actions ────────────────────────────────────────────────────────────
  for (const tag of (tags ?? []).slice(0, MAX_REFS_PER_KIND)) {
    const params = { tag: tag.shortName }
    commands.push({
      id: `ref-push-tag-${tag.shortName}`,
      group: 'ref',
      title: t('commandPalette.ref.pushTag', params),
      keywords: [tag.shortName],
      icon: createElement(Upload),
      run: () =>
        run(() => apiPushTag(activeRepo, tag.shortName), t('commandPalette.ref.tagPushed', params)),
    })
    commands.push({
      id: `ref-delete-tag-${tag.shortName}`,
      group: 'ref',
      title: t('commandPalette.ref.deleteTag', params),
      keywords: [tag.shortName],
      icon: createElement(Trash2),
      run: () =>
        run(
          () => apiDeleteTag(activeRepo, tag.shortName, { targetOid: tag.commitOid }),
          t('commandPalette.ref.tagDeleted', params)
        ),
    })
    commands.push({
      id: `ref-delete-remote-tag-${tag.shortName}`,
      group: 'ref',
      title: t('commandPalette.ref.deleteRemoteTag', params),
      keywords: [tag.shortName],
      icon: createElement(Trash2),
      run: () =>
        setPendingTagDialog({
          kind: 'deleteRemote',
          tagName: tag.shortName,
          oid: tag.commitOid,
          remote: 'origin',
        }),
    })
  }

  return commands
}
