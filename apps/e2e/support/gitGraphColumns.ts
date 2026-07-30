import { browser } from '@wdio/globals'

type ColumnKey = 'refs' | 'graph' | 'message' | 'author' | 'date' | 'sha'

/**
 * Overwrites the persisted commit-graph column layout (visibility + width per column) — same
 * "seed localStorage, takes effect on the next load" contract as `seedSettings`, but for the
 * `git-manager-git-graph-columns` zustand-persist key (`stores/gitGraphColumns.store.ts`), which
 * is separate from `git-manager-settings`.
 */
export async function seedGraphColumns(
  columns: Record<ColumnKey, { visible: boolean; width: number }>
): Promise<void> {
  await browser.execute((raw: string) => {
    window.localStorage.setItem(
      'git-manager-git-graph-columns',
      JSON.stringify({ state: { columns: JSON.parse(raw) }, version: 0 })
    )
  }, JSON.stringify(columns))
}
