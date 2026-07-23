import type { CiStatus, CiDetail } from './types'

export async function openUrl(url: string) {
  try {
    const { open } = await import('@tauri-apps/plugin-shell')
    await open(url)
  } catch {
    window.open(url, '_blank')
  }
}

/**
 * The best CI "action" URL to open for a PR's status — the link that lets you jump
 * straight to the run and see why it's OK / KO / still going. Prefers a failing
 * check (what you want to inspect when it's red), then a running one, then any check
 * carrying a link, and finally falls back to the PR's own Checks tab so there is
 * always a way through even when GitHub doesn't attach a per-check URL. Returns
 * undefined only when there is no CI at all (and no PR URL to fall back to).
 */
export function ciActionUrl(
  status: CiStatus,
  details: CiDetail[] | undefined,
  prUrl?: string
): string | undefined {
  const withUrl = (details ?? []).filter((d): d is CiDetail & { url: string } => !!d.url)
  const chosen =
    withUrl.find((d) => d.status === 'failure') ??
    withUrl.find((d) => d.status === 'running') ??
    withUrl[0]
  if (chosen) return chosen.url
  if (prUrl && status !== null) return `${prUrl}/checks`
  return undefined
}

export function timeAgo(date: Date): string {
  const s = Math.floor((Date.now() - date.getTime()) / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d ago`
  return `${Math.floor(d / 30)}mo ago`
}
