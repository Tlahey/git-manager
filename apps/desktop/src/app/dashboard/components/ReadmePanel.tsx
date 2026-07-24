import { useState, useMemo } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { BookOpen, X, RefreshCw, FileText, Github, Gitlab, Code, Eye } from 'lucide-react'
import { Button } from '@git-manager/ui'
import { Markdown } from '../../../components/Markdown'
import { useRepoReadme } from '../../../hooks/useRepoReadme'
import { useRepoDataStore } from '../../../stores/repoData.store'
import { apiOpenUrl } from '../../../api/shell.api'

interface ReadmePanelProps {
  path: string
  onClose: () => void
}

export function ReadmePanel({ path, onClose }: ReadmePanelProps) {
  const { t } = useTranslation(['dashboard', 'git'])
  const { data: content, isLoading, error } = useRepoReadme(path)
  const loading = isLoading || (content === undefined && !error)
  const [showRaw, setShowRaw] = useState(false)

  const name = path.split('/').pop() || path

  const repoCache = useRepoDataStore((s) => s.repoCache)
  const cachedRepo = repoCache[path]

  const remoteUrl = useMemo(() => {
    if (!cachedRepo?.remotes) return null
    const remotes = cachedRepo.remotes
    const origin = remotes.find((r) => r.includes('github.com') || r.includes('gitlab.com'))
    if (!origin) return null
    let url = origin.replace(/\.git$/, '')
    if (url.startsWith('git@')) {
      url = 'https://' + url.substring(4).replace(':', '/')
    }
    return url
  }, [cachedRepo])

  return (
    <div className="flex h-full w-full min-w-0 flex-col border-l border-border bg-card shadow-2xl">
      {/* Pane Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-muted/10 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <BookOpen className="h-4 w-4 shrink-0 text-primary" />
          <span className="truncate text-xs font-semibold text-foreground">{name}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="flex h-7 items-center gap-1 px-2 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            onClick={() => setShowRaw(!showRaw)}
            title={showRaw ? 'Mode Aperçu' : 'Mode Code Source'}
            data-testid="readme-toggle-mode"
          >
            {showRaw ? <Eye className="h-3.5 w-3.5" /> : <Code className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">{showRaw ? 'Aperçu' : 'Code'}</span>
          </Button>
          {remoteUrl && (
            <Button
              variant="ghost"
              size="sm"
              className="flex h-7 items-center gap-1.5 px-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              onClick={() => apiOpenUrl(remoteUrl)}
              title={
                t('commitDetails.openRemote', { ns: 'git' }) ||
                (remoteUrl.includes('gitlab.com') ? 'Open GitLab' : 'Open GitHub')
              }
              data-testid="github-repo-button"
            >
              {remoteUrl.includes('gitlab.com') ? (
                <Gitlab className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <Github className="h-3.5 w-3.5 text-muted-foreground" />
              )}
              <span className="hidden text-[11px] font-medium sm:inline">
                {remoteUrl.includes('gitlab.com') ? 'GitLab' : 'GitHub'}
              </span>
            </Button>
          )}
          <button
            onClick={onClose}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title={t('git:actions.close')}
            data-testid="readme-panel-close-button"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Pane content */}
      <div className="flex-1 select-text overflow-y-auto bg-card/10 p-5">
        {loading ? (
          <div className="flex h-full flex-col items-center justify-center space-y-2 py-8">
            <RefreshCw className="h-6 w-6 animate-spin text-primary" />
            <p className="text-xs text-muted-foreground">Chargement du README...</p>
          </div>
        ) : error || content === undefined ? (
          <div className="flex h-full flex-col items-center justify-center p-4 text-center text-muted-foreground/60">
            <FileText className="mb-2 h-10 w-10 text-muted-foreground opacity-20" />
            <p className="font-sans text-xs">
              {t('dashboard.noReadme') || 'Aucun fichier README trouvé.'}
            </p>
          </div>
        ) : showRaw ? (
          <pre
            className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-foreground select-text p-2 rounded bg-muted/20 border border-border/40"
            data-testid="readme-raw-content"
          >
            {content}
          </pre>
        ) : (
          <Markdown content={content} repoPath={path} />
        )}
      </div>
    </div>
  )
}

