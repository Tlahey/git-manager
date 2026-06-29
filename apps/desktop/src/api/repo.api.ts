import {
  openRepo,
  scanRepos,
  getRepoSummary,
  openInEditor,
  getRepoReadme,
} from '../lib/tauri'

export async function apiOpenRepo(path: string) {
  return openRepo(path)
}

export async function apiScanRepos(rootPath: string, maxDepth: number) {
  return scanRepos(rootPath, maxDepth)
}

export async function apiGetRepoSummary(path: string) {
  return getRepoSummary(path)
}

export async function apiOpenInEditor(path: string, editor: string, customCommand?: string) {
  return openInEditor(path, editor, customCommand)
}

export async function apiGetRepoReadme(path: string) {
  return getRepoReadme(path)
}
