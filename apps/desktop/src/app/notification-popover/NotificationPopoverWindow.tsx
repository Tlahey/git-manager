import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { emit } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'
import { LogicalPosition } from '@tauri-apps/api/dpi'
import { X } from 'lucide-react'
import { useTranslation } from '@git-manager/i18n'
import { Avatar, Badge, Button, cn } from '@git-manager/ui'
import { useSettingsStore } from '../../stores/settings.store'
import {
  apiClearWindowBackdrop,
  apiPlaySystemSound,
  apiRaiseAboveMenuBar,
  NOTIFICATION_ACTIVATED_EVENT,
} from '../../api/notification.api'
import { HALO_MARGIN } from '../../lib/notificationPopoverWindow'
import { resolveDisplayDurationMs } from '../../lib/notifications/notificationDisplay'
import { buildNotificationRoute } from '../../lib/notifications/notificationRoute'
import { formatRelativeTimestamp } from '../../lib/relativeDate'
import { openUrl } from '../../lib/openUrl'
import { getNotificationIcon, getNotificationText } from '../../components/notification/utils'
import type { AppNotification } from '../../stores/notification.store'

// Independent of the user's chosen native-banner sound (`settings.notifications.soundName`):
// there's no banner in this path to attach a sound to, so this is a fixed, standalone system
// sound rather than a repurposed notification setting.
const POPOVER_SOUND = 'Pop'

// How far the window itself travels while sliding in/out, and how long that takes. This moves the
// real OS window (not just a CSS transform on its content) so it reads as a native banner sliding
// down from the menu bar, the same way the real macOS notification/AirDrop HUDs do.
const SLIDE_DISTANCE = 28
const ENTER_MS = 240
const EXIT_MS = 180

// ── Notch geometry ───────────────────────────────────────────────────────────────────────────
// The card's top edge sits at the very top of the screen, so on a notched MacBook its first band
// is *behind the camera housing*: anything drawn in the middle of it is physically invisible. The
// band is therefore reserved — no content taller than it, and what content it does hold is pinned
// to the two slivers of real screen either side of the housing.
//
// `NSScreen.safeAreaInsets.top` / `auxiliaryTopLeftArea` would give the exact figures for the
// current display; these are the standard values every notched MacBook (14"/16" Pro, M-series Air)
// reports, and they degrade correctly on a notchless display — there the band is simply the strip
// that overlaps the menu bar, which is just as unusable for anything you expect to be readable.
const NOTCH_BAND_HEIGHT = 32
/** Half the housing's width, plus breathing room — each sliver's content stops here. */
const NOTCH_HALF_WIDTH = 100

// The halo's color per notification kind — a separate, deliberately different palette from each
// type's own icon badge color (`NotificationIcons.tsx`): the icon badge is a small, permanent
// per-type accent, while the halo is a glanceable "what kind of thing just happened" signal you
// can read from across the room. Fixed values rather than `var(--primary)`: the window pins
// `data-theme="dark"` (see index.html) purely so the shared `@git-manager/ui` components resolve
// their tokens, and this palette is deliberately *not* the user's theme.
//
// Stored as bare `r, g, b` triples rather than hex so the pulse keyframes below can vary the
// *alpha* of one shared color (`rgba(var(--halo-rgb), …)`) — a hex value can't be given an alpha
// from inside a keyframe.
const HALO_COLORS: Partial<Record<AppNotification['type'], string>> = {
  review_requested: '180, 166, 245', // lavender
  review_status_changed: '180, 166, 245',
  new_pr: '99, 102, 241', // primary-ish indigo
  ci_success: '34, 197, 94', // green
  ci_failed: '239, 68, 68', // red
  pr_merged: '168, 85, 247', // purple
  pr_closed: '239, 68, 68',
  pr_queued: '99, 102, 241',
}
const DEFAULT_HALO_COLOR = '100, 116, 139'

/** Named once, used by both the `@keyframes` block and the inline `animation` that runs it — so
 * the two can't drift into a rule nothing references. */
const HALO_PULSE_KEYFRAMES = 'notification-popover-halo-pulse'
/** One full breath (faint → bright → faint). Larger is slower. */
const HALO_PULSE_DURATION = '2s'

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3
}

function easeInCubic(t: number): number {
  return t ** 3
}

