import { useState } from 'react'
import { Sliders, X, CheckCircle2, Save } from 'lucide-react'
import type { SavedFilter, FilterType, FilterStatus } from '../../../stores/launchpad.store'

const ALL_STATUSES: FilterStatus[] = ['open', 'draft', 'approved', 'changes_requested', 'merged', 'closed']
const EMOJI_OPTIONS = ['👀','🐛','✨','🚀','🔥','🔒','⚡','📦','🎯','🛠','📋','🧪','💡','🔍','⭐']

const STATUS_CONFIG: Record<FilterStatus, { label: string; className: string }> = {
  open: { label: 'Open', className: 'bg-green-500/15 text-green-400 border-green-500/30' },
  draft: { label: 'Draft', className: 'bg-muted text-muted-foreground border-border' },
  approved: { label: 'Approved', className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  changes_requested: { label: 'Changes', className: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  merged: { label: 'Merged', className: 'bg-purple-500/15 text-purple-400 border-purple-500/30' },
  closed: { label: 'Closed', className: 'bg-destructive/15 text-destructive border-destructive/30' },
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
    <>
      <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[520px] rounded-xl border border-border bg-card shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-muted/10">
          <div className="flex items-center gap-2">
            <Sliders className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">{initial ? 'Edit filter' : 'New custom filter'}</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Name + emoji */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">
                Filter name
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                placeholder="e.g. My bugfixes"
                className="w-full h-8 rounded-md border border-border bg-background px-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">
                Emoji
              </label>
              <div className="relative">
                <select
                  value={form.emoji}
                  onChange={(e) => set('emoji', e.target.value)}
                  className="h-8 rounded-md border border-border bg-background px-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 appearance-none pr-6"
                  style={{ minWidth: 60 }}
                >
                  {EMOJI_OPTIONS.map((e) => (
                    <option key={e} value={e}>
                      {e}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Type */}
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">
              Applies to
            </label>
            <div className="flex gap-2">
              {([
                ['prs', 'Pull Requests'],
                ['issues', 'Issues'],
                ['both', 'Both'],
              ] as [FilterType, string][]).map(([v, lbl]) => (
                <button
                  key={v}
                  onClick={() => set('type', v)}
                  className={`flex-1 h-8 rounded-md border text-xs transition-colors ${
                    form.type === v
                      ? 'bg-primary/10 border-primary/30 text-primary'
                      : 'border-border text-muted-foreground hover:text-foreground hover:border-border/80'
                  }`}
                >
                  {lbl}
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-border/40 pt-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Filter criteria{' '}
              <span className="normal-case font-normal">(all active criteria are combined with AND)</span>
            </p>
            <div className="space-y-3">
              {/* Title contains */}
              <div className="flex items-center gap-3">
                <label className="text-xs text-muted-foreground w-32 shrink-0">Title contains</label>
                <input
                  type="text"
                  value={form.titleContains ?? ''}
                  onChange={(e) => set('titleContains', e.target.value)}
                  placeholder="e.g. bug, feat, hotfix…"
                  className="flex-1 h-7 rounded-md border border-border bg-background px-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                />
              </div>
              {/* Author contains */}
              <div className="flex items-center gap-3">
                <label className="text-xs text-muted-foreground w-32 shrink-0">Author contains</label>
                <input
                  type="text"
                  value={form.authorContains ?? ''}
                  onChange={(e) => set('authorContains', e.target.value)}
                  placeholder="e.g. antoine"
                  className="flex-1 h-7 rounded-md border border-border bg-background px-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                />
              </div>
              {/* Repo */}
              <div className="flex items-center gap-3">
                <label className="text-xs text-muted-foreground w-32 shrink-0">Repository</label>
                <input
                  type="text"
                  value={form.repo ?? ''}
                  onChange={(e) => set('repo', e.target.value)}
                  placeholder="e.g. git-manager (exact)"
                  className="flex-1 h-7 rounded-md border border-border bg-background px-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                />
              </div>
              {/* Label contains */}
              <div className="flex items-center gap-3">
                <label className="text-xs text-muted-foreground w-32 shrink-0">Label contains</label>
                <input
                  type="text"
                  value={form.labelContains ?? ''}
                  onChange={(e) => set('labelContains', e.target.value)}
                  placeholder="e.g. bug, enhancement…"
                  className="flex-1 h-7 rounded-md border border-border bg-background px-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                />
              </div>

              {/* Status — PRs only */}
              {(form.type === 'prs' || form.type === 'both') && (
                <div className="flex items-start gap-3">
                  <label className="text-xs text-muted-foreground w-32 shrink-0 pt-1">PR status</label>
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
                              ? cfg.className + ' ring-1 ring-offset-0 ring-current'
                              : 'border-border text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {active && <CheckCircle2 className="h-2.5 w-2.5 mr-1" />}
                          {cfg.label}
                        </button>
                      )
                    })}
                    {(form.statuses ?? []).length > 0 && (
                      <button
                        onClick={() => set('statuses', [])}
                        className="text-[9px] text-muted-foreground/60 hover:text-muted-foreground underline"
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
                  <label className="text-xs text-muted-foreground w-32 shrink-0">Needs my review</label>
                  <div className="flex gap-2">
                    {([
                      ['yes', true],
                      ['no', false],
                      ['any', undefined],
                    ] as [string, boolean | undefined][]).map(([lbl, val]) => (
                      <button
                        key={lbl}
                        onClick={() => set('needsMyReview', val)}
                        className={`h-6 px-3 rounded border text-[10px] transition-colors capitalize ${
                          form.needsMyReview === val
                            ? 'bg-primary/10 border-primary/30 text-primary'
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
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border bg-muted/5">
          <button
            onClick={onClose}
            className="h-8 px-3 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!isValid}
            className="h-8 px-4 rounded-lg bg-primary text-primary-foreground text-xs font-medium disabled:opacity-40 hover:bg-primary/90 transition-colors flex items-center gap-1.5"
          >
            <Save className="h-3 w-3" /> {initial ? 'Save changes' : 'Create filter'}
          </button>
        </div>
      </div>
    </>
  )
}
