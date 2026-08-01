import { useState } from 'react'
import { Plus, FolderOpen, GitBranch, FolderPlus } from 'lucide-react'
import { useTranslation } from '@git-manager/i18n'
import { pickFolder } from '../../lib/pickFolder'
import { apiOpenRepo, apiInitRepo } from '../../api/repo.api'
import { useRepoDataStore } from '../../stores/repoData.store'
import { useOpenRepoTab } from '../../hooks/useOpenRepoTab'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@git-manager/ui'
import { CloneRepoDialog } from './CloneRepoDialog'

interface MenuItemProps {
  icon: React.ReactNode
  label: string
  description?: string
  onSelect: () => void
}

function MenuItem({ icon, label, description, onSelect }: MenuItemProps) {
  return (
    <DropdownMenuItem onSelect={onSelect} className="items-start gap-2.5">
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <span className="flex flex-col">
        <span className="text-xs font-medium text-foreground">{label}</span>
        {description && (
          <span className="text-[10px] leading-tight text-muted-foreground">{description}</span>
        )}
      </span>
    </DropdownMenuItem>
  )
}

export function NewTabMenu() {
  const { t } = useTranslation('common')
  const { addRepo } = useRepoDataStore()
  const openRepoTab = useOpenRepoTab()
  const [cloneOpen, setCloneOpen] = useState(false)

  async function handleOpenFolder() {
    const selected = await pickFolder()
    if (!selected) return
    try {
      const repo = await apiOpenRepo(selected)
      addRepo(repo)
      openRepoTab(repo.path)
    } catch {
      // non-git folder: silently ignored here
    }
  }

  async function handleCreateRepo() {
    const selected = await pickFolder()
    if (!selected) return
    try {
      const repo = await apiInitRepo(selected)
      addRepo(repo)
      openRepoTab(repo.path)
    } catch {
      // init error: silently ignored here
    }
  }

  function handleClone() {
    setCloneOpen(true)
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded text-sidebar-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
            title={t('tabBar.newTab')}
          >
            <Plus className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-60">
          <MenuItem
            icon={<FolderOpen className="h-4 w-4" />}
            label={t('tabBar.openFolder')}
            description={t('tabBar.openFolderDesc')}
            onSelect={handleOpenFolder}
          />
          <MenuItem
            icon={<GitBranch className="h-4 w-4" />}
            label={t('tabBar.cloneRepo')}
            description={t('tabBar.cloneRepoDesc')}
            onSelect={handleClone}
          />
          <MenuItem
            icon={<FolderPlus className="h-4 w-4" />}
            label={t('tabBar.createRepo')}
            description={t('tabBar.createRepoDesc')}
            onSelect={handleCreateRepo}
          />
        </DropdownMenuContent>
      </DropdownMenu>

      <CloneRepoDialog open={cloneOpen} onOpenChange={setCloneOpen} />
    </>
  )
}
