import type { CSSProperties, ReactNode } from 'react'
import { cn } from '@git-manager/ui'
import type { NotchDevicePreset } from '../notchGeometry'

/**
 * A fake MacBook display to hang the notch card in.
 *
 * The card is the one surface in this app that cannot be judged in isolation: it is a black
 * rectangle that deliberately hides its own top 32 points behind a camera housing, sits half over
 * a menu bar, and glows into whatever wallpaper happens to be behind it. Reviewing it as a floating
 * component on a Storybook canvas tells you almost nothing — the questions that matter are "is
 * anything important under the notch", "does the halo read against a busy desktop", and "what does
 * this look like on a display that has no notch at all".
 *
 * The important property is the coordinate space: **children are positioned in screen points**.
 * The display renders at the preset's point resolution and the whole thing is CSS-scaled to fit,
 * so a story can drop the card at exactly the `x`/`y` that `computeNotchPlacement` returns and see
 * the real placement rather than an approximation of it.
 */

export type MacBookWallpaper = 'light' | 'dark' | 'photo'

const WALLPAPERS: Record<MacBookWallpaper, string> = {
  light: 'linear-gradient(155deg, #dbeafe 0%, #ede9fe 45%, #fef3c7 100%)',
  dark: 'linear-gradient(155deg, #0b1220 0%, #1e1b4b 50%, #172554 100%)',
  // Deliberately busy and high-contrast: the case where a soft halo disappears and a black card
  // stops having an edge. If the notification reads here, it reads anywhere.
  photo:
    'radial-gradient(circle at 18% 20%, #f97316 0%, transparent 42%),' +
    'radial-gradient(circle at 78% 12%, #22d3ee 0%, transparent 38%),' +
    'radial-gradient(circle at 62% 78%, #a855f7 0%, transparent 46%),' +
    'linear-gradient(150deg, #0f172a 0%, #134e4a 100%)',
}

export interface MacBookScreenProps {
  preset: NotchDevicePreset
  /** CSS pixels per screen point. The whole display is scaled by this; children keep point units. */
  scale?: number
  wallpaper?: MacBookWallpaper
  /** Shown at the left of the menu bar, next to the (fake) Apple menu. */
  activeAppName?: string
  /**
   * Show only part of the display, in screen points — horizontally centred, anchored to the top.
   *
   * A whole 14″ display is 982 points tall and the card occupies the first 179 of them, so at a
   * scale that fits the full screen on a canvas the notification comes out about a third of its
   * real size: too small to judge the thing the harness exists to show. Cropping to the top few
   * hundred points lets the scale go back up to 1:1 while still showing the menu bar, the camera
   * housing and enough wallpaper for the halo to have something to glow into.
   */
  viewport?: { width?: number; height?: number }
  /** Positioned in screen points inside the display. */
  children?: ReactNode
  className?: string
}

