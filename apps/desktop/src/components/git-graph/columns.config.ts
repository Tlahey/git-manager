// Column definitions for the central area's virtual table (GitGraphView). The order is fixed (no
// reordering); visibility and width are persisted through `stores/gitGraphColumns.store.ts`.

import { GRAPH_MIN_WIDTH } from './graphLayout'

export type ColumnKey = 'refs' | 'graph' | 'message' | 'author' | 'date' | 'sha'

export interface ColumnDef {
  key: ColumnKey
  /** i18n key (namespace `git`) of the label shown in the header / the menu. */
  labelKey: string
  /** Default width in px (ignored for a `flex` column). */
  defaultWidth: number
  /** Minimum width in px while resizing. */
  minWidth: number
  /** Visible by default on first launch. */
  defaultVisible: boolean
  /** The column absorbs the remaining space (no fixed width, no resize handle). */
  flex?: boolean
}

/** Fixed display order of the columns (left → right). */
export const COLUMN_ORDER: ColumnKey[] = ['refs', 'graph', 'message', 'author', 'date', 'sha']

/**
 * Default width of each column on first launch (px). Ignored for the `flex` column (message),
 * which absorbs the remaining space.
 */
export const COLUMN_DEFAULT_WIDTH: Record<ColumnKey, number> = {
  refs: 160,
  graph: 200,
  message: 400,
  author: 150,
  date: 110,
  sha: 80,
}

/**
 * Minimum width of each column while resizing (px). Also applied as the floor of the `flex` column
 * (message) so it can't collapse below its content.
 */
export const COLUMN_MIN_WIDTH: Record<ColumnKey, number> = {
  refs: 100,
  // One avatar (32) + a little room around it + the cell's right margin (8): `graphColumnSizing.ts`'s
  // `compact` mode then shows nothing but each commit's marker.
  graph: GRAPH_MIN_WIDTH,
  message: 100,
  author: 100,
  // date and sha swap their header label for an icon below ~72px (see GraphHeader): a tighter min
  // so that compact state is actually reachable.
  date: 60,
  sha: 60,
}

export const COLUMN_DEFS: Record<ColumnKey, ColumnDef> = {
  refs: {
    key: 'refs',
    labelKey: 'gitTree.columns.refs',
    defaultWidth: COLUMN_DEFAULT_WIDTH.refs,
    minWidth: COLUMN_MIN_WIDTH.refs,
    defaultVisible: true,
  },
  graph: {
    key: 'graph',
    labelKey: 'gitTree.columns.graph',
    defaultWidth: COLUMN_DEFAULT_WIDTH.graph,
    minWidth: COLUMN_MIN_WIDTH.graph,
    defaultVisible: true,
  },
  message: {
    key: 'message',
    labelKey: 'gitTree.columns.message',
    defaultWidth: COLUMN_DEFAULT_WIDTH.message,
    minWidth: COLUMN_MIN_WIDTH.message,
    defaultVisible: true,
    flex: true,
  },
  author: {
    key: 'author',
    labelKey: 'gitTree.columns.author',
    defaultWidth: COLUMN_DEFAULT_WIDTH.author,
    minWidth: COLUMN_MIN_WIDTH.author,
    defaultVisible: false,
  },
  date: {
    key: 'date',
    labelKey: 'gitTree.columns.date',
    defaultWidth: COLUMN_DEFAULT_WIDTH.date,
    minWidth: COLUMN_MIN_WIDTH.date,
    defaultVisible: false,
  },
  sha: {
    key: 'sha',
    labelKey: 'gitTree.columns.sha',
    defaultWidth: COLUMN_DEFAULT_WIDTH.sha,
    minWidth: COLUMN_MIN_WIDTH.sha,
    defaultVisible: false,
  },
}

/** A resolved column (def + current state), ready to render. */
export interface ResolvedColumn extends ColumnDef {
  width: number
  /** Dynamic maximum width (px) while resizing — computed per render for the `graph` column (see
   * `graphColumnSizing.getGraphMaxWidth`), absent for the others. */
  maxWidth?: number
}
