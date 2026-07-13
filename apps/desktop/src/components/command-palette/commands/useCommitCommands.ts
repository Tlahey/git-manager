import { createElement } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { useQueryClient } from '@tanstack/react-query'
import {
  RotateCcw,
  Undo2,
  GitBranch,
  Tag,
  Tags,
  Copy,
  GitCommitHorizontal,
  GitPullRequest,
  Wrench,
  Github,
} from 'lucide-react'
import { toast } from '@git-manager/ui'
import { useRepoUIStore } from '../../../stores/repoUI.store'
import { apiCopyCommitSha, apiCherryPickCommit, apiGetCommitWebUrl } from '../../../api/git.api'
import { apiOpenUrl } from '../../../api/shell.api'
import { resolveTagOrReleaseUrl } from '../../../api/github.api'
import { useRepoGitHub } from '../../../hooks/useRepoGitHub'
import { useCommitTag } from '../../../hooks/useCommitTag'
import { useCommitPullRequest } from '../../../hooks/useCommitPullRequest'
import type { PaletteCommand } from './types'

/**
 * Commit-scoped palette commands, gated on a selected commit (`selectedCommitOid`) that isn't a
 * stash row (`selectedStashIndex === null` — stash entries get their own action set, see
 * `useStashCommands.ts`; reset/revert/tag/branch/cherry-pick don't apply meaningfully to a stash's
 * synthetic commit). The dialog-based ones (reset/revert/branch/tag) dispatch through the
 * `pendingGraphAction` store bridge, which `GitGraph.tsx` forwards to the graph's own dialogs — the
 * same result as the native context menu, but reachable from the keyboard. Copy-SHA and cherry-pick
 * have no dialog, so they call the API layer directly (mirroring `handleCopySha`/`handleCherryPick`
 * in `useGitGraphActions.ts`) instead of round-tripping through the bridge.
 */
