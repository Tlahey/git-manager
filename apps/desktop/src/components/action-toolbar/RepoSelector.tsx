import { useMemo, useState } from 'react'
import { ChevronDown, GitBranch, Search } from 'lucide-react'
import { useTranslation } from '@git-manager/i18n'
import { useRepoDataStore } from '../../stores/repoData.store'
import { useRepoUIStore } from '../../stores/repoUI.store'
import { Popover, PopoverTrigger, PopoverContent, Input } from '@git-manager/ui'

/** Dropdown de sélection / recherche du dépôt courant. */
export function RepoSelector() {
  const { t } = useTranslation('git')
  const { savedRepos, repoCache } = useRepoDataStore()
  const { openTabs, activeRepo, openTab } = useRepoUIStore()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const activeName =
    (activeRepo && (repoCache[activeRepo]?.name ?? activeRepo.split('/').pop())) ??
    t('toolbar.selectRepo')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return savedRepos
    return savedRepos.filter(
      (r) => r.name.toLowerCase().includes(q) || r.path.toLowerCase().includes(q)
    )
  }, [savedRepos, query])

  const openSet = useMemo(() => new Set(openTabs), [openTabs])

  function handleSelect(path: string) {
    openTab(path)
    setOpen(false)
    setQuery('')
  }

  return (
    <div className="relative flex min-w-0 flex-col justify-center">
      <span className="select-none px-1 text-[9px] font-medium uppercase tracking-wider text-muted-foreground/60">
        {t('toolbar.repoLabel')}
      </span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            title={activeRepo ?? t('toolbar.selectRepo')}
            className="flex h-5 min-w-0 max-w-[200px] items-center gap-1 rounded px-1 text-sm font-bold transition-colors hover:bg-accent"
          >
            <span className="min-w-0 flex-1 truncate text-left">{activeName}</span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 overflow-hidden p-0">
          <div className="border-b border-border p-1.5">
            <Input
              variant="ghost"
              inputSize="sm"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('toolbar.searchRepo')}
              startIcon={<Search className="h-3.5 w-3.5 text-muted-foreground" />}
            />
          </div>

          <div className="max-h-[50vh] overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <div className="px-2 py-4 text-center text-xs text-muted-foreground">
                {t('toolbar.noRepo')}
              </div>
            ) : (
              filtered.map((repo) => {
                const isActive = repo.path === activeRepo
                const isOpen = openSet.has(repo.path)
                return (
                  <button
                    key={repo.path}
                    type="button"
                    onClick={() => handleSelect(repo.path)}
                    className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition-colors hover:bg-accent ${
                      isActive ? 'bg-accent/60' : ''
                    }`}
                  >
                    <GitBranch className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-xs font-medium text-foreground">
                        {repo.name}
                      </span>
                      <span className="truncate text-[10px] leading-tight text-muted-foreground">
                        {repo.path}
                      </span>
                    </span>
                    {isOpen && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
                  </button>
                )
              })
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
