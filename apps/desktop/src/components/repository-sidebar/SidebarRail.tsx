import { useQuery } from '@tanstack/react-query'
import {
  PanelLeftOpen,
  HardDrive,
  Globe,
  GitPullRequest,
  Tag as TagIcon,
  GitFork,
  Archive as ArchiveIcon,
} from 'lucide-react'
import type { GitRef, GitSubmodule } from '@git-manager/git-types'
import { useBranches } from '../../hooks/useBranches'
import { usePullRequests } from '../../hooks/usePullRequests'
import { useGitStashes } from '../../hooks/useGitStashes'
import { apiGetTags, apiListSubmodules } from '../../api/git.api'

interface SidebarRailProps {
  repoPath: string
  remoteUrls: string[]
  currentUser?: string
  githubToken?: string
  onExpand: () => void
}

interface RailIconProps {
  icon: React.ReactNode
  label: string
  count?: number
  onClick: () => void
}

function RailIcon({ icon, label, count, onClick }: RailIconProps) {
  return (
    <button
      onClick={onClick}
      title={count !== undefined ? `${label} (${count})` : label}
      aria-label={label}
      className="group/rail relative flex h-10 w-full items-center justify-center text-sidebar-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
    >
      {icon}
      {count !== undefined && count > 0 && (
        <span className="absolute right-1 top-1 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-primary/80 px-0.5 text-[8px] font-bold tabular-nums text-primary-foreground">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </button>
  )
}

export function SidebarRail({
  repoPath,
  remoteUrls,
  currentUser,
  githubToken,
  onExpand,
}: SidebarRailProps) {
  const { data: branches = [] } = useBranches(repoPath)
  const localCount = branches.filter((b) => !b.isRemote).length
  const remoteCount = branches.filter((b) => b.isRemote).length

  const { allPrs } = usePullRequests({ remoteUrls, currentUser, githubToken })

  const { data: tags = [] } = useQuery<GitRef[]>({
    queryKey: ['tags', repoPath],
    queryFn: () => apiGetTags(repoPath),
    enabled: !!repoPath,
    staleTime: 30_000,
  })

  const { data: submodules = [] } = useQuery<GitSubmodule[]>({
    queryKey: ['submodules', repoPath],
    queryFn: () => apiListSubmodules(repoPath),
    enabled: !!repoPath,
    staleTime: 60_000,
  })

  const { data: stashes = [] } = useGitStashes(repoPath)

  return (
    <div className="flex h-full flex-col items-center">
      {/* Bouton expand */}
      <button
        onClick={onExpand}
        title="Déplier la sidebar"
        aria-label="Déplier la sidebar"
        className="flex h-9 w-full items-center justify-center border-b border-sidebar-border text-sidebar-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
      >
        <PanelLeftOpen className="h-4 w-4" />
      </button>

      {/* Icônes des sections */}
      <div className="flex w-full flex-1 flex-col py-1">
        <RailIcon
          icon={<HardDrive className="h-4 w-4" />}
          label="Local"
          count={localCount}
          onClick={onExpand}
        />
        <RailIcon
          icon={<Globe className="h-4 w-4" />}
          label="Remotes"
          count={remoteCount}
          onClick={onExpand}
        />
        <RailIcon
          icon={<GitPullRequest className="h-4 w-4" />}
          label="Pull Requests"
          count={allPrs.length}
          onClick={onExpand}
        />
        <RailIcon
          icon={<TagIcon className="h-4 w-4" />}
          label="Tags"
          count={tags.length}
          onClick={onExpand}
        />
        {stashes.length > 0 && (
          <RailIcon
            icon={<ArchiveIcon className="h-4 w-4 text-violet-400" />}
            label="Stashes"
            count={stashes.length}
            onClick={onExpand}
          />
        )}
        {submodules.length > 0 && (
          <RailIcon
            icon={<GitFork className="h-4 w-4" />}
            label="Submodules"
            count={submodules.length}
            onClick={onExpand}
          />
        )}
      </div>
    </div>
  )
}
