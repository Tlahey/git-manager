import { useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Spinner, Input, RadioGroup, RadioGroupItem } from '@git-manager/ui'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@git-manager/ui'
import { apiGetCommitsBetween, apiResetToCommit } from '../../api/git.api'

type ResetMode = 'soft' | 'mixed' | 'hard'

interface ResetDialogProps {
  repoPath: string
  targetOid: string
  targetSubject: string
  open: boolean
  onClose: () => void
  onSuccess: () => void
  protectedBranches?: string[]
  currentBranch?: string
  initialMode?: ResetMode
}

export function ResetDialog({
  repoPath,
  targetOid,
  targetSubject,
  open,
  onClose,
  onSuccess,
  protectedBranches = [],
  currentBranch = '',
  initialMode = 'mixed',
}: ResetDialogProps) {
  const { t } = useTranslation('git')
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<ResetMode>(initialMode)
  const [hardConfirm, setHardConfirm] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isProtected = currentBranch !== '' && protectedBranches.includes(currentBranch)

  const { data: commits = [], isLoading: isLoadingCommits } = useQuery({
    queryKey: ['commits-between', repoPath, 'HEAD', targetOid],
    queryFn: () => apiGetCommitsBetween(repoPath, 'HEAD', targetOid),
    enabled: open,
  })

  const canConfirm = !isProtected && !isLoading && (mode !== 'hard' || hardConfirm === 'RESET')

  async function handleConfirm() {
    setIsLoading(true)
    setError(null)
    try {
      await apiResetToCommit(repoPath, targetOid, mode)
      queryClient.invalidateQueries({ queryKey: ['git-log', repoPath] })
      queryClient.invalidateQueries({ queryKey: ['git-status', repoPath] })
      onSuccess()
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
      setHardConfirm('')
      setMode(initialMode)
      onClose()
    }
  }

  const modeOptions: { value: ResetMode; label: string }[] = [
    { value: 'soft', label: t('rollback.reset.soft') },
    { value: 'mixed', label: t('rollback.reset.mixed') },
    { value: 'hard', label: t('rollback.reset.hard') },
  ]

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg" data-testid="reset-dialog">
        <DialogHeader>
          <DialogTitle>{t('rollback.reset.title', { message: targetSubject })}</DialogTitle>
        </DialogHeader>

        {isProtected && (
          <p className="rounded bg-destructive/20 px-3 py-2 text-xs text-destructive">
            {t('rollback.protected.branch', { branch: currentBranch })}
          </p>
        )}

        {/* Commits list */}
        <div className="space-y-1">
          {isLoadingCommits ? (
            <p className="text-xs text-muted-foreground">Loading commits…</p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                {t('rollback.reset.commitsAffected', { count: commits.length })}
              </p>
              <div className="max-h-32 space-y-0.5 overflow-y-auto rounded border border-border bg-muted/30 p-2">
                {commits.map((c) => (
                  <div key={c.oid} className="flex items-center gap-2 text-xs">
                    <code className="shrink-0 font-mono text-muted-foreground">{c.shortOid}</code>
                    <span className="truncate text-foreground">{c.subject}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Reset mode radio */}
        <RadioGroup
          name="reset-mode"
          value={mode}
          onValueChange={(value) => setMode(value as ResetMode)}
        >
          {modeOptions.map((opt) => (
            <label
              key={opt.value}
              className={`flex cursor-pointer items-center gap-2 rounded border px-3 py-2 text-sm transition-colors ${
                mode === opt.value
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-border text-muted-foreground hover:bg-accent'
              }`}
            >
              <RadioGroupItem value={opt.value} />
              {opt.label}
            </label>
          ))}
        </RadioGroup>

        {/* Hard reset warning */}
        {mode === 'hard' && (
          <div className="space-y-2 rounded border border-destructive/50 bg-destructive/10 p-3">
            <p className="text-xs font-medium text-destructive">
              {t('rollback.reset.hardWarning')}
            </p>
            <Input
              value={hardConfirm}
              onChange={(e) => setHardConfirm(e.target.value)}
              placeholder={t('rollback.reset.hardConfirmPlaceholder')}
              className="h-7 text-xs"
              data-testid="reset-hard-confirm-input"
            />
          </div>
        )}

        {error && (
          <p className="rounded bg-destructive/20 px-3 py-2 text-xs text-destructive">{error}</p>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            size="sm"
            variant={mode === 'hard' ? 'destructive' : 'default'}
            onClick={handleConfirm}
            disabled={!canConfirm}
            data-testid="reset-confirm-button"
          >
            {isLoading && <Spinner className="mr-1 h-3 w-3" />}
            {t('rollback.reset.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
