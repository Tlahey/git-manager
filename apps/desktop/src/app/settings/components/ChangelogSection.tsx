import { useEffect, useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { ScrollText } from 'lucide-react'
import { Card } from '@git-manager/ui'
import { getAppChangelog } from '../../../lib/changelog'
import { apiGetAppVersion } from '../../../api/updater.api'
import { apiOpenUrl } from '../../../api/shell.api'

const CHANGELOG_ENTRIES = getAppChangelog()

// Matches GitHub's own "generate release notes" bullet format: "<title> by @<user> in <PR url>".
const PR_BULLET = /^(.*?)\s+by\s+(@\S+)\s+in\s+(https:\/\/\S+)$/
const URL_PATTERN = /(https?:\/\/\S+)/g

/** Renders one changelog bullet, turning a trailing GitHub "by @user in <url>" into a compact
 *  clickable PR reference, or linkifying any other bare URL found in the text. */
function ChangelogItemText({ item }: { item: string }) {
  const prMatch = item.match(PR_BULLET)
  if (prMatch) {
    const [, title, author, url] = prMatch
    const prNumberMatch = url.match(/\/pull\/(\d+)$/)
    const label = prNumberMatch ? `#${prNumberMatch[1]}` : url
    return (
      <>
        {title} <span className="text-muted-foreground/70">{author}</span>{' '}
        <button
          type="button"
          onClick={() => apiOpenUrl(url)}
          className="text-primary hover:underline"
        >
          {label}
        </button>
      </>
    )
  }

  // A capturing-group split interleaves matches at odd indices: [text, url, text, url, ...].
  const parts = item.split(URL_PATTERN)
  return (
    <>
      {parts.map((part, idx) =>
        idx % 2 === 1 ? (
          <button
            key={idx}
            type="button"
            onClick={() => apiOpenUrl(part)}
            className="text-primary hover:underline"
          >
            {part}
          </button>
        ) : (
          part
        )
      )}
    </>
  )
}

/** Settings → Changelog: renders the repo's root CHANGELOG.md (bundled at build time, see
 *  lib/changelog.ts), newest entry first, highlighting whichever version is currently running. */
export function ChangelogSection() {
  const { t } = useTranslation('settings')
  const [currentVersion, setCurrentVersion] = useState<string | null>(null)

  useEffect(() => {
    apiGetAppVersion()
      .then(setCurrentVersion)
      .catch(() => {
        // Not running inside Tauri (e.g. component preview) — leave version unset.
      })
  }, [])

  return (
    <div className="space-y-6" data-testid="changelog-settings-section">
      <div className="space-y-1">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <ScrollText className="h-4 w-4 text-primary" />
          {t('settings.changelog.title')}
        </h3>
        {currentVersion && (
          <p className="text-[11px] text-muted-foreground">
            {t('settings.update.currentVersion', { version: currentVersion })}
          </p>
        )}
      </div>

      <div className="h-px bg-border" />

      <div className="space-y-5">
        {CHANGELOG_ENTRIES.map((entry) => (
          <Card
            key={entry.version}
            data-testid={`changelog-entry-${entry.version}`}
            className="space-y-3 bg-card/25 p-4 shadow-sm"
          >
            <div className="flex items-center gap-2">
              <h4 className="font-mono text-xs font-semibold text-foreground">
                {entry.version === 'Unreleased'
                  ? t('settings.changelog.unreleased')
                  : entry.version}
              </h4>
              {entry.date && (
                <span className="text-[10px] text-muted-foreground">{entry.date}</span>
              )}
              {currentVersion === entry.version && (
                <span
                  data-testid="changelog-current-badge"
                  className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary"
                >
                  {t('settings.changelog.current')}
                </span>
              )}
            </div>

            {entry.sections.map((section, idx) => (
              <div key={idx} className="space-y-1">
                {section.heading && (
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {section.heading}
                  </p>
                )}
                <ul className="list-disc space-y-0.5 pl-4 text-[11px] text-foreground/80">
                  {section.items.map((item) => (
                    <li key={item}>
                      <ChangelogItemText item={item} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </Card>
        ))}
      </div>
    </div>
  )
}
