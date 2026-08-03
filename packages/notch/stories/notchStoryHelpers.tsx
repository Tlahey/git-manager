import { useMemo, useRef, type ReactNode } from 'react'
import {
  computeNotchPlacement,
  createElementNotchHost,
  getDevicePreset,
  MacBookScreen,
  MacBookSurface,
  measureCardHeight,
  NotchNotification,
  useNotchPresenter,
  type MacBookWallpaper,
  type NotchDevicePreset,
  type NotchModel,
} from '../src'

/**
 * The furniture every notch story shares.
 *
 * Two ways to put a card on the fake screen, and they are deliberately different:
 *
 * - {@link StaticNotch} paints it where it lands, for comparing devices and tones side by side
 *   without a dozen animations fighting for attention.
 * - {@link PresentedNotch} runs the real {@link useNotchPresenter} against a DOM host, so the
 *   entrance, the auto-dismiss, hover-to-pause and the exit all actually happen — the behaviour
 *   that had no way of being observed at all before this package existed.
 */

export const DEVICES: NotchDevicePreset[] = [
  getDevicePreset('mbp-14')!,
  getDevicePreset('mbp-16')!,
  getDevicePreset('mba-13')!,
  getDevicePreset('external')!,
]

export const CLOSE_LABEL = 'Close'
export const PRODUCT_NAME = 'Git Manager'

/**
 * How much of the display to show, in points.
 *
 * The card lives in the first ~180 points of a display that is 982 tall, so showing the whole
 * screen means shrinking the thing you came to look at. Cropping to the top is what lets the zoom
 * go up while the menu bar, the camera housing and enough wallpaper for the halo stay in frame.
 */
export const DEFAULT_VIEWPORT_HEIGHT = 380

export function placementFor(preset: NotchDevicePreset, model: NotchModel) {
  return computeNotchPlacement({
    screenWidth: preset.width,
    cardHeight: measureCardHeight(model),
    // Flush with the very top of the display, which is where the real card sits: its first band is
    // behind the camera housing by design.
    topY: 0,
  })
}

export interface NotchStageProps {
  preset: NotchDevicePreset
  wallpaper?: MacBookWallpaper
  scale?: number
  viewportWidth?: number
  viewportHeight?: number
}

/** A card frozen at its resting position — no host, no timers. */
export function StaticNotch({
  model,
  icon,
  preset,
  wallpaper = 'photo',
  scale = 0.8,
  viewportWidth,
  viewportHeight = DEFAULT_VIEWPORT_HEIGHT,
}: NotchStageProps & { model: NotchModel; icon?: ReactNode }) {
  const { window: win } = placementFor(preset, model)
  return (
    <MacBookScreen
      preset={preset}
      wallpaper={wallpaper}
      scale={scale}
      viewport={{
        ...(viewportWidth !== undefined ? { width: viewportWidth } : {}),
        height: viewportHeight,
      }}
    >
      <div
        className="absolute"
        style={{ left: win.x, top: win.y, width: win.width, height: win.height }}
      >
        <NotchNotification
          model={model}
          visible
          productName={PRODUCT_NAME}
          closeLabel={CLOSE_LABEL}
          onAction={() => {}}
          onDismiss={() => {}}
          {...(icon !== undefined ? { icon } : {})}
        />
      </div>
    </MacBookScreen>
  )
}

export interface PresentedNotchProps {
  model: NotchModel
  preset: NotchDevicePreset
  autoDismissMs: number | null
  /** Runs once the exit animation is done — where a queue promotes the next card. */
  onClosed: () => void
  onEvent: (line: string) => void
  icon?: ReactNode
}

/**
 * One card, driven by the real presenter, inside a screen the caller renders around it.
 *
 * Mounting it is what starts the entrance, so a story triggers a notification by giving this a new
 * `key` — the same way the app creates a fresh window per card.
 */
export function PresentedNotch({
  model,
  preset,
  autoDismissMs,
  onClosed,
  onEvent,
  icon,
}: PresentedNotchProps) {
  const surfaceRef = useRef<HTMLDivElement | null>(null)
  const { window: win } = placementFor(preset, model)

  const host = useMemo(
    () => createElementNotchHost({ element: () => surfaceRef.current, onClose: onClosed }),
    [onClosed]
  )

  const presenter = useNotchPresenter({ host, restY: win.y, autoDismissMs })

  return (
    <MacBookSurface
      x={win.x}
      width={win.width}
      height={win.height}
      surfaceRef={(element) => {
        surfaceRef.current = element
      }}
    >
      <NotchNotification
        model={model}
        visible={presenter.visible}
        productName={PRODUCT_NAME}
        closeLabel={CLOSE_LABEL}
        onAction={(id) => onEvent(`action “${id}”`)}
        onActivate={() => onEvent('card activated')}
        onDismiss={presenter.dismiss}
        onPointerEnter={() => {
          presenter.pauseAutoDismiss()
          onEvent('countdown paused')
        }}
        onPointerLeave={() => {
          presenter.resumeAutoDismiss()
          onEvent('countdown resumed')
        }}
        {...(icon !== undefined ? { icon } : {})}
      />
    </MacBookSurface>
  )
}

// ── Story chrome ───────────────────────────────────────────────────────────────────────────────
// Hand-rolled rather than Storybook args: this Storybook runs with no addons (same as
// packages/mascot), so there is no Controls panel to put them in.

export function StoryButton({
  onClick,
  children,
  tone = 'default',
}: {
  onClick: () => void
  children: ReactNode
  tone?: 'default' | 'quiet'
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        tone === 'quiet'
          ? 'rounded-md border border-neutral-700 px-3 py-1.5 text-xs font-semibold text-neutral-300 hover:bg-neutral-800'
          : 'rounded-md bg-neutral-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-neutral-700'
      }
    >
      {children}
    </button>
  )
}

export function StorySelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-neutral-400">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-200"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}
