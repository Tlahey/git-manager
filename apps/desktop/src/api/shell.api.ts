import { invoke } from '@tauri-apps/api/core'

export async function apiOpenUrl(url: string): Promise<void> {
  try {
    const { open } = await import('@tauri-apps/plugin-shell')
    await open(url)
  } catch (err) {
    console.error('Failed to open URL via Tauri shell, falling back to window.open:', err)
    window.open(url, '_blank')
  }
}

export async function apiOpenTerminal(path: string, terminal: string, customCommand?: string): Promise<void> {
  try {
    await invoke('open_in_terminal', { path, terminal, customCommand })
  } catch (err) {
    console.error('Failed to open terminal:', err)
  }
}
