import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, GitBranch, Search } from 'lucide-react'
import { useTranslation } from '@git-manager/i18n'
import { useRepoDataStore } from '../../stores/repoData.store'
import { useRepoUIStore } from '../../stores/repoUI.store'
import { useAnchoredMenu } from '@git-manager/components'

/** Dropdown de sélection / recherche du dépôt courant. */
export function RepoSelector() {
  const { t } = useTranslation('git')
  const { savedRepos, repoCache } = useRepoDataStore()
  const { openTabs, activeRepo, openTab } = useRepoUIStore()
  const { open, setOpen, pos, containerRef, triggerRef, menuRef } = useAnchoredMenu()
  const [query, setQuery] = useState('')

  const activeName =
    (activeRepo && (repoCache[activeRepo]?.name ?? activeRepo.split('/').pop())) ??
    t('toolbar.selectRepo')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return savedRepos
    return savedRepos.filter(
      (r) => r.name.toLowerCase().includes(q) || r.path.toLowerCase().includes(q),
    )
  }, [savedRepos, query])

  const openSet = useMemo(() => new Set(openTabs), [openTabs])

  function handleSelect(path: string) {
    openTab(path)
    setOpen(false)
    setQuery('')
  }

  return (
    <div ref={containerRef} className="relative flex min-w-0 flex-col justify-center">
      <span className="select-none px-1 text-[9px] font-medium uppercase tracking-wider text-muted-foreground/60">
        {t('toolbar.repoLabel')}
      </span>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={activeRepo ?? t('toolbar.selectRepo')}
        className="flex h-5 min-w-0 max-w-[200px] items-center gap-1 rounded px-1 text-sm font-bold transition-colors hover:bg-accent"
      >
        <span className="min-w-0 flex-1 truncate text-left">{activeName}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            style={{ position: 'fixed', top: pos.top, bottom: pos.bottom, left: pos.left }}
            className="z-50 w-72 overflow-hidden rounded-md border border-border bg-popover shadow-lg"
          >
            <div className="flex items-center gap-2 border-b border-border px-2.5 py-2">
              <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('toolbar.searchRepo')}
                className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground"
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
                      {isOpen && (
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                      )}
                    </button>
                  )
                })
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}
