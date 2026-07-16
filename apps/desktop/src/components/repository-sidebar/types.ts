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
 * Hauteur maximale (px) du corps d'une section dépliée avant qu'il ne devienne
 * scrollable — évite qu'ouvrir une section (ex: des dizaines de branches)
 * ne repousse les sections suivantes hors de vue.
 */
export const MAX_SECTION_BODY_HEIGHT = 256

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
