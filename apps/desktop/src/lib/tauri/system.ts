import { invoke } from './invoke'

// ─── Package health check ─────────────────────────────────────────────────────

export const hasPackageManifest = (path: string) =>
  invoke<boolean>('has_package_manifest', { path })

export const runPackageHealthCheck = (path: string) =>
  invoke<import('@git-manager/git-types').PackageHealthReport>('run_package_health_check', { path })

export const checkOutdatedPackages = (path: string, packageManager: string) =>
  invoke<import('@git-manager/git-types').OutdatedReport>('check_outdated_packages', {
    path,
    packageManager,
  })

export const getPackageChangelog = (
  path: string,
  name: string,
  from: string,
  to: string,
  token?: string
) =>
  invoke<import('@git-manager/git-types').PackageChangelog>('get_package_changelog', {
    path,
    name,
    from,
    to,
    token,
  })

export const scanPackageUsage = (path: string, name: string) =>
  invoke<import('@git-manager/git-types').PackageUsage>('scan_package_usage', { path, name })

export const updatePackages = (
  path: string,
  packageManager: string,
  names: string[],
  toLatest: boolean
) =>
  invoke<import('@git-manager/git-types').UpdateOutcome>('update_packages', {
    path,
    packageManager,
    names,
    toLatest,
  })

// ─── Integrated terminal (PTY) ───────────────────────────────────────────────

/** Opens a PTY-backed login shell in `cwd`, sized `cols`×`rows`. Returns the session id used for
 * writes/resizes/close and to subscribe to `terminal:output:<id>` / `terminal:exit:<id>` events. */
export const terminalOpen = (cwd: string, cols: number, rows: number) =>
  invoke<string>('terminal_open', { cwd, cols, rows })

/** Writes keystrokes/pasted text to the shell's stdin. */
export const terminalWrite = (id: string, data: string) =>
  invoke<void>('terminal_write', { id, data })

/** Resizes the PTY to match the xterm.js viewport (character cells). */
export const terminalResize = (id: string, cols: number, rows: number) =>
  invoke<void>('terminal_resize', { id, cols, rows })

/** Kills the shell process and drops the session. */
export const terminalClose = (id: string) => invoke<void>('terminal_close', { id })

// ─── SSH ─────────────────────────────────────────────────────────────────────

export const generateSshKey = (
  keyType: string,
  bits: number | null,
  comment: string,
  path: string,
  passphrase?: string
) => invoke<string>('generate_ssh_key', { keyType, bits, comment, path, passphrase })

export const readSshPublicKey = (path: string) => invoke<string>('read_ssh_public_key', { path })
