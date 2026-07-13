import { useState } from 'react'
import { Plus, FolderOpen, GitBranch, FolderPlus } from 'lucide-react'
import { open } from '@tauri-apps/plugin-dialog'
import { apiOpenRepo, apiInitRepo } from '../../api/repo.api'
import { useRepoDataStore } from '../../stores/repoData.store'
import { useRepoUIStore } from '../../stores/repoUI.store'
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
  const { addRepo } = useRepoDataStore()
  const { openTab } = useRepoUIStore()
  const [cloneOpen, setCloneOpen] = useState(false)

  async function handleOpenFolder() {
    const selected = await open({ directory: true, multiple: false })
    if (!selected || typeof selected !== 'string') return
    try {
      const repo = await apiOpenRepo(selected)
      addRepo(repo)
      openTab(repo.path)
    } catch {
      // dossier non-git : ignoré silencieusement ici
    }
  }

  async function handleCreateRepo() {
    const selected = await open({ directory: true, multiple: false })
    if (!selected || typeof selected !== 'string') return
    try {
      const repo = await apiInitRepo(selected)
      addRepo(repo)
      openTab(repo.path)
    } catch {
      // erreur d'init : ignorée silencieusement ici
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
            className="flex h-8 w-8 items-center justify-center rounded text-sidebar-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
            title="Nouveau"
          >
            <Plus className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-60">
          <MenuItem
            icon={<FolderOpen className="h-4 w-4" />}
            label="Ouvrir un dossier"
            description="Ouvrir un dépôt Git existant"
            onSelect={handleOpenFolder}
          />
          <MenuItem
            icon={<GitBranch className="h-4 w-4" />}
            label="Cloner un dépôt"
            description="Cloner depuis une URL distante"
            onSelect={handleClone}
          />
          <MenuItem
            icon={<FolderPlus className="h-4 w-4" />}
            label="Créer un dépôt"
            description="Initialiser un nouveau dépôt"
            onSelect={handleCreateRepo}
          />
        </DropdownMenuContent>
      </DropdownMenu>

      <CloneRepoDialog open={cloneOpen} onOpenChange={setCloneOpen} />
    </>
  )
}
