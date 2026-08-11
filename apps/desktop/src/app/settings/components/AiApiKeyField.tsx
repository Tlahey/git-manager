import { useEffect, useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Button, Input } from '@git-manager/ui'
import { Check, Trash2 } from 'lucide-react'
import {
  apiDeleteCredential,
  apiHasCredential,
  apiStoreCredential,
} from '../../../api/credentials.api'

/**
 * The AI provider's API key — the one settings field whose value the app cannot show back.
 *
 * It lives in the OS keychain, not in `~/.git-manager/settings.json`, and the keychain is
 * deliberately write-only from the webview (see `lib/tauri/credentials.ts`). So this field has no
 * `value` to bind: it can ask *whether* a key is stored, and it can replace or remove one, but it
 * cannot read it back to prefill an input. That is why the shape differs from every other field on
 * the page — a masked input showing the stored key would be a lie, and prefilling one would require
 * exactly the read this arrangement exists to prevent.
 *
 * Writing on blur rather than on every keystroke, because each write is a keychain call: on an
 * unsigned development build macOS may prompt for access, and a prompt per character typed is not a
 * settings field anyone can use.
 */
export function AiApiKeyField() {
  const { t } = useTranslation('settings')
  const [stored, setStored] = useState<boolean | null>(null)
  const [draft, setDraft] = useState('')
  const [justSaved, setJustSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    apiHasCredential('ai')
      .then((has) => {
        if (!cancelled) setStored(has)
      })
      .catch(() => {
        if (!cancelled) setStored(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function save() {
    const value = draft.trim()
    if (!value) return
    setError(null)
    try {
      await apiStoreCredential('ai', value)
      setStored(true)
      setDraft('')
      setJustSaved(true)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function clear() {
    setError(null)
    try {
      await apiDeleteCredential('ai')
      setStored(false)
      setDraft('')
      setJustSaved(false)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="space-y-1.5" data-testid="ai-api-key-field">
      <label className="text-xs font-medium text-foreground">{t('settings.ai.apiKey')}</label>
      <div className="flex items-center gap-2">
        <Input
          type="password"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value)
            setJustSaved(false)
          }}
          onBlur={() => void save()}
          placeholder={
            stored ? t('settings.ai.apiKeyStoredPlaceholder') : t('settings.ai.apiKeyPlaceholder')
          }
          className="h-8 flex-1 text-xs"
          data-testid="ai-api-key-input"
        />
        {stored && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void clear()}
            className="h-8 gap-1.5 px-2 text-xs"
            data-testid="ai-api-key-clear-button"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {t('settings.ai.apiKeyClear')}
          </Button>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground" data-testid="ai-api-key-hint">
        {t('settings.ai.apiKeyHint')}
      </p>
      {stored && (
        <p
          className="flex items-center gap-1 text-[10px] text-muted-foreground"
          data-testid="ai-api-key-stored"
        >
          <Check className="h-3 w-3" />
          {justSaved ? t('settings.ai.apiKeySaved') : t('settings.ai.apiKeyStored')}
        </p>
      )}
      {error && (
        <p className="text-[10px] text-destructive" data-testid="ai-api-key-error">
          {error}
        </p>
      )}
    </div>
  )
}
