import { useRepoUIStore } from '../../../stores/repoUI.store'
import { PrFilesList } from './PrFilesList'

interface PrFilesPanelProps {
  repoPath: string
  prNumber: number
}

/** The always-visible right panel while a PR is open: only the PR's changed files. Clicking a file
 * opens its diff in the center panel (via `activePrFile`). PR metadata lives in the center content
 * ({@link PrMetaSidebar}), not here. */
export function PrFilesPanel({ repoPath, prNumber }: PrFilesPanelProps) {
  const activePrFile = useRepoUIStore((s) => s.activePrFile)
  const setActivePrFile = useRepoUIStore((s) => s.setActivePrFile)

  return (
    <div data-testid="pr-files-panel" className="flex h-full flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <PrFilesList
          repoPath={repoPath}
          prNumber={prNumber}
          onSelect={setActivePrFile}
          activeFile={activePrFile}
        />
      </div>
    </div>
  )
}