export function useCommitCommands(): PaletteCommand[] {
  const { t } = useTranslation('common')
  const { t: tGit } = useTranslation('git')
  const queryClient = useQueryClient()
  const activeRepo = useRepoUIStore((s) => s.activeRepo)
  const selectedCommitOid = useRepoUIStore((s) => s.selectedCommitOid)
  const selectedStashIndex = useRepoUIStore((s) => s.selectedStashIndex)
  const setPendingGraphAction = useRepoUIStore((s) => s.setPendingGraphAction)

  // GitHub context + commit associations (PR / containing tag) for the selected commit — resolved
  // up front so the matching commands can show the sha/tag/PR as sub-info. Hooks run unconditionally
  // (before the gate below); they no-op when there's no commit/repo.
  const { ownerRepo, token } = useRepoGitHub(activeRepo)
  const tag = useCommitTag(activeRepo, selectedStashIndex === null ? selectedCommitOid : null)
  const pr = useCommitPullRequest(activeRepo, selectedStashIndex === null ? selectedCommitOid : null)

  if (!selectedCommitOid || !activeRepo || selectedStashIndex !== null) return []

  const shortOid = selectedCommitOid.slice(0, 7)
  const shaKeyword = [shortOid, selectedCommitOid]

  const commands: PaletteCommand[] = [
    {
      id: 'commit-reset-soft',
      group: 'commit',
      title: t('commandPalette.commit.resetSoft'),
      keywords: shaKeyword,
      icon: createElement(RotateCcw),
      run: () => setPendingGraphAction({ kind: 'reset', mode: 'soft' }),
    },
    {
      id: 'commit-reset-mixed',
      group: 'commit',
      title: t('commandPalette.commit.resetMixed'),
      keywords: shaKeyword,
      icon: createElement(RotateCcw),
      run: () => setPendingGraphAction({ kind: 'reset', mode: 'mixed' }),
    },
    {
      id: 'commit-reset-hard',
      group: 'commit',
      title: t('commandPalette.commit.resetHard'),
      keywords: shaKeyword,
      icon: createElement(RotateCcw),
      run: () => setPendingGraphAction({ kind: 'reset', mode: 'hard' }),
    },
    {
      id: 'commit-revert',
      group: 'commit',
      title: t('commandPalette.commit.revert'),
      keywords: shaKeyword,
      icon: createElement(Undo2),
      run: () => setPendingGraphAction({ kind: 'revert' }),
    },
    {
      id: 'commit-branch',
      group: 'commit',
      title: t('commandPalette.commit.branch'),
      keywords: shaKeyword,
      icon: createElement(GitBranch),
      run: () => setPendingGraphAction({ kind: 'branch' }),
    },
    {
      id: 'commit-tag',
      group: 'commit',
      title: t('commandPalette.commit.tag'),
      keywords: shaKeyword,
      icon: createElement(Tag),
      run: () => setPendingGraphAction({ kind: 'tag', annotated: false }),
    },
    {
      id: 'commit-tag-annotated',
      group: 'commit',
      title: t('commandPalette.commit.tagAnnotated'),
      keywords: shaKeyword,
      icon: createElement(Tag),
      run: () => setPendingGraphAction({ kind: 'tag', annotated: true }),
    },
    {
      id: 'commit-fixup',
      group: 'commit',
      title: t('commandPalette.commit.fixup'),
      keywords: shaKeyword,
      icon: createElement(Wrench),
      run: () => setPendingGraphAction({ kind: 'fixup' }),
    },
    {
      id: 'commit-cherry-pick',
      group: 'commit',
      title: t('commandPalette.commit.cherryPick'),
      keywords: shaKeyword,
      icon: createElement(GitCommitHorizontal),
      run: () => {
        apiCherryPickCommit(activeRepo, selectedCommitOid)
          .then(() => {
            queryClient.invalidateQueries({ queryKey: ['git-log', activeRepo] })
            queryClient.invalidateQueries({ queryKey: ['git-status', activeRepo] })
            toast.success(tGit('gitTree.contextMenu.cherryPicked'))
          })
          .catch((err) => toast.error(String(err)))
      },
    },
    {
      id: 'commit-copy-sha',
      group: 'commit',
      title: t('commandPalette.commit.copySha'),
      subtitle: shortOid,
      keywords: shaKeyword,
      icon: createElement(Copy),
      run: () => {
        apiCopyCommitSha(selectedCommitOid)
          .then(() => toast.success(tGit('gitTree.contextMenu.shaCopied')))
          .catch((err) => toast.error(String(err)))
      },
    },
    {
      id: 'commit-open-github',
      group: 'commit',
      title: t('commandPalette.commit.openGithub'),
      subtitle: shortOid,
      keywords: shaKeyword,
      icon: createElement(Github),
      run: () => {
        apiGetCommitWebUrl(activeRepo, selectedCommitOid)
          .then((url) => {
            if (!url) {
              toast.error(tGit('gitTree.contextMenu.noRemoteLink'))
              return
            }
            return apiOpenUrl(url)
          })
          .catch((err) => toast.error(String(err)))
      },
    },
  ]

  // Open the pull request that introduced/merged this commit (only when GitHub reports one).
  if (pr) {
    commands.push({
      id: 'commit-open-pr',
      group: 'commit',
      title: t('commandPalette.commit.openPr'),
      subtitle: `#${pr.number}`,
      keywords: [...shaKeyword, `#${pr.number}`, pr.title],
      icon: createElement(GitPullRequest),
      run: () => {
        apiOpenUrl(pr.url).catch((err) => toast.error(String(err)))
      },
    })
  }

  // Open the tag/release the commit first shipped in (release page if one exists, else the tag).
  if (tag && ownerRepo) {
    commands.push({
      id: 'commit-open-tag',
      group: 'commit',
      title: t('commandPalette.commit.openTag'),
      subtitle: tag,
      keywords: [...shaKeyword, tag],
      icon: createElement(Tags),
      run: () => {
        resolveTagOrReleaseUrl(ownerRepo.owner, ownerRepo.repo, tag, token ?? undefined)
          .then(apiOpenUrl)
          .catch((err) => toast.error(String(err)))
      },
    })
  }

  return commands
}
