import { useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { useQueryClient } from '@tanstack/react-query'
import { Button, Input, ScrollArea, Spinner } from '@git-manager/ui'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@git-manager/ui'
import { useGitLog } from '../../hooks/useGitLog'
import { apiCreateFixupCommit } from '../../api/git.api'

interface FixupTargetSelectorProps {
  repoPath: string
  open: boolean
  onClose: () => void
  onSelect: (targetOid: string, targetSubject: string) => void
}

function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
  })
}

export function FixupTargetSelector({
  repoPath,
  open,
  onClose,
  onSelect,
}: FixupTargetSelectorProps) {
  const { t } = useTranslation('git')
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [selectedOid, setSelectedOid] = useState<string | null>(null)
  const [selectedSubject, setSelectedSubject] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data: nodes = [], isLoading: isLoadingLog } = useGitLog(repoPath, { limit: 50 })

  const filtered = nodes.filter((n) =>
    n.commit.subject.toLowerCase().includes(search.toLowerCase()) ||
    n.commit.shortOid.toLowerCase().includes(search.toLowerCase()),
  )

  async function handleConfirm() {
    if (!selectedOid) return
    setIsLoading(true)
    setError(null)
    try {
      await apiCreateFixupCommit(repoPath, selectedOid)
      queryClient.invalidateQueries({ queryKey: ['git-log', repoPath] })
      queryClient.invalidateQueries({ queryKey: ['git-status', repoPath] })
      onSelect(selectedOid, selectedSubject)
      onClose()
    } catch (err) {
      setError(String(err))
    } finally {
      setIsLoading(false)
    }
  }

  function handleOpenChange(isOpen: boolean) {
    if (!isOpen) {
      setError(null)
      setSearch('')
      setSelectedOid(null)
      onClose()
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('fixup.createTitle')}</DialogTitle>
        </DialogHeader>

        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('fixup.searchCommits')}
          className="h-7 text-xs"
        />

        <ScrollArea className="h-64 rounded border border-border">
          {isLoadingLog ? (
            <div className="flex h-full items-center justify-center">
              <Spinner className="h-4 w-4 text-muted-foreground" />
            </div>
          ) : (
            <div className="p-1 space-y-0.5">
              {filtered.map((n) => {
                const isSelected = n.commit.oid === selectedOid
                return (
                  <button
                    key={n.commit.oid}
                    onClick={() => {
                      setSelectedOid(n.commit.oid)
                      setSelectedSubject(n.commit.subject)
                    }}
                    className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors ${
                      isSelected
                        ? 'bg-primary/20 text-foreground'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                    }`}
                  >
                    <code className="shrink-0 font-mono">{n.commit.shortOid}</code>
                    <span className="flex-1 truncate">{n.commit.subject}</span>
                    <span className="shrink-0 opacity-60">
                      {formatDate(n.commit.author.timestamp)}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </ScrollArea>

        {error && (
          <p className="rounded bg-destructive/20 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleConfirm} disabled={!selectedOid || isLoading}>
            {isLoading && <Spinner className="mr-1 h-3 w-3" />}
            {t('fixup.createTitle')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