/** Animates the window's own y position (x stays fixed) via `setPosition`, frame by frame. */
function animateWindowY(
  x: number,
  fromY: number,
  toY: number,
  durationMs: number,
  ease: (t: number) => number
): Promise<void> {
  const win = getCurrentWindow()
  const start = performance.now()
  return new Promise((resolve) => {
    function step(now: number) {
      const t = Math.min(1, (now - start) / durationMs)
      const y = fromY + (toY - fromY) * ease(t)
      void win.setPosition(new LogicalPosition(x, y))
      if (t < 1) requestAnimationFrame(step)
      else resolve()
    }
    requestAnimationFrame(step)
  })
}

/**
 * Emits the exact same event the OS banner's click already produces, so the main window's
 * existing `useNotificationWatcher` listener routes it — this window's Zustand stores are a
 * separate instance and calling `routeNotification` here directly would mutate state nobody reads.
 */
async function activateNotification(notif: AppNotification) {
  await emit(NOTIFICATION_ACTIVATED_EVENT, buildNotificationRoute(notif))
  const main = await WebviewWindow.getByLabel('main')
  await main?.show()
  await main?.setFocus()
}

/** Up to two letters for the avatar fallback, punctuation stripped (`github-actions` → `GI`). */
function authorInitials(author: string): string {
  const letters = author.replace(/[^\p{L}\p{N}]/gu, '')
  return letters.slice(0, 2).toUpperCase() || '?'
}

interface NotificationPopoverContentProps {
  notif: AppNotification
  /** The card's own visible position — passed in rather than re-queried, so slide-in doesn't
   * depend on extra IPC calls that could fail and leave the window stuck invisible. The OS window
   * itself sits `HALO_MARGIN` up and to the left of this, to leave room for the halo (see
   * `notificationPopoverWindow.ts`). */
  restX: number
  restY: number
}

/**
 * The popover's card: a notch-aware four-row layout (reserved band, event header, PR, actions).
 * Kept local to `apps/desktop` rather than pushed into `packages/ui` — it needs the
 * `AppNotification` domain type and the settings store, which `reusable-components` placement
 * rules keep out of that package.
 */