export function MacBookScreen({
  preset,
  scale = 0.55,
  wallpaper = 'photo',
  activeAppName = 'Git Manager',
  viewport,
  children,
  className,
}: MacBookScreenProps) {
  const hasNotch = preset.housingWidth > 0

  const visibleWidth = Math.min(viewport?.width ?? preset.width, preset.width)
  const visibleHeight = Math.min(viewport?.height ?? preset.height, preset.height)
  // Centred horizontally so the camera housing (and the card under it) stays in frame whatever
  // width is asked for; anchored to the top because that is where the notch is.
  const offsetX = (preset.width - visibleWidth) / 2
  const isCropped = visibleHeight < preset.height

  return (
    <div
      data-testid="macbook-screen"
      data-device={preset.id}
      className={cn('inline-block rounded-[18px] bg-neutral-900 p-2 shadow-2xl', className)}
    >
      {/* The scaled viewport. Its size is the visible point region times the scale; the display
          inside it is rendered at 1:1 points and scaled, which keeps `children` in point units. */}
      <div
        data-testid="macbook-viewport"
        className={cn(
          'relative overflow-hidden',
          isCropped ? 'rounded-t-[10px]' : 'rounded-[10px]'
        )}
        style={{ width: visibleWidth * scale, height: visibleHeight * scale }}
      >
        <div
          data-testid="macbook-display"
          className="absolute top-0 origin-top-left"
          style={{
            left: -offsetX * scale,
            width: preset.width,
            height: preset.height,
            transform: `scale(${scale})`,
            background: WALLPAPERS[wallpaper],
          }}
        >
          {/* ── Menu bar ─────────────────────────────────────────────────────────────────────
              Translucent dark strip, as macOS draws it over a wallpaper. Its two halves are laid
              out around a spacer the width of the camera housing, which is exactly how the real
              bar avoids putting menu titles behind the notch. */}
          <div
            data-testid="macbook-menu-bar"
            aria-hidden="true"
            className="absolute inset-x-0 top-0 flex items-center bg-black/45 text-white backdrop-blur-sm"
            style={{ height: preset.menuBarHeight }}
          >
            <div className="flex min-w-0 flex-1 items-center gap-4 pl-4 text-[13px]">
              <span aria-hidden="true"></span>
              <span className="font-semibold">{activeAppName}</span>
              <span className="opacity-70">File</span>
              <span className="opacity-70">Edit</span>
              <span className="opacity-70">View</span>
              <span className="opacity-70">Window</span>
            </div>
            {hasNotch && <div style={{ width: preset.housingWidth }} className="shrink-0" />}
            <div className="flex min-w-0 flex-1 items-center justify-end gap-4 pr-4 text-[13px]">
              {/* The app's own tray icon: what the popover anchors under in the real thing, so a
                  story can see whether the card lines up with where the user's eye already is. */}
              <span
                data-testid="macbook-tray-icon"
                className="inline-block h-3.5 w-3.5 rounded-[3px] bg-white/80"
              />
              <span className="opacity-70">100%</span>
              <span className="tabular-nums opacity-90">Wed 14:32</span>
            </div>
          </div>

          {/* ── Camera housing ───────────────────────────────────────────────────────────────
              Opaque black, on top of everything: whatever a card draws in this rectangle is
              physically invisible on a real machine, and the harness is only honest if it hides it
              here too. Drawn above `children` in the stacking order for that reason. */}
          {hasNotch && (
            <div
              data-testid="macbook-notch"
              aria-hidden="true"
              className="absolute left-1/2 top-0 z-10 -translate-x-1/2 rounded-b-[10px] bg-black"
              style={{ width: preset.housingWidth, height: preset.safeAreaTop }}
            >
              <span className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-neutral-800" />
            </div>
          )}

          {children}
        </div>

        {/* Signals that the display continues past the bottom of the frame, so a cropped view
            doesn't read as a laptop with a strangely short screen. */}
        {isCropped && (
          <div
            aria-hidden="true"
            data-testid="macbook-crop-fade"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-b from-transparent to-neutral-900"
          />
        )}
      </div>
    </div>
  )
}

/**
 * Positions a notch surface inside {@link MacBookScreen}, in screen points.
 *
 * The counterpart of the app's OS window: it is the element a `createElementNotchHost` moves, so a
 * story exercises the same enter/exit sequence the real window does — including the part where the
 * surface is parked above its resting spot and only then revealed.
 */
export function MacBookSurface({
  x,
  width,
  height,
  children,
  surfaceRef,
}: {
  x: number
  width: number
  height: number
  children: ReactNode
  surfaceRef?: (element: HTMLDivElement | null) => void
}) {
  return (
    <div
      ref={surfaceRef}
      data-testid="macbook-surface"
      // Starts hidden at y=0; the host reveals it and drives `top`, exactly as the real window is
      // created invisible and positioned before its first paint.
      style={{ left: x, top: 0, width, height, visibility: 'hidden' } as CSSProperties}
      className="absolute"
    >
      {children}
    </div>
  )
}
