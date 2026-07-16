import { useTranslation } from '@git-manager/i18n'
import { Button } from '@git-manager/ui'
import { Heart } from 'lucide-react'
import { apiOpenUrl } from '../../../api/shell.api'

const SPONSORS_URL = 'https://github.com/sponsors/Tlahey'

/** Settings → Support: a simple entry point to sponsor the app's development on GitHub Sponsors. */
export function SupportSection() {
  const { t } = useTranslation('settings')

  return (
    <div className="space-y-6" data-testid="support-settings-section">
      <div className="space-y-1">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Heart className="h-4 w-4 text-red-500" />
          {t('settings.support.title')}
        </h3>
        <p className="text-[11px] text-muted-foreground">{t('settings.support.description')}</p>
      </div>

      <div className="h-px bg-border" />

      <div className="space-y-3 rounded-lg border border-border bg-card/25 p-4 shadow-sm">
        <p className="text-xs text-muted-foreground">{t('settings.support.hint')}</p>
        <Button
          size="sm"
          className="h-8 gap-1.5 text-xs"
          data-testid="support-sponsor-button"
          onClick={() => apiOpenUrl(SPONSORS_URL)}
        >
          <Heart className="h-3.5 w-3.5" />
          {t('settings.support.sponsorButton')}
        </Button>
      </div>
    </div>
  )
}
