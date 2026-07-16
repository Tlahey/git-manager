import type {
  GitBranch,
  GitRef,
  GitSubmodule,
  GitWorktree,
  PullRequest,
  GitStash,
} from '@git-manager/git-types'

/** Identifiants stables des sections (état d'ouverture + scroll). */
export type SectionKey =
  | 'local'
  | 'remotes'
  | 'prs'
  | 'tags'
  | 'submodules'
  | 'stashes'
  | 'worktrees'

/**
 * Ligne unitaire du corps d'une section de la sidebar (branches, dossiers,
 * tags, etc.) — n'inclut pas l'en-tête de section, rendu séparément par
 * `SidebarSectionHeader` et propriétaire de son propre état d'ouverture.
 */
export type SidebarRow =
  | {
      kind: 'branch'
      id: string
      branch: GitBranch
      /** Nom affiché — préfixe de dossier (ex: "feat/") retiré quand la branche est dans un groupe. */
      displayName: string
      depth: 0 | 1
      isSelected: boolean
      isPinned: boolean
    }
  | {
      kind: 'folder'
      id: string
      prefix: string
      count: number
      isOpen: boolean
      hasHead: boolean
    }
  | {
      kind: 'remote-group'
      id: string
      remoteName: string
      count: number
      isOpen: boolean
    }
  | {
      kind: 'remote-branch'
      id: string
      branch: GitBranch
      remoteName: string
      isSelected: boolean
    }
  | {
      kind: 'subgroup'
      id: string
      label: string
      count: number
      isOpen: boolean
    }
  | { kind: 'pr'; id: string; pr: PullRequest; isSelected: boolean }
  | { kind: 'tag'; id: string; tag: GitRef; isSelected: boolean }
  | { kind: 'stash'; id: string; stash: GitStash; isSelected: boolean }
  | { kind: 'submodule'; id: string; sm: GitSubmodule }
  | { kind: 'worktree'; id: string; wt: GitWorktree }
  | { kind: 'message'; id: string; text: string; loading?: boolean }
  | { kind: 'divider'; id: string }

/** Une section de la sidebar (en-tête + corps repliable). */
export interface SidebarSection {
  key: SectionKey
  title: string
  count?: number
  isOpen: boolean
  rows: SidebarRow[]
}

/**
 * Hauteur approximative (px) de l'en-tête d'une section (icône + titre + compteur, `py-1.5` dans
 * `SectionHeader`). Utilisée uniquement pour composer le plancher total du conteneur de section
 * (`MIN_SECTION_HEIGHT` ci-dessous) — une valeur approchée suffit, ce n'est qu'un plancher.
 */
export const SECTION_HEADER_HEIGHT = 28

/**
 * Hauteur minimale (px) du corps d'une section dépliée.
 */
export const MIN_SECTION_BODY_HEIGHT = 120

/**
 * Hauteur minimale (px) du conteneur d'une section dépliée dans son ensemble (en-tête + corps).
 * Chaque section ouverte est un enfant `flex-1` (poids égal, base 0%) de la liste : les sections
 * ouvertes se partagent toujours la hauteur disponible à parts strictement égales, même une
 * section clairsemée (ex: un seul worktree) — c'est voulu, pour que toutes les sections ouvertes
 * s'alignent sur la même hauteur.
 *
 * Ce plancher est appliqué directement (valeur numérique explicite) sur le conteneur de section
 * lui-même, plutôt que de compter sur la taille minimale automatique que le moteur de mise en
 * page dériverait de son contenu — un conteneur flex dont l'`overflow` est `visible` (le cas de
 * ce conteneur, contrairement à son corps en `overflow-y-auto`) peut sinon refuser de rétrécir en
 * dessous de la hauteur totale de son contenu non tronqué, ce qui a déjà produit deux bugs
 * distincts (agrandissement non borné, puis chevauchement des sections suivantes) avant qu'on ne
 * fixe le plancher explicitement ici. Avec un plancher explicite, le calcul de `flex-shrink` est
 * sans ambiguïté : si la somme des planchers des sections ouvertes dépasse la hauteur du panel,
 * c'est la liste de sections entière qui devient scrollable (un seul scrollbar global) plutôt que
 * de continuer à réduire une section illisible ou de laisser les sections se chevaucher.
 */
export const MIN_SECTION_HEIGHT = SECTION_HEADER_HEIGHT + MIN_SECTION_BODY_HEIGHT

/** Valeurs d'ouverture par défaut des sections — toutes repliées. */
export const DEFAULT_SECTION_OPEN: Record<SectionKey, boolean> = {
  local: false,
  remotes: false,
  prs: false,
  tags: false,
  submodules: false,
  stashes: false,
  worktrees: false,
}

/** Branches épinglées par défaut (toujours en haut, sauf override utilisateur). */
export const DEFAULT_PINNED = ['main', 'master']
