import { useEffect, useMemo } from 'react'
import { useHorizontalResize } from '@git-manager/components'
import { useRepoUIStore } from '../../../stores/repoUI.store'
import { RepoGitHubOverrideContext } from '../../../hooks/useRepoGitHub'
import { PrDetailCenter } from '../../../components/git-graph/pr/PrDetailCenter'
import { PrFilesPanel } from '../../../components/git-graph/pr/PrFilesPanel'
import { PrFileDiffCenter } from '../../../components/git-graph/pr/PrFileDiffCenter'
import type { MockPR } from '../types'

interface PrViewPanelProps {
  pr: MockPR
  onClose: () => void
}

/**
 * The full, interactive in-app PR view as shown for a Launchpad pull request — the same
 * `PrDetailCenter` / `PrFilesPanel` / `PrFileDiffCenter` composition the repo graph uses, but driven
 * by the PR's GitHub `owner/repo` (via {@link RepoGitHubOverrideContext}) so it works for any PR the
 * Launchpad lists, even when its repo isn't cloned locally. `PrDetailCenter`'s own top-left Back
 * button is wired to `onClose`, returning to the list the user came from.
 *
 * `repoPath` is the PR's `owner/repo` string: the override makes the PR hooks ignore it for GitHub
 * resolution, so here it only serves as a stable per-repo cache discriminator for the file panels.
 */
export function PrViewPanel({ pr, onClose }: PrViewPanelProps) {
  const activePrFile = useRepoUIStore((s) => s.activePrFile)
  const prFilesVisible = useRepoUIStore((s) => s.prFilesVisible)
  const setActivePrFile = useRepoUIStore((s) => s.setActivePrFile)
  const { width: filesWidth, resizeProps } = useHorizontalResize(400)

  const ownerRepo = useMemo(() => {
    const [owner, repo] = (pr.fullName ?? '').split('/')
    return owner && repo ? { owner, repo } : null
  }, [pr.fullName])

  // Start each PR on its conversation, never a stale file selection carried over from a previous
  // view, and clear the shared selection again on unmount so it can't leak into a repo tab.
  useEffect(() => {
    setActivePrFile(null)
    return () => setActivePrFile(null)
  }, [pr.id, setActivePrFile])

  const repoPath = pr.fullName ?? ''

  return (
    <RepoGitHubOverrideContext.Provider value={ownerRepo}>
      <div className="flex h-full overflow-hidden" data-testid="launchpad-pr-view">
        <div className="min-w-0 flex-1 overflow-hidden">
          {activePrFile != null ? (
            <PrFileDiffCenter
              repoPath={repoPath}
              prNumber={pr.number}
              filename={activePrFile}
              onClose={() => setActivePrFile(null)}
            />
          ) : (
            <PrDetailCenter repoPath={repoPath} prNumber={pr.number} onClose={onClose} />
          )}
        </div>
        {prFilesVisible && (
          <>
            <div
              {...resizeProps}
              className="group relative w-2 shrink-0 cursor-col-resize select-none transition-colors hover:bg-primary/40"
              data-testid="launchpad-pr-files-resize"
            >
              <div className="absolute inset-y-0 left-0.5 w-px bg-border transition-colors group-hover:bg-primary/60" />
            </div>
            <div
              className="h-full min-w-[350px] shrink-0 overflow-hidden"
              style={{ width: filesWidth }}
            >
              <PrFilesPanel repoPath={repoPath} prNumber={pr.number} />
            </div>
          </>
        )}
      </div>
    </RepoGitHubOverrideContext.Provider>
  )
}
