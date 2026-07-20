import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Button, Input, Spinner, Textarea, NativeSelect } from '@git-manager/ui'
import { Sparkles, GitBranch as GitBranchIcon } from 'lucide-react'
import { usePrTemplate } from '../../../hooks/usePrTemplate'
import { usePrDescriptionGeneration } from '../../../hooks/usePrDescriptionGeneration'
import { useAiEnabled } from '../../../hooks/useAiEnabled'
import { PrBaseBranchDialog } from './PrBaseBranchDialog'

interface PrComposerExpanderProps {
  repoPath: string
  defaultTitle: string
  defaultBaseRef: string | null
  isSubmitting: boolean
  /** Error from the last publish attempt (push/create PR), shown inline so it isn't silently lost. */
  error?: string | null
  onCreate: (input: { title: string; body: string; baseRef: string }) => void
  onCancel: () => void
}

/** Inline composer shown after the commit is made: title, base branch (with override), and the PR
 * description — pre-filled from the repo's PR template and optionally written by the local AI. Not a
 * modal, per the no-overlay intent for PR content. */
export function PrComposerExpander({
  repoPath,
  defaultTitle,
  defaultBaseRef,
  isSubmitting,
  error,
  onCreate,
  onCancel,
}: PrComposerExpanderProps) {
  const { t } = useTranslation('git')
  const aiEnabled = useAiEnabled()
  const { template } = usePrTemplate(repoPath)
  const { generate, status } = usePrDescriptionGeneration(repoPath)

  const [title, setTitle] = useState(defaultTitle)
  const [body, setBody] = useState('')
  const [baseRef, setBaseRef] = useState(defaultBaseRef ?? '')
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null)
  const [baseDialogOpen, setBaseDialogOpen] = useState(false)
  const [bodyTouched, setBodyTouched] = useState(false)

  // Keep the base ref in sync once the flow resolves the default (async for feature branches).
  useEffect(() => {
    if (defaultBaseRef && !baseRef) setBaseRef(defaultBaseRef)
  }, [defaultBaseRef, baseRef])

  // The currently active template content (single file, or the chosen option of a multi-template).
  const templateContent = useMemo<string | null>(() => {
    if (!template) return null
    if (template.kind === 'single') return template.content
    if (template.kind === 'multiple') {
      const chosen =
        template.options.find((o) => o.name === selectedTemplate) ?? template.options[0]
      return chosen?.content ?? null
    }
    return null
  }, [template, selectedTemplate])

  // Pre-fill the (untouched) body from the template once it's known.
  useEffect(() => {
    if (!bodyTouched && templateContent) setBody(templateContent)
  }, [templateContent, bodyTouched])

  const isGenerating = status === 'connecting' || status === 'streaming'

  async function aiFill() {
    if (!baseRef) return
    if (body.trim() && !window.confirm(t('pr.publish.aiOverwriteConfirm'))) return
    setBody('')
    setBodyTouched(true)
    await generate(
      baseRef,
      templateContent,
      (token) => setBody((b) => b + token),
      (full) => setBody(full)
    )
  }

  return (
    <div data-testid="pr-composer" className="space-y-2 border-t border-border pt-2">
      <label className="block space-y-1 text-[11px] text-muted-foreground">
        {t('pr.publish.titleLabel')}
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('pr.publish.titlePlaceholder')}
          className="h-8 text-xs"
          data-testid="pr-composer-title"
        />
      </label>

      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <GitBranchIcon className="h-3.5 w-3.5" />
        <span>{t('pr.publish.baseLabel')}:</span>
        <span className="font-mono text-foreground" data-testid="pr-composer-base">
          {baseRef || '—'}
        </span>
        <button
          onClick={() => setBaseDialogOpen(true)}
          className="ml-1 rounded px-1 py-0.5 text-primary hover:bg-accent"
          data-testid="pr-composer-change-base"
          title={t('pr.publish.changeBase')}
        >
          {t('pr.publish.changeBase')}
        </button>
      </div>

      {template?.kind === 'multiple' && (
        <label className="block space-y-1 text-[11px] text-muted-foreground">
          {t('pr.publish.templateLabel')}
          <NativeSelect
            value={selectedTemplate ?? template.options[0]?.name}
            onChange={(e) => {
              setSelectedTemplate(e.target.value)
              setBodyTouched(false)
            }}
            data-testid="pr-composer-template-select"
            className="block w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs"
          >
            {template.options.map((o) => (
              <option key={o.name} value={o.name}>
                {o.name}
              </option>
            ))}
          </NativeSelect>
        </label>
      )}

      <div className="space-y-1">
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>{t('pr.publish.descriptionLabel')}</span>
          {aiEnabled && (
            <button
              onClick={aiFill}
              disabled={isGenerating || !baseRef}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-primary hover:bg-accent disabled:opacity-50"
              data-testid="pr-composer-ai-fill"
            >
              {isGenerating ? <Spinner className="h-3 w-3" /> : <Sparkles className="h-3 w-3" />}
              {isGenerating ? t('pr.publish.aiFilling') : t('pr.publish.aiFill')}
            </button>
          )}
        </div>
        <Textarea
          value={body}
          onChange={(e) => {
            setBody(e.target.value)
            setBodyTouched(true)
          }}
          placeholder={t('pr.publish.descriptionPlaceholder')}
          rows={6}
          className="text-xs"
          data-testid="pr-composer-body"
        />
      </div>

      {error && (
        <p data-testid="pr-composer-error" className="text-[11px] text-destructive">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={onCancel} disabled={isSubmitting}>
          {t('pr.publish.cancel')}
        </Button>
        <Button
          size="sm"
          className="h-8 gap-1.5 text-xs"
          disabled={!title.trim() || !baseRef || isSubmitting}
          onClick={() => onCreate({ title: title.trim(), body, baseRef })}
          data-testid="pr-composer-create"
        >
          {isSubmitting && <Spinner className="h-3 w-3" />}
          {isSubmitting ? t('pr.publish.creating') : t('pr.publish.create')}
        </Button>
      </div>

      <PrBaseBranchDialog
        repoPath={repoPath}
        open={baseDialogOpen}
        currentBase={baseRef}
        onSelect={setBaseRef}
        onClose={() => setBaseDialogOpen(false)}
      />
    </div>
  )
}
