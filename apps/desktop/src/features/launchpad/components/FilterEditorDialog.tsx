import { useState } from 'react'
import { Sliders, CheckCircle2, Save } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  NativeSelect,
  Input,
} from '@git-manager/ui'
import { useTranslation } from '@git-manager/i18n'
import {
  ALL_STATUSES,
  EMOJI_OPTIONS,
  STATUS_CONFIG,
  TEXT_CRITERIA,
} from '../lib/filterEditor.config'
import type { SavedFilter, FilterType, FilterStatus } from '../stores/launchpad.store'

export type FilterDraft = Omit<SavedFilter, 'id' | 'createdAt'>

/** One criterion row: a fixed-width label and the field it names. Four of these were written out
 * verbatim, which is four chances for one of them to drift out of alignment with the others. */
function CriterionField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string
  value: string
  placeholder: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex items-center gap-3">
      <label className="w-32 shrink-0 text-xs text-muted-foreground">{label}</label>
      <Input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-7 flex-1 rounded-md border border-border bg-background px-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:ring-1 focus:ring-primary/40 focus:outline-hidden"
      />
    </div>
  )
}

interface FilterEditorDialogProps {
  initial?: FilterDraft
  onSave: (f: FilterDraft) => void
  onClose: () => void
}

export function FilterEditorDialog({ initial, onSave, onClose }: FilterEditorDialogProps) {
  const { t } = useTranslation('launchpad')
  const [form, setForm] = useState<FilterDraft>(
    initial ?? {
      name: '',
      emoji: '🔍',
      type: 'both',
      titleContains: '',
      authorContains: '',
      repo: '',
      labelContains: '',
      statuses: [],
      needsMyReview: undefined,
    }
  )

  function set<K extends keyof FilterDraft>(key: K, val: FilterDraft[K]) {
    setForm((f) => ({ ...f, [key]: val }))
  }

  function toggleStatus(s: FilterStatus) {
    const cur = form.statuses ?? []
    set('statuses', cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s])
  }

  const isValid = form.name.trim().length > 0
  function handleSave() {
    if (isValid) {
      onSave({ ...form, name: form.name.trim() })
      onClose()
    }
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="w-[520px] max-w-[520px] gap-0 overflow-hidden p-0">
        {/* Header */}
        <DialogHeader className="space-y-0 border-b border-border bg-muted/10 px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Sliders className="h-4 w-4 text-primary" />
            {initial ? t('filterEditor.editTitle') : t('filterEditor.newTitle')}
          </DialogTitle>
        </DialogHeader>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto p-5">
          {/* Name + emoji */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="mb-1.5 block text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                {t('filterEditor.nameLabel')}
              </label>
              <Input
                type="text"
                value={form.name}
                data-testid="filter-editor-name-input"
                onChange={(e) => set('name', e.target.value)}
                placeholder={t('filterEditor.namePlaceholder')}
                className="h-8 w-full rounded-md border border-border bg-background px-3 text-xs text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/40 focus:outline-hidden"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                {t('filterEditor.emoji')}
              </label>
              <div className="relative">
                <NativeSelect
                  value={form.emoji}
                  onChange={(e) => set('emoji', e.target.value)}
                  className="h-8 appearance-none rounded-md border border-border bg-background px-2 pr-6 text-sm text-foreground focus:ring-2 focus:ring-primary/40 focus:outline-hidden"
                  style={{ minWidth: 60 }}
                >
                  {EMOJI_OPTIONS.map((e) => (
                    <option key={e} value={e}>
                      {e}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            </div>
          </div>

          {/* Type */}
          <div>
            <label className="mb-1.5 block text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
              {t('filterEditor.appliesTo')}
            </label>
            <div className="flex gap-2">
              {(
                [
                  ['prs', t('filterEditor.typePrs')],
                  ['issues', t('filterEditor.typeIssues')],
                  ['both', t('filterEditor.typeBoth')],
                ] as [FilterType, string][]
              ).map(([v, lbl]) => (
                <button
                  key={v}
                  onClick={() => set('type', v)}
                  className={`h-8 flex-1 cursor-pointer rounded-md border text-xs transition-colors ${
                    form.type === v
                      ? 'border-primary/30 bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:border-border/80 hover:text-foreground'
                  }`}
                >
                  {lbl}
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-border/40 pt-3">
            <p className="mb-3 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
              {t('filterEditor.criteria')}{' '}
              <span className="font-normal normal-case">{t('filterEditor.criteriaHint')}</span>
            </p>
            <div className="space-y-3">
              {TEXT_CRITERIA.map((criterion) => (
                <CriterionField
                  key={criterion.key}
                  label={t(criterion.labelKey)}
                  value={form[criterion.key] ?? ''}
                  placeholder={t(criterion.placeholderKey)}
                  onChange={(v) => set(criterion.key, v)}
                />
              ))}

              {/* Status — PRs only */}
              {(form.type === 'prs' || form.type === 'both') && (
                <div className="flex items-start gap-3">
                  <label className="w-32 shrink-0 pt-1 text-xs text-muted-foreground">
                    {t('filterEditor.prStatus')}
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {ALL_STATUSES.map((s) => {
                      const active = (form.statuses ?? []).includes(s)
                      const cfg = STATUS_CONFIG[s]
                      return (
                        <button
                          key={s}
                          onClick={() => toggleStatus(s)}
                          className={`flex cursor-pointer items-center rounded border px-2 py-0.5 text-[9px] font-semibold tracking-wide uppercase transition-colors ${
                            active
                              ? cfg.className + ' ring-1 ring-current ring-offset-0'
                              : 'border-border text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {active && <CheckCircle2 className="mr-1 h-2.5 w-2.5" />}
                          {t(cfg.labelKey)}
                        </button>
                      )
                    })}
                    {(form.statuses ?? []).length > 0 && (
                      <button
                        onClick={() => set('statuses', [])}
                        className="cursor-pointer text-[9px] text-muted-foreground/60 underline hover:text-muted-foreground"
                      >
                        {t('filterEditor.clear')}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Needs my review — PRs only */}
              {(form.type === 'prs' || form.type === 'both') && (
                <div className="flex items-center gap-3">
                  <label className="w-32 shrink-0 text-xs text-muted-foreground">
                    {t('filterEditor.needsMyReview')}
                  </label>
                  <div className="flex gap-2">
                    {(
                      [
                        [t('filterEditor.yes'), true, 'yes'],
                        [t('filterEditor.no'), false, 'no'],
                        [t('filterEditor.any'), undefined, 'any'],
                      ] as [string, boolean | undefined, string][]
                    ).map(([lbl, val, key]) => (
                      <button
                        key={lbl}
                        onClick={() => set('needsMyReview', val)}
                        data-testid={`filter-editor-needs-review-${key}`}
                        className={`h-6 cursor-pointer rounded border px-3 text-[10px] capitalize transition-colors ${
                          form.needsMyReview === val
                            ? 'border-primary/30 bg-primary/10 text-primary'
                            : 'border-border text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {lbl}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <DialogFooter className="border-t border-border bg-muted/5 px-5 py-3 sm:justify-end">
          <button
            onClick={onClose}
            className="h-8 cursor-pointer rounded-lg border border-border px-3 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {t('filterEditor.cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={!isValid}
            data-testid="filter-editor-save-button"
            className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-medium text-primary-foreground transition-colors hover:enabled:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Save className="h-3 w-3" />{' '}
            {initial ? t('filterEditor.saveChanges') : t('filterEditor.createFilter')}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
