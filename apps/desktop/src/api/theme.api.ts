import { getUserThemes } from '../lib/tauri'

export async function apiGetUserThemes() {
  return getUserThemes()
}
