import { useQuery } from '@tanstack/react-query'
import {
  HardDrive,
  Globe,
  GitPullRequest,
  Tag as TagIcon,
  GitFork,
  Archive as ArchiveIcon,
  Terminal as TerminalIcon,
} from 'lucide-react'
import { NumberBadge, cn } from '@git-manager/ui'
import type { GitRef, GitSubmodule } from '@git-manager/git-types'
import { useBranches } from '../../../hooks/useBranches'
import { usePullRequests } from '../../../hooks/usePullRequests'
import { useGitStashes } from '../../../hooks/useGitStashes'
import { apiGetTags, apiListSubmodules } from '../../../api/git.api'
import { useTerminalStore } from '../../../stores/terminal.store'
import { useTerminalActivity } from '../../../hooks/useTerminalActivity'
import type { SectionKey } from './types'

interface SidebarRailProps {
  repoPath: string
  remoteUrls: string[]
  currentUser?: string
  githubAccountId?: string
  /**
   * Reopens the sidebar *on* a section: an icon stands for one section, so clicking it should land
   * on that section's content rather than on whatever the sidebar happened to be showing.
   */
  onOpenSection: (key: SectionKey) => void
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
      className="group/rail relative flex h-10 w-full cursor-pointer items-center justify-center text-sidebar-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
    >
      {icon}
      <NumberBadge
        count={count ?? 0}
        className="absolute top-1 right-1 h-3.5 min-h-0 min-w-[14px] px-0.5 text-[8px]"
      />
    </button>
  )
}

export function SidebarRail({
  repoPath,
  remoteUrls,
  currentUser,
  githubAccountId,
  onOpenSection,
}: SidebarRailProps) {
  const { data: branches = [] } = useBranches(repoPath)
  const localCount = branches.filter((b) => !b.isRemote).length
  const remoteCount = branches.filter((b) => b.isRemote).length

  const { allPrs } = usePullRequests({ remoteUrls, currentUser, githubAccountId })

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

  // Terminals get a rail icon so a running agent stays visible with the sidebar folded away — that
  // is the state a long-running session is most likely to be forgotten in. It turns amber while
  // something is running, which is the only colour change on the rail that isn't decorative.
  const sessions = useTerminalStore((s) => s.sessions)
  const activity = useTerminalActivity()
  const anyBusy = sessions.some((session) => activity[session.id]?.busy)

  return (
    <div className="flex h-full flex-col items-center">
      {/* No expand button of its own: coming back to full width is the toolbar's panel control (or
          ⌘S), the same one that folded the sidebar to this rail. A second entrance here would be a
          third thing to keep in step with the first two, and the icons below already come back —
          each on its own section, which is more than a bare expand would do. */}
      <div className="flex w-full flex-1 flex-col py-1">
        <RailIcon
          icon={<HardDrive className="h-4 w-4" />}
          label="Local"
          count={localCount}
          onClick={() => onOpenSection('local')}
        />
        <RailIcon
          icon={<Globe className="h-4 w-4" />}
          label="Remotes"
          count={remoteCount}
          onClick={() => onOpenSection('remotes')}
        />
        <RailIcon
          icon={<GitPullRequest className="h-4 w-4" />}
          label="Pull Requests"
          count={allPrs.length}
          onClick={() => onOpenSection('prs')}
        />
        <RailIcon
          icon={<TagIcon className="h-4 w-4" />}
          label="Tags"
          count={tags.length}
          onClick={() => onOpenSection('tags')}
        />
        {stashes.length > 0 && (
          <RailIcon
            icon={<ArchiveIcon className="h-4 w-4 text-violet-400" />}
            label="Stashes"
            count={stashes.length}
            onClick={() => onOpenSection('stashes')}
          />
        )}
        {submodules.length > 0 && (
          <RailIcon
            icon={<GitFork className="h-4 w-4" />}
            label="Submodules"
            count={submodules.length}
            onClick={() => onOpenSection('submodules')}
          />
        )}
        {sessions.length > 0 && (
          <RailIcon
            // The same two states the rows use — breathing amber while a command runs, still green
            // otherwise — on a bare glyph rather than a chip, since the rail has no chips.
            icon={
              <TerminalIcon
                className={cn(
                  'h-4 w-4',
                  anyBusy ? 'animate-pulse text-tone-warning' : 'text-tone-success'
                )}
              />
            }
            label="Terminals"
            count={sessions.length}
            onClick={() => onOpenSection('terminals')}
          />
        )}
      </div>
    </div>
  )
}
