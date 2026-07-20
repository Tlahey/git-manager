import { useState } from 'react'
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Spinner,
} from '@git-manager/ui'
import { FolderOpen } from 'lucide-react'
import { open } from '@tauri-apps/plugin-dialog'
import { apiCloneRepo } from '../../api/repo.api'
import { useRepoDataStore } from '../../stores/repoData.store'
import { useRepoUIStore } from '../../stores/repoUI.store'

interface CloneRepoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Dérive le nom de dossier depuis une URL Git (https ou ssh). */
function deriveFolderName(url: string): string {
  const cleaned = url
    .trim()
    .replace(/\/+$/, '')
    .replace(/\.git$/, '')
  const segment = cleaned.split(/[/:]/).pop() ?? ''
  return segment || 'repository'
}

export function CloneRepoDialog({ open: isOpen, onOpenChange }: CloneRepoDialogProps) {
  const { addRepo } = useRepoDataStore()
  const { openTab } = useRepoUIStore()
  const [url, setUrl] = useState('')
  const [parentDir, setParentDir] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [shallow, setShallow] = useState(false)
  const [sparse, setSparse] = useState(false)

  const folderName = url.trim() ? deriveFolderName(url) : ''

  function reset() {
    setUrl('')
    setParentDir('')
    setError(null)
    setLoading(false)
    setShallow(false)
    setSparse(false)
  }

  function handleClose(next: boolean) {
    if (!next) reset()
    onOpenChange(next)
  }

  async function pickParentDir() {
    const selected = await open({ directory: true, multiple: false })
    if (selected && typeof selected === 'string') setParentDir(selected)
  }

  async function handleClone() {
    setError(null)
    if (!url.trim() || !parentDir) return
    setLoading(true)
    try {
      const destPath = `${parentDir}/${folderName}`
      const repo = await apiCloneRepo(url.trim(), destPath, shallow, sparse)
      addRepo(repo)
      openTab(repo.path)
      handleClose(false)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Cloner un dépôt</DialogTitle>
          <DialogDescription>
            Saisissez l&apos;URL du dépôt distant et choisissez où le cloner.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">URL du dépôt</label>
            <Input
              autoFocus
              placeholder="git@github.com:owner/repo.git"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Dossier parent</label>
            <div className="flex gap-2">
              <Input
                readOnly
                placeholder="Choisir un dossier…"
                value={parentDir}
                className="flex-1"
              />
              <Button type="button" variant="outline" size="sm" onClick={pickParentDir}>
                <FolderOpen className="h-4 w-4" />
              </Button>
            </div>
            {parentDir && folderName && (
              <p className="truncate text-[11px] text-muted-foreground">
                Destination : {parentDir}/{folderName}
              </p>
            )}
          </div>

          <div className="mt-1 flex gap-4 font-sans">
            <label className="flex cursor-pointer select-none items-center gap-2">
              <Checkbox checked={shallow} onChange={(e) => setShallow(e.target.checked)} />
              <span className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
                Shallow clone
              </span>
            </label>
            <label className="flex cursor-pointer select-none items-center gap-2">
              <Checkbox checked={sparse} onChange={(e) => setSparse(e.target.checked)} />
              <span className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
                Sparse checkout
              </span>
            </label>
          </div>

          {error && (
            <p className="rounded bg-destructive/10 px-2 py-1.5 text-[11px] text-destructive">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => handleClose(false)} disabled={loading}>
            Annuler
          </Button>
          <Button onClick={handleClone} disabled={loading || !url.trim() || !parentDir}>
            {loading && <Spinner className="mr-2 h-4 w-4" />}
            Cloner
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
