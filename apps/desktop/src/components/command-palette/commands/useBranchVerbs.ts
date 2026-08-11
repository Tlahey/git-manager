import { useTranslation } from '@git-manager/i18n'
import type { GitBranch } from '@git-manager/git-types'
import {
  GitMerge,
  FastForward,
  Trash2,
  GitCompareArrows,
  PenLine,
  ArrowRightLeft,
  Layers,
} from 'lucide-react'
import { useRepoUIStore } from '../../../stores/repoUI.store'
import { goToRepoContent } from '../../../stores/repoView.store'
import { useRepoDataStore } from '../../../stores/repoData.store'
import { useBranches } from '../../../hooks/useBranches'
import { useSwitchBranch } from '../../../hooks/useSwitchBranch'
import {
  apiMergeBranch,
  apiFastForwardBranch,
  apiDeleteBranch,
  apiRebaseOntoCommit,
} from '../../../api/git.api'
import { MAX_REFS_PER_KIND, useRefRunner } from './refCommandRunner'
import type { RefTarget, RefVerb } from './refCommandRows'

/**
 * The eight branch verbs the palette offers, bound to the active repository.
 *
 * Each mirrors its native-menu handler exactly — same API call, same refresh, same dialog bridge —
 * the rule `useStashCommands` already follows: the palette is a second *entry point*, never a
 * second implementation. Deleting a branch on the remote keeps its confirmation dialog, opened
 * through the shared store (`pendingRemoteBranchDelete`) exactly as the menus do.
 *
 * Empty without an active repository, which is also what leaves `buildRefCommands` with nothing to
 * render — the gate lives here rather than in both.
 */
