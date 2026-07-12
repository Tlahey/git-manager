import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Check, ChevronDown, GitBranch, Search } from 'lucide-react'
import { Spinner, Popover, PopoverTrigger, PopoverContent } from '@git-manager/ui'
import { useTranslation } from '@git-manager/i18n'
import { useRepoDataStore } from '../../stores/repoData.store'
import { useRepoUIStore } from '../../stores/repoUI.store'
import { useBranches } from '../../hooks/useBranches'
import { apiCheckoutBranch } from '../../api/git.api'
import { apiOpenRepo } from '../../api/repo.api'

/** Sélecteur de la branche courante du dépôt actif (checkout au clic). */
export function BranchContext() {
  const { t } = useTranslation('git')
  const queryClient = useQueryClient()
  const { activeRepo } = useRepoUIStore()
  const { repoCache, setRepoCache } = useRepoDataStore()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!error) return
    const id = setTimeout(() => setError(null), 3000)
    return () => clearTimeout(id)
  }, [error])

  const repo = activeRepo ? repoCache[activeRepo] : undefined
  const { data: branches = [] } = useBranches(activeRepo ?? '')

  const locals = useMemo(() => branches.filter((b) => !b.isRemote), [branches])
  const headBranch = useMemo(() => locals.find((b) => b.isHead), [locals])
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return locals
    return locals.filter((b) => b.shortName.toLowerCase().includes(q))
  }, [locals, query])

  if (!activeRepo) return null

  // La branche affichée vient en priorité du log des branches (toujours à jour
  // après un checkout), avec repli sur le cache repo (head / detached).
  const label =
    headBranch?.shortName ?? (repo?.isDetached ? repo.head.slice(0, 10) : (repo?.head ?? '—'))

  async function handleCheckout(name: string) {
    if (!activeRepo || busy) return
    setBusy(name)
    try {
      const fromDetached = repo?.isDetached ?? false
      const fromRef = fromDetached ? repo!.head : (headBranch?.shortName ?? repo?.head)
      await apiCheckoutBranch(activeRepo, name, fromRef ? { fromRef, fromDetached } : undefined)
      // Rafraîchit le cache repo (head/isDetached/isDirty) + les vues dépendantes.
      try {
        const fresh = await apiOpenRepo(activeRepo)
        setRepoCache(activeRepo, fresh)
      } catch {
        /* ignore */
      }
      queryClient.invalidateQueries({ queryKey: ['branches', activeRepo] })
      queryClient.invalidateQueries({ queryKey: ['git-log', activeRepo] })
      queryClient.invalidateQueries({ queryKey: ['git-status', activeRepo] })
      setOpen(false)
      setQuery('')
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="relative flex min-w-0 flex-col justify-center">
      <span className="select-none px-1 text-[9px] font-medium uppercase tracking-wider text-muted-foreground/60">
        {t('toolbar.branchLabel')}
      </span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            title={label}
            className="flex h-5 min-w-0 max-w-[200px] items-center gap-1 rounded px-1 text-sm font-bold transition-colors hover:bg-accent"
          >
            <span data-testid="branch-context-label" className="min-w-0 flex-1 truncate text-left">
              {label}
            </span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 overflow-hidden p-0">
          <div className="flex items-center gap-2 border-b border-border px-2.5 py-2">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('branch.checkout')}
              className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground"
            />
          </div>

          <div className="max-h-[50vh] overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <div className="px-2 py-4 text-center text-xs text-muted-foreground">
                {t('branch.title')}
              </div>
            ) : (
              filtered.map((branch) => (
                <button
                  key={branch.name}
                  type="button"
                  data-testid={`branch-option-${branch.shortName}`}
                  onClick={() => handleCheckout(branch.shortName)}
                  disabled={busy !== null}
                  className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition-colors hover:bg-accent disabled:opacity-60 ${
                    branch.isHead ? 'bg-accent/60' : ''
                  }`}
                >
                  <GitBranch className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
                    {branch.shortName}
                  </span>
                  {busy === branch.shortName ? (
                    <Spinner className="h-3 w-3 shrink-0" />
                  ) : (
                    branch.isHead && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                  )}
                </button>
              ))
            )}
          </div>
        </PopoverContent>
      </Popover>

      {error &&
        createPortal(
          <div className="pointer-events-none fixed bottom-4 right-4 z-50 max-w-sm rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive shadow-lg">
            {error}
          </div>,
          document.body
        )}
    </div>
  )
}
