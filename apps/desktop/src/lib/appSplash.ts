/**
 * Fades out and removes the static splash markup painted instantly by index.html.
 * The setTimeout fallback guarantees removal even if `transitionend` never fires
 * (e.g. reduced-motion, or no matching CSS transition). Idempotent: safe to call
 * more than once.
 */
export function hideAppSplash(): void {
  const splash = document.getElementById('app-splash')
  if (!splash) return
  splash.classList.add('is-hidden')
  const remove = () => splash.remove()
  splash.addEventListener('transitionend', remove, { once: true })
  setTimeout(remove, 300)
}
