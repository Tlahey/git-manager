import type { GitBranch, GitRef, GitSubmodule, PullRequest } from '@git-manager/git-types'

/** Identifiants stables des sections (état d'ouverture + scroll). */
export type SectionKey = 'local' | 'remotes' | 'prs' | 'tags' | 'submodules'

/**
 * Ligne unitaire de la sidebar aplatie pour la virtualisation.
 * L'accordéon (sections / dossiers repliables) est transformé en une liste
 * plate ne contenant que les lignes actuellement visibles.
 */
export type SidebarRow =
  | {
      kind: 'section'
      id: string
      sectionKey: SectionKey
      title: string
      count?: number
      isOpen: boolean
    }
  | {
      kind: 'branch'
      id: string
      branch: GitBranch
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
  | { kind: 'submodule'; id: string; sm: GitSubmodule }
  | { kind: 'message'; id: string; text: string; loading?: boolean }
  | { kind: 'divider'; id: string }

/** Hauteur estimée (px) par type de ligne — sert d'estimation au virtualizer. */
export const ROW_HEIGHT: Record<SidebarRow['kind'], number> = {
  section: 30,
  branch: 24,
  folder: 24,
  'remote-group': 24,
  'remote-branch': 24,
  subgroup: 22,
  pr: 46,
  tag: 24,
  submodule: 40,
  message: 28,
  divider: 9,
}

/** Valeurs d'ouverture par défaut des sections. */
export const DEFAULT_SECTION_OPEN: Record<SectionKey, boolean> = {
  local: true,
  remotes: true,
  prs: true,
  tags: false,
  submodules: false,
}

/** Branches épinglées par défaut (toujours en haut, sauf override utilisateur). */
export const DEFAULT_PINNED = ['main', 'master']