export function useBranchVerbs(): RefVerb[] {
  const { t } = useTranslation('common')
  const activeRepo = useRepoUIStore((s) => s.activeRepo)
  const setPendingRemoteBranchDelete = useRepoUIStore((s) => s.setPendingRemoteBranchDelete)
  const setPendingBranchRename = useRepoUIStore((s) => s.setPendingBranchRename)
  const setCompareRefsTarget = useRepoUIStore((s) => s.setCompareRefsTarget)
  // The same entry point the sidebar's menu uses, so a checkout blocked by uncommitted work opens
  // the shared stash prompt here too (mounted by `RepoView`, hence reachable from any view), and
  // the switch lands on the base project rather than on `activeRepo` — which is itself a linked
  // worktree whenever the tab was opened on one.
  const { switchBranch, switchRemoteBranch } = useSwitchBranch()
  const repo = useRepoDataStore((s) => (activeRepo ? s.repoCache[activeRepo] : undefined))
  const { data: branches } = useBranches(activeRepo || '')
  const run = useRefRunner(activeRepo)

  if (!activeRepo) return []

  const currentBranch = repo && !repo.isDetached ? repo.head : null

  /**
   * The branches of one verb, each bound to what applying it to that branch does — a `RefTarget`,
   * which is all a palette row needs and all `buildRefCommands` is allowed to know. Named the way
   * the row shows it: remote-qualified for a remote branch (`origin/feat`, which `GitBranch` carries
   * in `name`), bare for a local one.
   */
  function targets(branches: GitBranch[], apply: (branch: GitBranch) => void): RefTarget[] {
    return branches.map((branch) => ({
      name: branch.isRemote ? branch.name : branch.shortName,
      run: () => apply(branch),
    }))
  }

  /**
   * A remote branch split into the two halves its deletion needs. Split `name`, NOT `shortName`: on
   * a `GitBranch` the remote prefix is already stripped from `shortName` (`feature/x`), so splitting
   * that would name the remote "feature". `GitRef` uses the opposite convention — its `shortName`
   * keeps the prefix, which is what `remoteBranchTarget` splits — and the two are easy to mistake
   * for each other. `null` for a name carrying no remote prefix at all.
   */
  function splitRemote(branch: GitBranch) {
    const [remote, ...rest] = branch.name.split('/')
    const branchName = rest.join('/')
    return remote && branchName ? { remote, branchName } : null
  }

  const localBranches = (branches ?? []).filter((b) => !b.isRemote).slice(0, MAX_REFS_PER_KIND)
  // Every verb but Rename is gated on "not the one you are on": checking out, merging or deleting
  // the current branch is a no-op or an error, and the native menus gate the same way.
  const otherLocalBranches = localBranches.filter((b) => b.shortName !== currentBranch)
  const remoteBranches = (branches ?? []).filter((b) => b.isRemote).slice(0, MAX_REFS_PER_KIND)

  const verbs: RefVerb[] = []

  // Checkout takes local *and* remote branches in one list — they are one gesture with two
  // implementations, and the user picking `origin/feat` is asking for the same thing as the user
  // picking `feat`. Not gated on `currentBranch`: getting back onto a branch is exactly what a
  // detached HEAD needs.
  const checkoutable = [...otherLocalBranches, ...remoteBranches.filter(splitRemote)]
  verbs.push({
    verb: 'checkout',
    words: ['checkout', 'switch'],
    title: t('commandPalette.ref.checkoutStep'),
    icon: ArrowRightLeft,
    targets: targets(checkoutable, (b) => {
      goToRepoContent()
      // A remote row switches onto the LOCAL branch of that name, creating it as a tracking branch
      // when it doesn't exist — what `git switch feat` does, never the detached form. See
      // `checkoutRemoteBranchAsLocal`.
      if (b.isRemote) void switchRemoteBranch(b.name)
      else void switchBranch(b.shortName)
    }),
  })

  // Merge, fast-forward, rebase and compare are *relative to HEAD*, so they need a branch to be on:
  // a detached HEAD has nothing to merge into.
  if (currentBranch) {
    const params = (b: GitBranch) => ({ branch: b.shortName, current: currentBranch })
    verbs.push(
      {
        verb: 'merge',
        words: ['merge'],
        title: t('commandPalette.ref.mergeStep', { current: currentBranch }),
        icon: GitMerge,
        targets: targets(otherLocalBranches, (b) =>
          run(
            () => apiMergeBranch(activeRepo, b.shortName, currentBranch),
            t('commandPalette.ref.merged', params(b))
          )
        ),
      },
      {
        verb: 'fastForward',
        words: ['fast-forward', 'ff'],
        title: t('commandPalette.ref.fastForwardStep', { current: currentBranch }),
        icon: FastForward,
        targets: targets(otherLocalBranches, (b) =>
          run(
            () => apiFastForwardBranch(activeRepo, b.shortName, currentBranch),
            t('commandPalette.ref.fastForwarded', params(b))
          )
        ),
      },
      {
        verb: 'rebase',
        words: ['rebase'],
        title: t('commandPalette.ref.rebaseStep', { current: currentBranch }),
        icon: Layers,
        // Onto the branch's *tip commit*, exactly as the branch menus do — a rebase targets a
        // commit, and resolving the name here would re-read a ref the list already resolved.
        targets: targets(otherLocalBranches, (b) =>
          run(
            () => apiRebaseOntoCommit(activeRepo, b.commitOid),
            t('commandPalette.ref.rebased', params(b))
          )
        ),
      },
      {
        verb: 'compare',
        words: ['compare', 'diff'],
        title: t('commandPalette.ref.compareStep', { current: currentBranch }),
        icon: GitCompareArrows,
        // Reads two refs and writes nothing, so — like the dialogs below — it stays where the user
        // is. Same pair as the menus: the picked branch on the left, the checked-out one on the
        // right, both re-pickable inside the dialog.
        targets: targets(otherLocalBranches, (b) =>
          setCompareRefsTarget({ baseRef: b.shortName, headRef: currentBranch })
        ),
      }
    )
  }

  verbs.push(
    {
      verb: 'deleteBranch',
      words: ['delete'],
      title: t('commandPalette.ref.deleteBranchStep'),
      icon: Trash2,
      targets: targets(otherLocalBranches, (b) =>
        run(
          () => apiDeleteBranch(activeRepo, b.shortName, { targetOid: b.commitOid }),
          t('commandPalette.ref.branchDeleted', { branch: b.shortName })
        )
      ),
    },
    {
      // The one verb offered for the current branch too — git renames the branch HEAD points at
      // without complaint, and the menus offer it there as well. Its dialog is mounted once by
      // `RepoWorkspace` from shared state, so it opens whichever view is on screen.
      verb: 'rename',
      words: ['rename'],
      title: t('commandPalette.ref.renameStep'),
      icon: PenLine,
      targets: targets(localBranches, (b) => setPendingBranchRename(b.shortName)),
    },
    {
      verb: 'deleteRemoteBranch',
      words: ['delete-remote', 'unpublish'],
      title: t('commandPalette.ref.deleteRemoteBranchStep'),
      icon: Trash2,
      targets: targets(remoteBranches.filter(splitRemote), (b) => {
        const target = splitRemote(b)
        if (target) setPendingRemoteBranchDelete(target)
      }),
    }
  )

  return verbs
}
