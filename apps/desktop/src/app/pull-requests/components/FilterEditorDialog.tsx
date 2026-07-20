import { useState } from 'react'
import { Sliders, CheckCircle2, Save } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, NativeSelect } from '@git-manager/ui'
import type { SavedFilter, FilterType, FilterStatus } from '../../../stores/launchpad.store'

const ALL_STATUSES: FilterStatus[] = [
  'open',
  'draft',
  'approved',
  'changes_requested',
  'merged',
  'closed',
]
const EMOJI_OPTIONS = [
  '👀',
  '🐛',
  '✨',
  '🚀',
  '🔥',
  '🔒',
  '⚡',
  '📦',
  '🎯',
  '🛠',
  '📋',
  '🧪',
  '💡',
  '🔍',
  '⭐',
]

const STATUS_CONFIG: Record<FilterStatus, { label: string; className: string }> = {
  open: { label: 'Open', className: 'bg-green-500/15 text-green-400 border-green-500/30' },
  draft: { label: 'Draft', className: 'bg-muted text-muted-foreground border-border' },
  approved: {
    label: 'Approved',
    className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  },
  changes_requested: {
    label: 'Changes',
    className: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  },
  merged: { label: 'Merged', className: 'bg-purple-500/15 text-purple-400 border-purple-500/30' },
  closed: {
    label: 'Closed',
    className: 'bg-destructive/15 text-destructive border-destructive/30',
  },
}

export type FilterDraft = Omit<SavedFilter, 'id' | 'createdAt'>

interface FilterEditorDialogProps {
  initial?: FilterDraft
  onSave: (f: FilterDraft) => void
  onClose: () => void
}

export function FilterEditorDialog({ initial, onSave, onClose }: FilterEditorDialogProps) {
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
            {initial ? 'Edit filter' : 'New custom filter'}
          </DialogTitle>
        </DialogHeader>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto p-5">
          {/* Name + emoji */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Filter name
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                placeholder="e.g. My bugfixes"
                className="h-8 w-full rounded-md border border-border bg-background px-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Emoji
              </label>
              <div className="relative">
                <NativeSelect
                  value={form.emoji}
                  onChange={(e) => set('emoji', e.target.value)}
                  className="h-8 appearance-none rounded-md border border-border bg-background px-2 pr-6 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
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
            <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Applies to
            </label>
            <div className="flex gap-2">
              {(
                [
                  ['prs', 'Pull Requests'],
                  ['issues', 'Issues'],
                  ['both', 'Both'],
                ] as [FilterType, string][]
              ).map(([v, lbl]) => (
                <button
                  key={v}
                  onClick={() => set('type', v)}
                  className={`h-8 flex-1 rounded-md border text-xs transition-colors ${
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
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Filter criteria{' '}
              <span className="font-normal normal-case">
                (all active criteria are combined with AND)
              </span>
            </p>
            <div className="space-y-3">
              {/* Title contains */}
              <div className="flex items-center gap-3">
                <label className="w-32 shrink-0 text-xs text-muted-foreground">
                  Title contains
                </label>
                <input
                  type="text"
                  value={form.titleContains ?? ''}
                  onChange={(e) => set('titleContains', e.target.value)}
                  placeholder="e.g. bug, feat, hotfix…"
                  className="h-7 flex-1 rounded-md border border-border bg-background px-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                />
              </div>
              {/* Author contains */}
              <div className="flex items-center gap-3">
                <label className="w-32 shrink-0 text-xs text-muted-foreground">
                  Author contains
                </label>
                <input
                  type="text"
                  value={form.authorContains ?? ''}
                  onChange={(e) => set('authorContains', e.target.value)}
                  placeholder="e.g. antoine"
                  className="h-7 flex-1 rounded-md border border-border bg-background px-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                />
              </div>
              {/* Repo */}
              <div className="flex items-center gap-3">
                <label className="w-32 shrink-0 text-xs text-muted-foreground">Repository</label>
                <input
                  type="text"
                  value={form.repo ?? ''}
                  onChange={(e) => set('repo', e.target.value)}
                  placeholder="e.g. git-manager (exact)"
                  className="h-7 flex-1 rounded-md border border-border bg-background px-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                />
              </div>
              {/* Label contains */}
              <div className="flex items-center gap-3">
                <label className="w-32 shrink-0 text-xs text-muted-foreground">
                  Label contains
                </label>
                <input
                  type="text"
                  value={form.labelContains ?? ''}
                  onChange={(e) => set('labelContains', e.target.value)}
                  placeholder="e.g. bug, enhancement…"
                  className="h-7 flex-1 rounded-md border border-border bg-background px-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                />
              </div>

              {/* Status — PRs only */}
              {(form.type === 'prs' || form.type === 'both') && (
                <div className="flex items-start gap-3">
                  <label className="w-32 shrink-0 pt-1 text-xs text-muted-foreground">
                    PR status
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {ALL_STATUSES.map((s) => {
                      const active = (form.statuses ?? []).includes(s)
                      const cfg = STATUS_CONFIG[s]
                      return (
                        <button
                          key={s}
                          onClick={() => toggleStatus(s)}
                          className={`flex items-center rounded border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide transition-colors ${
                            active
                              ? cfg.className + ' ring-1 ring-current ring-offset-0'
                              : 'border-border text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {active && <CheckCircle2 className="mr-1 h-2.5 w-2.5" />}
                          {cfg.label}
                        </button>
                      )
                    })}
                    {(form.statuses ?? []).length > 0 && (
                      <button
                        onClick={() => set('statuses', [])}
                        className="text-[9px] text-muted-foreground/60 underline hover:text-muted-foreground"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Needs my review — PRs only */}
              {(form.type === 'prs' || form.type === 'both') && (
                <div className="flex items-center gap-3">
                  <label className="w-32 shrink-0 text-xs text-muted-foreground">
                    Needs my review
                  </label>
                  <div className="flex gap-2">
                    {(
                      [
                        ['yes', true],
                        ['no', false],
                        ['any', undefined],
                      ] as [string, boolean | undefined][]
                    ).map(([lbl, val]) => (
                      <button
                        key={lbl}
                        onClick={() => set('needsMyReview', val)}
                        className={`h-6 rounded border px-3 text-[10px] capitalize transition-colors ${
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
            className="h-8 rounded-lg border border-border px-3 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!isValid}
            className="flex h-8 items-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
          >
            <Save className="h-3 w-3" /> {initial ? 'Save changes' : 'Create filter'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
