import { useMemo, useState } from 'react'
import { HardDrive, Plus } from 'lucide-react'
import type { GitBranch } from '@git-manager/git-types'
import { useBranches } from '../../hooks/useBranches'
import { useGroupedBranches } from '../../hooks/useGroupedBranches'
import { usePinnedBranchesStore } from '../../stores/pinned-branches.store'
import { SectionHeader } from './SectionHeader'
import { BranchFolder } from './BranchFolder'
import { BranchItem } from './BranchItem'

/** Branches toujours épinglées par défaut, dans cet ordre de priorité. */
const DEFAULT_PINNED = ['main', 'master']

interface LocalBranchesSectionProps {
  repoPath: string
  selectedBranch: string | null
  filter?: string
  onSelectBranch: (name: string) => void
  onContextMenu?: (e: React.MouseEvent, branch: GitBranch) => void
  onCreateBranch?: () => void
}

export function LocalBranchesSection({
  repoPath,
  selectedBranch,
  filter = '',
  onSelectBranch,
  onContextMenu,
  onCreateBranch,
}: LocalBranchesSectionProps) {
  const [isOpen, setIsOpen] = useState(true)
  const { data: allBranches = [] } = useBranches(repoPath)

  const overrides = usePinnedBranchesStore((s) => s.overrides[repoPath])
  const setPin = usePinnedBranchesStore((s) => s.setPin)

  const localBranches = useMemo(() => {
    const local = allBranches.filter((b) => !b.isRemote)
    const q = filter.trim().toLowerCase()
    if (!q) return local
    return local.filter((b) => b.shortName.toLowerCase().includes(q))
  }, [allBranches, filter])

  // État épinglé effectif : override explicite, sinon défaut (main/master).
  const isPinnedBranch = (shortName: string): boolean =>
    overrides?.[shortName] ?? DEFAULT_PINNED.includes(shortName)

  // Ensemble des branches actuellement épinglées (parmi les locales visibles).
  const pinnedNames = useMemo(() => {
    const set = new Set<string>()
    for (const b of localBranches) {
      if (isPinnedBranch(b.shortName)) set.add(b.shortName)
    }
    return set
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localBranches, overrides])

  const onTogglePin = (shortName: string) => setPin(repoPath, shortName, !isPinnedBranch(shortName))

  // Branches épinglées triées : main/master d'abord, puis ordre alpha.
  const pinnedBranches = useMemo(() => {
    return localBranches
      .filter((b) => pinnedNames.has(b.shortName))
      .sort((a, b) => {
        const ai = DEFAULT_PINNED.indexOf(a.shortName)
        const bi = DEFAULT_PINNED.indexOf(b.shortName)
        if (ai !== -1 || bi !== -1) {
          return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
        }
        return a.shortName.localeCompare(b.shortName)
      })
  }, [localBranches, pinnedNames])

  // Branches restantes (non épinglées) groupées par préfixe.
  const remainingBranches = useMemo(
    () => localBranches.filter((b) => !pinnedNames.has(b.shortName)),
    [localBranches, pinnedNames]
  )
  const { groups, ungrouped } = useGroupedBranches(remainingBranches)

  return (
    <div>
      <SectionHeader
        title="Local"
        icon={<HardDrive className="h-3 w-3" />}
        count={localBranches.length}
        isOpen={isOpen}
        onToggle={() => setIsOpen((o) => !o)}
        action={
          onCreateBranch ? (
            <button
              onClick={onCreateBranch}
              className="mr-1 rounded p-0.5 transition-colors hover:bg-accent"
              aria-label="Créer une branche"
              title="Créer une branche"
            >
              <Plus className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          ) : undefined
        }
      />

      {isOpen && (
        <div className="pb-1">
          {/* Branches épinglées (main/master + pins utilisateur) en haut */}
          {pinnedBranches.map((branch) => (
            <BranchItem
              key={branch.name}
              branch={branch}
              isSelected={selectedBranch === branch.shortName || selectedBranch === branch.name}
              depth={0}
              isPinned
              onSelect={onSelectBranch}
              onTogglePin={onTogglePin}
              onContextMenu={onContextMenu}
            />
          ))}

          {pinnedBranches.length > 0 && (ungrouped.length > 0 || groups.length > 0) && (
            <div className="my-1 border-t border-border/40" />
          )}

          {/* Branches non-groupées (sans préfixe ou préfixe unique) */}
          {ungrouped.map((branch) => (
            <BranchItem
              key={branch.name}
              branch={branch}
              isSelected={selectedBranch === branch.shortName || selectedBranch === branch.name}
              depth={0}
              isPinned={false}
              onSelect={onSelectBranch}
              onTogglePin={onTogglePin}
              onContextMenu={onContextMenu}
            />
          ))}

          {/* Dossiers virtuels de préfixes */}
          {groups.map(({ prefix, branches }) => (
            <BranchFolder
              key={prefix}
              prefix={prefix}
              branches={branches}
              selectedBranch={selectedBranch}
              pinnedNames={pinnedNames}
              onSelect={onSelectBranch}
              onTogglePin={onTogglePin}
              onContextMenu={onContextMenu}
            />
          ))}
        </div>
      )}
    </div>
  )
}
