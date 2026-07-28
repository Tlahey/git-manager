#!/usr/bin/env node
/**
 * Frees the Vite dev port before `tauri dev` starts.
 *
 * Why this exists: closing the app window kills the Tauri process, but the dev server it started is
 * a *grandchild* (tauri → shell → vite), and only the direct child is signalled. Vite is reparented
 * to PID 1 and keeps holding the port — visible as `ps -o ppid` reporting 1 for a live `vite.js`.
 * The next `pnpm dev` then dies on "Port 1420 is already in use", because `strictPort` is on (it has
 * to be: Tauri loads a hardcoded `devUrl`, so silently moving to 1421 would open the app on a blank
 * page instead of failing).
 *
 * `beforeDevCommand` now runs Vite without a package-manager wrapper, which removes the usual cause.
 * This stays as the guard: a leftover from a crash, a `kill -9`, or an older checkout must not make
 * the next run fail with an error about a port the user never chose.
 *
 * Deliberately never fatal — a dev server that will not start is a much smaller problem than a dev
 * command that refuses to run because its cleanup step had an opinion.
 */
import { execFileSync } from 'node:child_process'

/** Must match `server.port` in vite.config.ts and `build.devUrl` in tauri.conf.json. */
const PORT = 1420

/** PIDs listening on the port. Empty on any failure, including "lsof is not installed". */
function listenersOn(port) {
  try {
    const out = execFileSync('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    return [...new Set(out.split('\n').map((l) => Number(l.trim())).filter(Boolean))]
  } catch {
    // `lsof` exits non-zero when nothing matches, which is the normal case.
    return []
  }
}

function describe(pid) {
  try {
    return execFileSync('ps', ['-o', 'command=', '-p', String(pid)], { encoding: 'utf8' }).trim()
  } catch {
    return 'unknown process'
  }
}

if (process.platform === 'win32') {
  // No lsof; the orphaning behaviour is different there too. Nothing to do rather than guess.
  process.exit(0)
}

const pids = listenersOn(PORT)
for (const pid of pids) {
  console.log(`[dev] port ${PORT} still held by pid ${pid} (${describe(pid)}) — stopping it`)
  try {
    process.kill(pid, 'SIGTERM')
  } catch {
    // Already gone between the lookup and here, or not ours to signal.
  }
}

if (pids.length > 0) {
  // Give SIGTERM a moment, then insist. A synchronous wait keeps this a plain sequential step in
  // the dev script rather than something `tauri dev` could race with.
  execFileSync('sleep', ['1'])
  for (const pid of listenersOn(PORT)) {
    console.log(`[dev] pid ${pid} ignored SIGTERM — forcing`)
    try {
      process.kill(pid, 'SIGKILL')
    } catch {
      /* gone */
    }
  }
}
