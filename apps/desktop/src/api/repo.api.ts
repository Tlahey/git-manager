import {
  openRepo,
  scanRepos,
  getRepoSummary,
  openInEditor,
  getRepoReadme,
  cloneRepo,
  initRepo,
  getPrTemplate,
} from '../lib/tauri'

export async function apiOpenRepo(path: string) {
  return openRepo(path)
}

export async function apiCloneRepo(
  url: string,
  destPath: string,
  shallow?: boolean,
  sparse?: boolean
) {
  return cloneRepo(url, destPath, shallow, sparse)
}

export async function apiInitRepo(path: string) {
  return initRepo(path)
}

export async function apiScanRepos(rootPath: string, maxDepth: number) {
  return scanRepos(rootPath, maxDepth)
}

export async function apiGetRepoSummary(path: string) {
  return getRepoSummary(path)
}

export async function apiOpenInEditor(path: string, command: string) {
  return openInEditor(path, command)
}

export async function apiGetRepoReadme(path: string) {
  return getRepoReadme(path)
}

/** Detects the repo's GitHub PR template(s) on disk, to pre-fill the PR composer like github.com. */
export async function apiGetPrTemplate(path: string) {
  return getPrTemplate(path)
}
