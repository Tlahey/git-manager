import type { CSSProperties } from 'react'
import { Sparkles } from 'lucide-react'
import { Avatar, Progress, cn } from '@git-manager/ui'
import { NOTCH_ROW, NOTCH_ROW_PADDING_X, statusOutputHeight } from '../notchGeometry'
import { NOTCH_TONE_RGB, toneColor } from '../notchTones'
import { tierColor } from '../notchRewardTiers'
import { NotchTierMedal } from './NotchTierMedal'
import {
  STATUS_OUTPUT_MAX_LINES,
  type NotchEventModel,
  type NotchModel,
  type NotchProgressModel,
  type NotchRewardModel,
  type NotchStatusModel,
} from '../types'

/**
 * Row 2 — the only row that differs between kinds.
 *
 * The four bodies live together because they are the same slot rendered four ways, and reading them
 * side by side is how you can tell they stay consistent (same paddings, same type scale, same
 * truncation). Each sizes itself from `NOTCH_ROW`, so the window's height and the card's actual
 * layout can't disagree.
 */

/** Something happened: a face, a title, and who it was. */
export function NotchEventBody({ model }: { model: NotchEventModel }) {
  return (
    <div
      data-testid="notch-event-body"
      style={{ height: NOTCH_ROW.eventBody }}
      className="flex shrink-0 items-center gap-2.5 px-3"
    >
      {model.avatar && (
        <Avatar
          src={model.avatar.src}
          alt={model.avatar.alt}
          size={32}
          fallback={model.avatar.fallback}
          // The producer's tint when it has one (the app hashes the author's name into the same
          // gradient the commit graph uses), otherwise a neutral disc. Either way the initials are
          // the fallback — a card with no picture must not borrow someone else's.
          className={cn(model.avatar.fallbackClassName ?? 'bg-white/10', 'ring-1 ring-white/15')}
        />
      )}
      <div className="min-w-0 flex-1">
        <p data-testid="notch-title" className="truncate text-xs font-semibold text-white">
          {model.title}
        </p>
        {model.subtitle !== undefined && (
          <p
            data-testid="notch-subtitle"
            className="truncate text-[11px]"
            style={{ color: toneColor(model.tone) }}
          >
            {model.subtitle}
          </p>
        )}
      </div>
    </div>
  )
}

/** Something is running: a title, a bar, and a count. */
export function NotchProgressBody({ model }: { model: NotchProgressModel }) {
  const indeterminate = model.ratio === undefined
  const percent =
    model.ratio === undefined ? 0 : Math.round(Math.max(0, Math.min(1, model.ratio)) * 100)

  return (
    <div
      data-testid="notch-progress-body"
      style={{ height: NOTCH_ROW.progressBody }}
      className="flex shrink-0 flex-col justify-center gap-1.5 px-3"
    >
      <div className="flex items-baseline justify-between gap-2">
        <p data-testid="notch-title" className="truncate text-xs font-semibold text-white">
          {model.title}
        </p>
        {!indeterminate && (
          <span
            data-testid="notch-progress-percent"
            className="shrink-0 text-[10px] text-white/45 tabular-nums"
          >
            {percent}%
          </span>
        )}
      </div>
      <Progress
        value={percent}
        indeterminate={indeterminate}
        aria-label={model.title}
        className="h-1 bg-white/10"
        // The fill reads the tone off a custom property set on the track, because `Progress` only
        // takes a *class* for its indicator — there is no style hook on the inner element.
        indicatorClassName="bg-[rgb(var(--notch-tone-rgb))]"
        style={{ '--notch-tone-rgb': NOTCH_TONE_RGB[model.tone] } as CSSProperties}
      />
      {model.detail !== undefined && (
        <p data-testid="notch-progress-detail" className="truncate text-[10px] text-white/40">
          {model.detail}
        </p>
      )}
    </div>
  )
}

/** Something finished: the outcome, and the tail of what it printed. */
export function NotchStatusBody({ model }: { model: NotchStatusModel }) {
  const lines = (model.outputLines ?? []).slice(-STATUS_OUTPUT_MAX_LINES)

  return (
    <>
      <div
        data-testid="notch-status-body"
        style={{ height: NOTCH_ROW.statusBody }}
        className="flex shrink-0 items-center px-3"
      >
        <p data-testid="notch-title" className="truncate text-xs font-semibold text-white">
          {model.title}
        </p>
      </div>
      {lines.length > 0 && (
        <pre
          data-testid="notch-status-output"
          style={{
            height: statusOutputHeight(lines.length),
            lineHeight: `${NOTCH_ROW.statusOutputLine}px`,
          }}
          // `py-1.5` is `statusOutputHeight`'s padding term: border-box takes it out of the height,
          // leaving exactly `lines × statusOutputLine` for the text itself.
          className="mx-3 overflow-hidden py-1.5 font-mono text-[10px] whitespace-pre text-white/40"
        >
          {lines.join('\n')}
        </pre>
      )}
    </>
  )
}

/**
 * Something was unlocked: a medal, what it was, what earned it, and what it grants.
 *
 * Three lines of text where the event body has two, which is what makes this the tallest body — and
 * the reason it gets a row height of its own rather than borrowing the event's. The medal takes the
 * avatar's slot: the subject of a reward is the user, and there is no face to show.
 */
export function NotchRewardBody({ model }: { model: NotchRewardModel }) {
  return (
    <div
      data-testid="notch-reward-body"
      // `paddingInline` from the shared figure rather than `px-3`, because the confetti's origin is
      // computed from it — see `rewardConfettiOrigin`.
      style={{ height: NOTCH_ROW.rewardBody, paddingInline: NOTCH_ROW_PADDING_X }}
      className="flex shrink-0 items-center gap-3"
    >
      <NotchTierMedal tier={model.tier} />
      <div className="min-w-0 flex-1">
        <p data-testid="notch-title" className="truncate text-xs font-semibold text-white">
          {model.title}
        </p>
        {model.description !== undefined && (
          <p
            data-testid="notch-reward-description"
            className="truncate text-[10px] leading-normal text-white/45"
          >
            {model.description}
          </p>
        )}
        {model.reward !== undefined && (
          <p
            data-testid="notch-reward-gain"
            className="flex items-center gap-1 text-[10px] leading-normal font-semibold"
            // The tier's colour, not the tone's: what the reward *is* belongs to the medal beside it,
            // and the tone is already spoken for by the eyebrow above.
            style={{ color: tierColor(model.tier) }}
          >
            <Sparkles className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{model.reward}</span>
          </p>
        )}
      </div>
    </div>
  )
}

/** Picks the body for a model. Exhaustive by construction — a new kind fails to compile here. */
export function NotchBody({ model }: { model: NotchModel }) {
  switch (model.kind) {
    case 'event':
      return <NotchEventBody model={model} />
    case 'progress':
      return <NotchProgressBody model={model} />
    case 'status':
      return <NotchStatusBody model={model} />
    case 'reward':
      return <NotchRewardBody model={model} />
  }
}
