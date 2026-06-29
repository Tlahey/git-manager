export async function apiOpenUrl(url: string): Promise<void> {
  try {
    const { open } = await import('@tauri-apps/plugin-shell')
    await open(url)
  } catch (err) {
    console.error('Failed to open URL via Tauri shell, falling back to window.open:', err)
    window.open(url, '_blank')
  }
}
