// Définition des colonnes du tableau virtuel de la zone centrale (GitGraphView).
// L'ordre est fixe (pas de réordonnancement). La visibilité et la largeur sont
// persistées via `stores/gitGraphColumns.store.ts`.

export type ColumnKey = 'refs' | 'graph' | 'message' | 'author' | 'date' | 'sha'

export interface ColumnDef {
  key: ColumnKey
  /** Clé i18n (namespace `git`) du libellé affiché dans l'en-tête / le menu. */
  labelKey: string
  /** Largeur par défaut en px (ignorée pour une colonne `flex`). */
  defaultWidth: number
  /** Largeur minimale en px lors du redimensionnement. */
  minWidth: number
  /** Visible par défaut au premier lancement. */
  defaultVisible: boolean
  /** La colonne absorbe l'espace restant (pas de largeur fixe, pas de poignée). */
  flex?: boolean
}

/** Ordre d'affichage fixe des colonnes (gauche → droite). */
export const COLUMN_ORDER: ColumnKey[] = ['refs', 'graph', 'message', 'author', 'date', 'sha']

export const COLUMN_DEFS: Record<ColumnKey, ColumnDef> = {
  refs: {
    key: 'refs',
    labelKey: 'gitTree.columns.refs',
    defaultWidth: 160,
    minWidth: 100,
    defaultVisible: true,
  },
  graph: {
    key: 'graph',
    labelKey: 'gitTree.columns.graph',
    defaultWidth: 200,
    minWidth: 100,
    defaultVisible: true,
  },
  message: {
    key: 'message',
    labelKey: 'gitTree.columns.message',
    defaultWidth: 400,
    minWidth: 100,
    defaultVisible: true,
    flex: true,
  },
  author: {
    key: 'author',
    labelKey: 'gitTree.columns.author',
    defaultWidth: 150,
    minWidth: 100,
    defaultVisible: false,
  },
  date: {
    key: 'date',
    labelKey: 'gitTree.columns.date',
    defaultWidth: 110,
    minWidth: 100,
    defaultVisible: false,
  },
  sha: {
    key: 'sha',
    labelKey: 'gitTree.columns.sha',
    defaultWidth: 100,
    minWidth: 100,
    defaultVisible: false,
  },
}

/** Colonne résolue (def + état courant) prête à être rendue. */
export interface ResolvedColumn extends ColumnDef {
  width: number
}