function NotificationPopoverContent({ notif, restX, restY }: NotificationPopoverContentProps) {
  const { t } = useTranslation('common')
  // `getNotificationText`'s `message` is deliberately unused here: it's a sentence templating the
  // repo/title/author back together, and this layout already shows each of them as its own field.
  const { title } = getNotificationText(notif, t)
  const [visible, setVisible] = useState(false)
  const dismissingRef = useRef(false)
  const slidInRef = useRef(false)
  const haloRgb = HALO_COLORS[notif.type] ?? DEFAULT_HALO_COLOR
  const accent = `rgb(${haloRgb})`
  const repoLabel = notif.fullName ?? notif.repo

  // Window-space position (top-left of the OS window) is the card's own position offset by the
  // halo margin — kept as one pair of numbers so every `setPosition`/animation call below uses
  // the same math instead of repeating the `- HALO_MARGIN` at each call site.
  const windowX = restX - HALO_MARGIN
  const windowY = restY - HALO_MARGIN

  const dismiss = useCallback(async () => {
    if (dismissingRef.current) return
    dismissingRef.current = true
    setVisible(false)
    if (slidInRef.current) {
      await animateWindowY(windowX, windowY, windowY - SLIDE_DISTANCE, EXIT_MS, easeInCubic)
    }
    await getCurrentWindow().close()
  }, [windowX, windowY])

  useEffect(() => {
    let cancelled = false

    async function slideIn() {
      const win = getCurrentWindow()
      // Above the menu bar's own native z-order, so the card visually emerges from behind it
      // during the slide rather than sliding out from underneath the bar's icons.
      await apiRaiseAboveMenuBar()
      // `transparent: true` on the window is not enough on its own — WKWebView still paints an
      // opaque rectangle under the page, which is what made the card's rounded corners look
      // square. Deliberately NOT `apiSetWindowVibrancy('hud', …)`: that cleared the backdrop too,
      // but only as a side effect of installing an NSVisualEffectView, whose frosted material
      // then filled the whole window — showing up as a pane of glass around the card.
      await apiClearWindowBackdrop()
      // The window was created with `visible: false` at exactly (windowX, windowY) — park it one
      // slide-step above that before the first paint, then reveal and animate down. Each step is
      // wrapped in try/catch: if anything here throws (a denied permission, a slow IPC call), the
      // window must still end up visible at its resting spot rather than staying invisible forever.
      try {
        await win.setPosition(new LogicalPosition(windowX, windowY - SLIDE_DISTANCE))
      } catch (e) {
        console.warn('Notification popover: failed to set initial slide position:', e)
      }
      try {
        await win.show()
      } catch (e) {
        console.warn('Notification popover: failed to show window:', e)
      }
      if (cancelled) return
      setVisible(true)
      slidInRef.current = true
      try {
        await animateWindowY(windowX, windowY - SLIDE_DISTANCE, windowY, ENTER_MS, easeOutCubic)
      } catch (e) {
        console.warn('Notification popover: slide-in animation failed:', e)
        await win.setPosition(new LogicalPosition(windowX, windowY)).catch(() => undefined)
      }
    }
    void slideIn()

    // This window is a separate webview with its own store instance, but `settings.store`
    // persists to localStorage, which the two windows share — so what it reads here is the same
    // snapshot the Settings page wrote.
    const notificationSettings = useSettingsStore.getState().settings.notifications
    if (notificationSettings?.enableSound ?? false) void apiPlaySystemSound(POPOVER_SOUND)

    // `null` = the user chose "until I close it"; no timer at all rather than a very long one,
    // so nothing can dismiss the card behind their back.
    const autoHideMs = resolveDisplayDurationMs(notificationSettings)
    const hideTimer =
      autoHideMs === null ? undefined : setTimeout(() => void dismiss(), autoHideMs)
    // Dismiss like a native NSPopover the moment focus leaves it (a click elsewhere on screen,
    // not just a click on the main window).
    const handleBlur = () => void dismiss()
    window.addEventListener('blur', handleBlur)

    return () => {
      cancelled = true
      if (hideTimer !== undefined) clearTimeout(hideTimer)
      window.removeEventListener('blur', handleBlur)
    }
  }, [dismiss, windowX, windowY])

  async function handleActivate() {
    await activateNotification(notif)
    await dismiss()
  }

  async function handleOpenOnGitHub() {
    if (notif.url) await openUrl(notif.url)
    await dismiss()
  }

  const slotStyle = { maxWidth: NOTCH_HALF_WIDTH }

  return (
    <div className="relative h-screen w-screen">
      {/* Scoped to this one-off component rather than a global keyframe for a single consumer.
          Animates the shadow itself (blur radius + alpha, no spread) rather than the element's
          opacity: a spread pushes a hard-edged band of solid color out from the card, and swinging
          a whole layer's opacity reads as a blink. This breathes. */}
      <style>{`
        @keyframes ${HALO_PULSE_KEYFRAMES} {
          0%, 100% { box-shadow: 0 0 10px rgba(var(--halo-rgb), 0.25); }
          50%      { box-shadow: 0 0 20px rgba(var(--halo-rgb), 0.5); }
        }
      `}</style>

      {/* Halo: same rect as the card, behind it, glow bleeding into the transparent margin around
          it. A `box-shadow` (not a gradient) so it follows the card's own rounded shape exactly.
          The animation is declared inline rather than through Tailwind's `animate-[…]` arbitrary
          value: that utility only exists if Tailwind's content scanner finds the literal class
          string and emits a rule for it, which couples a hand-written keyframe sitting three lines
          above to the build pipeline for no benefit. Inline, it references the keyframe directly. */}
      <div
        aria-hidden="true"
        className="absolute rounded-b-2xl transition-opacity duration-200"
        style={
          {
            top: HALO_MARGIN,
            left: HALO_MARGIN,
            right: HALO_MARGIN,
            bottom: HALO_MARGIN,
            '--halo-rgb': haloRgb,
            opacity: visible ? 1 : 0,
            animation: visible
              ? `${HALO_PULSE_KEYFRAMES} ${HALO_PULSE_DURATION} ease-in-out infinite`
              : undefined,
          } as CSSProperties
        }
      />

      {/* The card. Clicking anywhere on it opens the notification in the app — the footer's
          "Open" button is the same action made explicit (and keyboard-reachable), so this outer
          handler stays a plain div rather than a `role="button"` wrapping other buttons. */}
      <div
        data-testid="notification-popover"
        onClick={() => void handleActivate()}
        style={{ top: HALO_MARGIN, left: HALO_MARGIN, right: HALO_MARGIN, bottom: HALO_MARGIN }}
        className={cn(
          // Rounded on the bottom only, square on top: the top edge sits flush against (and
          // partly behind) the menu bar, so rounding it would leave a visible gap of bar showing
          // through the corners. Background is *fully* opaque black regardless of theme — this
          // card reads as an extension of the (always-dark) menu bar, not as a themed app
          // surface. Deliberately no `shadow-*` and no `backdrop-blur-*`: both painted into the
          // transparent margin around the card (a dark haze, and a frosted sample of the desktop)
          // and stacked with the halo into something that read as a pane of glass. The halo is
          // the only thing allowed to render outside the card's own rectangle.
          'absolute flex cursor-pointer flex-col overflow-hidden rounded-b-2xl border border-white/10 bg-black transition-opacity duration-200 ease-out',
          visible ? 'opacity-100' : 'opacity-0'
        )}
      >
        {/* ── Row 0: the reserved notch band ──────────────────────────────────────────────────
            Only the two slivers either side of the camera housing hold anything — the close
            button included, which is why it sits here rather than in the header below. */}
        <div
          data-testid="notification-popover-notch-band"
          style={{ height: NOTCH_BAND_HEIGHT }}
          className="flex shrink-0 items-center justify-between border-b border-white/5 pl-3 pr-2"
        >
          {/* "Git Manager" is the product name — a proper noun, deliberately untranslated. */}
          <span
            style={slotStyle}
            className="truncate text-[9px] font-semibold uppercase tracking-[0.18em] text-white/35"
          >
            Git Manager
          </span>
          <button
            type="button"
            data-testid="notification-popover-close"
            aria-label={t('actions.close')}
            onClick={(e) => {
              e.stopPropagation()
              void dismiss()
            }}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/50 transition-colors hover:bg-white/20 hover:text-white"
          >
            <X className="h-3 w-3" />
          </button>
        </div>

        {/* ── Row 1: what happened, and where ─────────────────────────────────────────────── */}
        <div className="flex shrink-0 items-center gap-2.5 border-b border-white/5 px-3 py-2">
          <div className="shrink-0">{getNotificationIcon(notif.type)}</div>
          <div className="min-w-0 flex-1">
            <p
              className="truncate text-[9px] font-bold uppercase tracking-[0.16em]"
              style={{ color: accent }}
            >
              {title}
            </p>
            <p className="truncate text-xs font-bold text-white">{repoLabel}</p>
          </div>
          <span className="shrink-0 text-[10px] tabular-nums text-white/35">
            {formatRelativeTimestamp(notif.createdAt, t)}
          </span>
        </div>

        {/* ── Row 2: the pull request itself ──────────────────────────────────────────────── */}
        <div className="flex min-h-0 flex-1 items-center gap-2.5 px-3 py-2">
          <Avatar
            src={notif.authorAvatar}
            alt={notif.author}
            size={32}
            fallback={authorInitials(notif.author)}
            className="bg-white/10 ring-1 ring-white/15"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-white">{notif.prTitle}</p>
            <p className="truncate text-[11px] text-white/45">
              <span style={{ color: accent }}>@{notif.author}</span>
            </p>
          </div>
        </div>

        {/* ── Row 3: what you can do about it ─────────────────────────────────────────────── */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-white/5 px-3 py-2.5">
          <div className="flex min-w-0 items-center gap-1.5">
            <Button
              size="sm"
              data-testid="notification-popover-open"
              onClick={(e) => {
                e.stopPropagation()
                void handleActivate()
              }}
              className="h-7 truncate px-2.5 text-[11px]"
            >
              {t('notifications.popover.openInApp')}
            </Button>
            {notif.url && (
              // "GitHub" is a proper noun — untranslated, like the rest of the app's toolbars.
              <Button
                size="sm"
                variant="ghost"
                data-testid="notification-popover-github"
                onClick={(e) => {
                  e.stopPropagation()
                  void handleOpenOnGitHub()
                }}
                className="h-7 px-2.5 text-[11px] text-white/60 hover:bg-white/10 hover:text-white"
              >
                GitHub
              </Button>
            )}
          </div>
          <Badge
            variant="outline"
            className="shrink-0 border-white/15 px-2 py-0 text-[10px] font-bold tabular-nums text-white/70"
          >
            #{notif.prNumber}
          </Badge>
        </div>
      </div>
    </div>
  )
}

interface NotificationPopoverWindowProps {
  notif: AppNotification
  restX: number
  restY: number
}

export function NotificationPopoverWindow({
  notif,
  restX,
  restY,
}: NotificationPopoverWindowProps) {
  return <NotificationPopoverContent notif={notif} restX={restX} restY={restY} />
}
