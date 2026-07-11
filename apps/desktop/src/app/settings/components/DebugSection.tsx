import { useState } from 'react'
import { Bug, Copy, Check, Trash2 } from 'lucide-react'
import { Button, Separator } from '@git-manager/ui'
import { useDebugLogStore } from '../../../stores/debugLog.store'
import { formatDebugLogText, formatDebugTimestamp } from '../../../lib/formatDebugLog'

/**
 * Settings → Debug: opt-in capture of every Tauri IPC operation (see the `invoke` wrapper in
 * `lib/tauri.ts`). Lets the user reproduce a bug with logging on, then copy/clear the trace to
 * share it. Off by default; nothing is captured or persisted unless the toggle is on.
 */
export function DebugSection() {
  const enabled = useDebugLogStore((s) => s.enabled)
  const entries = useDebugLogStore((s) => s.entries)
  const setEnabled = useDebugLogStore((s) => s.setEnabled)
  const clear = useDebugLogStore((s) => s.clear)

  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(formatDebugLogText(entries))
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard unavailable (denied/insecure context) — nothing else we can do here.
    }
  }

  return (
    <div className="space-y-6" data-testid="debug-section">
      {/* Enable toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bug className={enabled ? 'h-5 w-5 text-primary' : 'h-5 w-5 text-muted-foreground'} />
          <div>
            <h4 className="text-xs font-semibold text-foreground">Journal de débogage (IPC)</h4>
            <p className="text-[10px] text-muted-foreground">
              Enregistre chaque opération envoyée au backend (nom, arguments, durée, erreurs). Local
              et temporaire — rien n&apos;est capturé tant que c&apos;est désactivé.
            </p>
          </div>
        </div>
        <label className="relative inline-flex cursor-pointer items-center">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="peer sr-only"
            data-testid="debug-enable-toggle"
          />
          <div className="peer h-5 w-9 rounded-full bg-muted after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:border after:border-border after:bg-background after:transition-all after:content-[''] peer-checked:bg-primary peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none" />
        </label>
      </div>

      <Separator />

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1 px-2.5 text-[11px]"
          onClick={handleCopy}
          disabled={entries.length === 0}
          data-testid="debug-copy"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copié' : 'Copier tout'}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1 px-2.5 text-[11px]"
          onClick={clear}
          disabled={entries.length === 0}
          data-testid="debug-clear"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Effacer
        </Button>
        <span className="ml-auto text-[10px] text-muted-foreground">
          {entries.length} opération{entries.length > 1 ? 's' : ''}
        </span>
      </div>

      {/* Entries */}
      <div className="rounded border border-border bg-muted/20">
        {entries.length === 0 ? (
          <p className="px-3 py-6 text-center text-[11px] text-muted-foreground">
            {enabled
              ? 'Aucune opération enregistrée pour le moment. Reproduis le problème dans l’application.'
              : 'Active le journal ci-dessus, puis reproduis le problème.'}
          </p>
        ) : (
          <ul className="max-h-[420px] divide-y divide-border/60 overflow-y-auto font-mono text-[10px]">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className="px-3 py-1.5"
                data-testid="debug-entry"
                data-command={entry.command}
              >
                <div className="flex items-baseline gap-2">
                  <span className="shrink-0 text-muted-foreground">{formatDebugTimestamp(entry.timestamp)}</span>
                  <span
                    className={
                      entry.status === 'error'
                        ? 'shrink-0 font-semibold text-destructive'
                        : 'shrink-0 font-semibold text-emerald-500'
                    }
                  >
                    {entry.status}
                  </span>
                  <span className="shrink-0 text-muted-foreground">{entry.durationMs}ms</span>
                  <span className="truncate font-semibold text-foreground">{entry.command}</span>
                </div>
                {entry.args !== undefined && (
                  <div className="truncate pl-1 text-muted-foreground">
                    {typeof entry.args === 'string' ? entry.args : JSON.stringify(entry.args)}
                  </div>
                )}
                {entry.error && <div className="pl-1 text-destructive">↳ {entry.error}</div>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
