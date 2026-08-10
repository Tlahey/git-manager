import { useState, useMemo } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { BookOpen, X, RefreshCw, FileText, Code, Eye } from 'lucide-react'
import { Button, GithubIcon, GitlabIcon, Tooltip } from '@git-manager/ui'
import { Markdown } from '../../../components/Markdown'
import { useRepoReadme } from '../hooks/useRepoReadme'
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
    <div
      data-testid="readme-panel"
      className="flex h-full w-full min-w-0 flex-col border-l border-border bg-card shadow-2xl"
    >
      {/* Pane Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-muted/10 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <BookOpen className="h-4 w-4 shrink-0 text-primary" />
          <span className="truncate text-xs font-semibold text-foreground">{name}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Tooltip
            content={
              showRaw ? t('dashboard:readme.toggleRendered') : t('dashboard:readme.toggleSource')
            }
          >
            <Button
              variant="ghost"
              size="sm"
              className="flex h-7 items-center gap-1 px-2 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              onClick={() => setShowRaw(!showRaw)}
              aria-label={
                showRaw ? t('dashboard:readme.toggleRendered') : t('dashboard:readme.toggleSource')
              }
              data-testid="readme-toggle-mode"
            >
              {showRaw ? <Eye className="h-3.5 w-3.5" /> : <Code className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">
                {showRaw ? t('dashboard:readme.viewRendered') : t('dashboard:readme.viewSource')}
              </span>
            </Button>
          </Tooltip>
          {remoteUrl && (
            <Tooltip content={t('commitDetails.openRemote', { ns: 'git' })}>
              <Button
                variant="ghost"
                size="sm"
                className="flex h-7 items-center gap-1.5 px-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                onClick={() => apiOpenUrl(remoteUrl)}
                aria-label={t('commitDetails.openRemote', { ns: 'git' })}
                data-testid="github-repo-button"
              >
                {remoteUrl.includes('gitlab.com') ? (
                  <GitlabIcon className="h-3.5 w-3.5 text-muted-foreground" />
                ) : (
                  <GithubIcon className="h-3.5 w-3.5 text-muted-foreground" />
                )}
                {/* Proper nouns, intentionally untranslated. */}
                <span className="hidden text-[11px] font-medium sm:inline">
                  {remoteUrl.includes('gitlab.com') ? 'GitLab' : 'GitHub'}
                </span>
              </Button>
            </Tooltip>
          )}
          <Tooltip content={t('git:actions.close')}>
            <Button
              variant="ghost"
              size="iconSm"
              onClick={onClose}
              aria-label={t('git:actions.close')}
              data-testid="readme-panel-close-button"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </Tooltip>
        </div>
      </div>

      {/* Pane content */}
      <div className="flex-1 overflow-y-auto bg-card/10 p-5 select-text">
        {loading ? (
          <div className="flex h-full flex-col items-center justify-center space-y-2 py-8">
            <RefreshCw className="h-6 w-6 animate-spin text-primary" />
            <p className="text-xs text-muted-foreground">{t('dashboard.loadingReadme')}</p>
          </div>
        ) : error || content === undefined ? (
          <div className="flex h-full flex-col items-center justify-center p-4 text-center text-muted-foreground/60">
            <FileText className="mb-2 h-10 w-10 text-muted-foreground opacity-20" />
            <p className="font-sans text-xs">{t('dashboard.noReadme')}</p>
          </div>
        ) : showRaw ? (
          <pre
            className="rounded border border-border/40 bg-muted/20 p-2 font-mono text-xs leading-relaxed whitespace-pre-wrap text-foreground select-text"
            data-testid="readme-raw-content"
          >
            {content}
          </pre>
        ) : (
          <div data-testid="readme-rendered-content">
            <Markdown content={content} repoPath={path} />
          </div>
        )}
      </div>
    </div>
  )
}
