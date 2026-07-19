// Définition des colonnes du tableau virtuel de la zone centrale (GitGraphView).
// L'ordre est fixe (pas de réordonnancement). La visibilité et la largeur sont
// persistées via `stores/gitGraphColumns.store.ts`.

import { GRAPH_MIN_WIDTH } from './graphLayout'

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

/**
 * Largeur par défaut de chaque colonne au premier lancement (px). Ignorée pour la
 * colonne `flex` (message), qui absorbe l'espace restant.
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
 * Largeur minimale de chaque colonne lors du redimensionnement (px). Appliquée
 * aussi comme plancher de la colonne `flex` (message) pour qu'elle ne s'effondre
 * pas sous son contenu.
 */
export const COLUMN_MIN_WIDTH: Record<ColumnKey, number> = {
  refs: 100,
  // Un avatar (32) + un peu d'air autour + la marge droite de la cellule (8) : le mode
  // `compact` de `graphColumnSizing.ts` n'affiche alors plus que le marqueur de chaque commit.
  graph: GRAPH_MIN_WIDTH,
  message: 100,
  author: 100,
  // date et sha basculent leur libellé d'en-tête en icône sous ~72px (voir
  // GraphHeader) : min plus serré pour que cet état compact soit atteignable.
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

/** Colonne résolue (def + état courant) prête à être rendue. */
export interface ResolvedColumn extends ColumnDef {
  width: number
  /** Largeur maximale dynamique (px) lors du redimensionnement — calculée par rendu pour la
   * colonne `graph` (voir `graphColumnSizing.getGraphMaxWidth`), absente pour les autres. */
  maxWidth?: number
}
