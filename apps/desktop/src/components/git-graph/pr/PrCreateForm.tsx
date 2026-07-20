import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Button, Checkbox, Input, Spinner, Textarea, NativeSelect } from '@git-manager/ui'
import { Sparkles, ArrowRight } from 'lucide-react'
import { useBranches } from '../../../hooks/useBranches'
import { usePrTemplate } from '../../../hooks/usePrTemplate'
import { usePrDescriptionGeneration } from '../../../hooks/usePrDescriptionGeneration'
import { useAiEnabled } from '../../../hooks/useAiEnabled'
import type { CreatePrArgs } from '../../../hooks/usePrCreateFlow'

interface PrCreateFormProps {
  repoPath: string
  /** Current branch — the default head (source). */
  currentBranch: string | null
  /** GitHub default branch — the default base (target). Resolves async. */
  defaultBase: string | null
  isSubmitting: boolean
  /** Error from the last create attempt (checkout/push/create PR), shown inline. */
  error?: string | null
  onCreate: (input: CreatePrArgs) => void
  onCancel: () => void
}

/** Standalone create-PR form opened from the sidebar: pick head + base branch, write a title and a
 * (template-/AI-fillable) description, optionally open as draft, then create the GitHub PR. Modeled
 * on {@link PrComposerExpander}, adding the head-branch selector the composer doesn't need. */
export function PrCreateForm({
  repoPath,
  currentBranch,
  defaultBase,
  isSubmitting,
  error,
  onCreate,
  onCancel,
}: PrCreateFormProps) {
  const { t } = useTranslation('git')
  const aiEnabled = useAiEnabled()
  const { data: branches = [] } = useBranches(repoPath)
  const { template } = usePrTemplate(repoPath)
  const { generate, status } = usePrDescriptionGeneration(repoPath)

  const localBranches = useMemo(() => branches.filter((b) => !b.isRemote), [branches])

  const [head, setHead] = useState(currentBranch ?? '')
  const [base, setBase] = useState(defaultBase ?? '')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [draft, setDraft] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null)
  const [bodyTouched, setBodyTouched] = useState(false)

  // Keep head/base in sync once their async defaults resolve (only while still unset).
  useEffect(() => {
    if (currentBranch && !head) setHead(currentBranch)
  }, [currentBranch, head])
  useEffect(() => {
    if (defaultBase && !base) setBase(defaultBase)
  }, [defaultBase, base])

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
    if (!base) return
    if (body.trim() && !window.confirm(t('pr.publish.aiOverwriteConfirm'))) return
    setBody('')
    setBodyTouched(true)
    await generate(
      base,
      templateContent,
      (token) => setBody((b) => b + token),
      (full) => setBody(full)
    )
  }

  const canSubmit = Boolean(title.trim()) && Boolean(head) && Boolean(base) && !isSubmitting

  return (
    <div data-testid="pr-create" className="space-y-4">
      {/* Branch selection: head → base */}
      <div className="flex items-end gap-2">
        <label className="block flex-1 space-y-1 text-[11px] text-muted-foreground">
          {t('pr.create.headLabel')}
          <NativeSelect
            value={head}
            onChange={(e) => setHead(e.target.value)}
            data-testid="pr-create-head"
            className="block w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs text-foreground"
          >
            {localBranches.map((b) => (
              <option key={b.name} value={b.shortName}>
                {b.shortName}
              </option>
            ))}
          </NativeSelect>
        </label>
        <ArrowRight className="mb-2 h-4 w-4 shrink-0 text-muted-foreground" />
        <label className="block flex-1 space-y-1 text-[11px] text-muted-foreground">
          {t('pr.create.baseLabel')}
          <NativeSelect
            value={base}
            onChange={(e) => setBase(e.target.value)}
            data-testid="pr-create-base"
            className="block w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs text-foreground"
          >
            {localBranches.map((b) => (
              <option key={b.name} value={b.shortName}>
                {b.shortName}
              </option>
            ))}
          </NativeSelect>
        </label>
      </div>

      <label className="block space-y-1 text-[11px] text-muted-foreground">
        {t('pr.publish.titleLabel')}
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('pr.publish.titlePlaceholder')}
          className="h-8 text-xs"
          data-testid="pr-create-title"
        />
      </label>

      {template?.kind === 'multiple' && (
        <label className="block space-y-1 text-[11px] text-muted-foreground">
          {t('pr.publish.templateLabel')}
          <NativeSelect
            value={selectedTemplate ?? template.options[0]?.name}
            onChange={(e) => {
              setSelectedTemplate(e.target.value)
              setBodyTouched(false)
            }}
            data-testid="pr-create-template-select"
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
              disabled={isGenerating || !base}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-primary hover:bg-accent disabled:opacity-50"
              data-testid="pr-create-ai"
            >
              {isGenerating ? <Spinner className="h-3 w-3" /> : <Sparkles className="h-3 w-3" />}
              {isGenerating ? t('pr.publish.aiFilling') : t('pr.create.aiGenerate')}
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
          rows={8}
          className="text-xs"
          data-testid="pr-create-body"
        />
      </div>

      <label className="flex items-center gap-2 text-xs text-foreground">
        <Checkbox
          checked={draft}
          onChange={(e) => setDraft(e.target.checked)}
          data-testid="pr-create-draft"
        />
        {t('pr.create.draftLabel')}
      </label>

      {error && (
        <p data-testid="pr-create-error" className="text-[11px] text-destructive">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs"
          onClick={onCancel}
          disabled={isSubmitting}
          data-testid="pr-create-cancel"
        >
          {t('pr.publish.cancel')}
        </Button>
        <Button
          size="sm"
          className="h-8 gap-1.5 text-xs"
          disabled={!canSubmit}
          onClick={() => onCreate({ head, base, title: title.trim(), body, draft })}
          data-testid="pr-create-submit"
        >
          {isSubmitting && <Spinner className="h-3 w-3" />}
          {isSubmitting ? t('pr.publish.creating') : t('pr.create.submit')}
        </Button>
      </div>
    </div>
  )
}
