import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Plus, FolderOpen, GitBranch, FolderPlus } from 'lucide-react'
import { open } from '@tauri-apps/plugin-dialog'
import { apiOpenRepo, apiInitRepo } from '../../api/repo.api'
import { useRepoDataStore } from '../../stores/repoData.store'
import { useRepoUIStore } from '../../stores/repoUI.store'
import { useAnchoredMenu } from '../../hooks/useAnchoredMenu'
import { CloneRepoDialog } from './CloneRepoDialog'

interface MenuItemProps {
  icon: React.ReactNode
  label: string
  description?: string
  onClick: () => void
}

function MenuItem({ icon, label, description, onClick }: MenuItemProps) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-start gap-2.5 rounded px-2 py-1.5 text-left transition-colors hover:bg-accent"
    >
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <span className="flex flex-col">
        <span className="text-xs font-medium text-foreground">{label}</span>
        {description && (
          <span className="text-[10px] leading-tight text-muted-foreground">{description}</span>
        )}
      </span>
    </button>
  )
}

export function NewTabMenu() {
  const { addRepo } = useRepoDataStore()
  const { openTab } = useRepoUIStore()
  const [cloneOpen, setCloneOpen] = useState(false)
  const {
    open: menuOpen,
    setOpen: setMenuOpen,
    pos: menuPos,
    containerRef,
    triggerRef: buttonRef,
    menuRef,
  } = useAnchoredMenu({ offset: 4 })

  async function handleOpenFolder() {
    setMenuOpen(false)
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
    setMenuOpen(false)
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
    setMenuOpen(false)
    setCloneOpen(true)
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={buttonRef}
        onClick={() => setMenuOpen((v) => !v)}
        className="flex h-8 w-8 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        title="Nouveau"
      >
        <Plus className="h-4 w-4" />
      </button>

      {menuOpen &&
        createPortal(
          <div
            ref={menuRef}
            style={{ position: 'fixed', top: menuPos.top, left: menuPos.left }}
            className="z-50 w-60 rounded-md border border-border bg-popover p-1 shadow-lg"
          >
            <MenuItem
              icon={<FolderOpen className="h-4 w-4" />}
              label="Ouvrir un dossier"
              description="Ouvrir un dépôt Git existant"
              onClick={handleOpenFolder}
            />
            <MenuItem
              icon={<GitBranch className="h-4 w-4" />}
              label="Cloner un dépôt"
              description="Cloner depuis une URL distante"
              onClick={handleClone}
            />
            <MenuItem
              icon={<FolderPlus className="h-4 w-4" />}
              label="Créer un dépôt"
              description="Initialiser un nouveau dépôt"
              onClick={handleCreateRepo}
            />
          </div>,
          document.body,
        )}

      <CloneRepoDialog open={cloneOpen} onOpenChange={setCloneOpen} />
    </div>
  )
}
