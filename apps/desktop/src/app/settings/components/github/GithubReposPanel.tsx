import { AlertCircle, ExternalLink, Lock, RefreshCw, Unlock } from 'lucide-react'
import { ScrollArea } from '@git-manager/ui'
import { useTranslation } from '@git-manager/i18n'
import type { GitHubAccount } from '@git-manager/git-types'
import type { GitHubRepoInfo } from '../../../../lib/tauri'

interface GithubReposPanelProps {
  /** The account whose repositories are listed, or `null` when none is selected. */
  account: GitHubAccount | null
  repos: GitHubRepoInfo[]
  isLoading: boolean
}

/**
 * The right half of the GitHub settings: the active account's repositories.
 *
 * Four states, and the order they are checked in is the point — loading wins over "no account",
 * because a fetch in flight means an account was selected a moment ago and saying otherwise would
 * flicker. "No account" then wins over "no repositories", because a user with nothing connected has
 * not been told their account is empty; they have been told nothing at all.
 */
export function GithubReposPanel({ account, repos, isLoading }: GithubReposPanelProps) {
  const { t, i18n } = useTranslation('settings')

  return (
    <div className="flex h-full flex-1 flex-col bg-background">
      <div className="flex shrink-0 items-center justify-between border-b border-border p-6 pb-4">
        <div className="space-y-1">
          <h4 className="text-sm font-semibold text-foreground">
            {t('settings.github.reposTitle')}
          </h4>
          {account && (
            <p className="text-xs text-muted-foreground">
              {t('settings.github.connectedAs', { login: account.user.login })}
            </p>
          )}
        </div>
        {account && (
          <span className="rounded border border-border/40 bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            {t('settings.github.repoCount', { count: repos.length })}
          </span>
        )}
      </div>

      <div className="min-h-0 flex-1">
        {isLoading ? (
          <div className="flex h-full flex-col items-center justify-center space-y-2 py-8">
            <RefreshCw className="h-6 w-6 animate-spin text-primary" />
            <p className="text-xs text-muted-foreground">{t('settings.github.loadingRepos')}</p>
          </div>
        ) : !account ? (
          <div className="flex h-full flex-col items-center justify-center p-8 text-center text-muted-foreground">
            <AlertCircle className="mb-2 h-8 w-8 text-muted-foreground opacity-40" />
            <p className="max-w-xs text-xs leading-relaxed">
              {t('settings.github.pickAccountForRepos')}
            </p>
          </div>
        ) : repos.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center p-8 text-center text-muted-foreground">
            <p className="text-xs">{t('settings.github.noRepos')}</p>
          </div>
        ) : (
          <ScrollArea className="h-full">
            <div className="divide-y divide-border px-6">
              {repos.map((repo) => (
                <div
                  key={repo.id}
                  className="-mx-2 flex items-start justify-between rounded px-2 py-4 transition-colors hover:bg-accent/10"
                >
                  <div className="min-w-0 space-y-1 pr-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="max-w-[240px] truncate text-xs font-medium text-foreground"
                        title={repo.name}
                      >
                        {repo.name}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] leading-none font-medium ${
                          repo.private
                            ? 'bg-amber-500/10 text-amber-500 ring-1 ring-amber-500/20'
                            : 'bg-green-500/10 text-green-500 ring-1 ring-green-500/20'
                        }`}
                      >
                        {repo.private ? (
                          <Lock className="h-2.5 w-2.5" />
                        ) : (
                          <Unlock className="h-2.5 w-2.5" />
                        )}
                        {repo.private
                          ? t('settings.github.repoPrivate')
                          : t('settings.github.repoPublic')}
                      </span>
                    </div>
                    {repo.description && (
                      <p className="line-clamp-2 text-[10px] leading-relaxed text-muted-foreground">
                        {repo.description}
                      </p>
                    )}
                    <p className="font-mono text-[9px] text-muted-foreground/60">
                      {t('settings.github.repoUpdated', {
                        date: new Date(repo.updatedAt).toLocaleDateString(i18n.language),
                      })}
                    </p>
                  </div>

                  <a
                    href={repo.htmlUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    title={t('settings.github.openOnGitHub')}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  )
}
