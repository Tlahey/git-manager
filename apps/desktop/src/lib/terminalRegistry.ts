import { Terminal, type ITheme } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import '@xterm/xterm/css/xterm.css'
import { apiTerminalClose, apiTerminalResize, apiTerminalWrite } from '../api/terminal.api'

/**
 * Module-level registry of live xterm.js instances, keyed by backend PTY session id.
 *
 * xterm terminals live *outside* React so a session keeps its scrollback and cursor state when its
 * tab is switched away, or when the whole panel is toggled closed and reopened. React components
 * (`XtermView`) only attach/detach the terminal's DOM node; ownership (create/dispose/subscribe)
 * stays here. `disposeTerminal` is the single teardown path — it unsubscribes, kills the backend
 * PTY, and disposes the xterm instance.
 */
interface TerminalEntry {
  term: Terminal
  fit: FitAddon
  el: HTMLDivElement
  opened: boolean
  unlisten: UnlistenFn[]
}

const registry = new Map<string, TerminalEntry>()

/** User-chosen terminal colours (Settings → External tools). Black background by default. */
export interface TerminalColors {
  background: string
  foreground: string
}

let themeColors: TerminalColors = { background: '#000000', foreground: '#e4e4e7' }

function buildTheme(): ITheme {
  return {
    background: themeColors.background,
    foreground: themeColors.foreground,
    cursor: themeColors.foreground,
  }
}

/** Sets the terminal colour theme and re-applies it live to every open session. Called by the app
 * whenever the user's colour settings change (see `RepoView`). */
export function setTerminalTheme(colors: TerminalColors): void {
  themeColors = colors
  const theme = buildTheme()
  registry.forEach((entry) => {
    entry.term.options.theme = theme
  })
}

/**
 * Returns the terminal for `id`, creating (but not yet mounting) it on first request: wires input
 * (`onData` → PTY), output (`terminal:output:<id>` → xterm), and an exit notice. The caller attaches
 * `entry.el` to the DOM and calls `attach`/`fit` — see `XtermView`.
 */
export function getOrCreateTerminal(id: string): TerminalEntry {
  const existing = registry.get(id)
  if (existing) return existing

  const el = document.createElement('div')
  el.style.width = '100%'
  el.style.height = '100%'

  const term = new Terminal({
    cursorBlink: true,
    fontSize: 13,
    fontFamily:
      'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
    theme: buildTheme(),
    allowProposedApi: true,
  })
  const fit = new FitAddon()
  term.loadAddon(fit)

  term.onData((data) => {
    void apiTerminalWrite(id, data)
  })

  const entry: TerminalEntry = { term, fit, el, opened: false, unlisten: [] }

  void listen<number[]>(`terminal:output:${id}`, (event) => {
    term.write(new Uint8Array(event.payload))
  }).then((un) => entry.unlisten.push(un))

  void listen<void>(`terminal:exit:${id}`, () => {
    term.writeln('\r\n\x1b[90m[process exited]\x1b[0m')
  }).then((un) => entry.unlisten.push(un))

  registry.set(id, entry)
  return entry
}

/**
 * Attaches the terminal's DOM node to `container`, opening it on first attach, then fitting it to
 * the container and pushing the resulting size to the backend PTY. Safe to call repeatedly.
 */
export function attachTerminal(id: string, container: HTMLElement): void {
  const entry = registry.get(id)
  if (!entry) return
  container.appendChild(entry.el)
  if (!entry.opened) {
    entry.term.open(entry.el)
    entry.opened = true
  }
  fitTerminal(id)
  entry.term.focus()
}

/** Detaches the terminal's DOM node without destroying the session (tab switch / panel close). */
export function detachTerminal(id: string): void {
  const entry = registry.get(id)
  entry?.el.remove()
}

/** Refits the terminal to its container and reports the new cell size to the backend PTY. */
export function fitTerminal(id: string): void {
  const entry = registry.get(id)
  if (!entry || !entry.opened) return
  try {
    entry.fit.fit()
  } catch {
    return
  }
  void apiTerminalResize(id, entry.term.cols, entry.term.rows)
}

/** Full teardown: unsubscribe, kill the backend PTY, dispose the xterm instance, drop the entry. */
export function disposeTerminal(id: string): void {
  const entry = registry.get(id)
  if (!entry) return
  entry.unlisten.forEach((un) => un())
  void apiTerminalClose(id)
  entry.term.dispose()
  entry.el.remove()
  registry.delete(id)
}

/** Test-only: whether a session is currently registered. */
export function hasTerminal(id: string): boolean {
  return registry.has(id)
}
