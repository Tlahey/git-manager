import {
  checkOutdatedPackages,
  getPackageChangelog,
  hasPackageManifest,
  runPackageHealthCheck,
  scanPackageUsage,
  updatePackages,
} from '../lib/tauri'

/** True when the repo has a root `package.json` — the tool applies only there. */
export async function apiHasPackageManifest(path: string) {
  return hasPackageManifest(path)
}

/** Offline manifest checks: alignment, catalog drift, install state, ... */
export async function apiRunPackageHealthCheck(path: string) {
  return runPackageHealthCheck(path)
}

/**
 * Asks the repo's own package manager which dependencies have newer releases.
 * Hits the network via that CLI, so it is on demand rather than part of the report.
 */
export async function apiCheckOutdatedPackages(path: string, packageManager: string) {
  return checkOutdatedPackages(path, packageManager)
}

/**
 * Release notes between the installed version and the update target. `accountId`
 * is optional — public repos resolve unauthenticated, just at a lower rate limit.
 * It names a connected GitHub account (a login), never a token: the real credential
 * is resolved server-side, in Rust, from that id.
 */
export async function apiGetPackageChangelog(
  path: string,
  name: string,
  from: string,
  to: string,
  accountId?: string
) {
  return getPackageChangelog(path, name, from, to, accountId)
}

/**
 * What this repo imports from a dependency, for the upgrade-risk assessment.
 * Filesystem-only — no network, no package manager.
 */
export async function apiScanPackageUsage(path: string, name: string) {
  return scanPackageUsage(path, name)
}

/**
 * Runs the update. Mutates manifests, the lockfile and `node_modules`, so callers
 * must only reach this from an explicit user action.
 */
export async function apiUpdatePackages(
  path: string,
  packageManager: string,
  names: string[],
  toLatest: boolean
) {
  return updatePackages(path, packageManager, names, toLatest)
}
