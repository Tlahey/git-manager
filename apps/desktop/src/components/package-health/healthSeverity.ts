import { AlertTriangle, CheckCircle2, MinusCircle, XCircle } from 'lucide-react'
import type { AlertVariant, BadgeProps } from '@git-manager/ui'
import type { HealthCheck, HealthSeverity } from '@git-manager/git-types'

/**
 * How each severity is drawn, in one place so the panel's rows and the center's
 * report can never disagree about what "warning" looks like. Labels are i18n
 * **keys** — a module-level map can't call `t()`.
 */
export const SEVERITY_PRESENTATION: Record<
  HealthSeverity,
  {
    icon: typeof CheckCircle2
    labelKey: string
    badge: NonNullable<BadgeProps['variant']>
    alert: AlertVariant
    /** Icon tint; the shared tone tokens keep it APCA-clean on every surface. */
    className: string
  }
> = {
  ok: {
    icon: CheckCircle2,
    labelKey: 'health.severity.ok',
    badge: 'success',
    alert: 'success',
    className: 'text-tone-success',
  },
  warning: {
    icon: AlertTriangle,
    labelKey: 'health.severity.warning',
    badge: 'warning',
    alert: 'warning',
    className: 'text-tone-warning',
  },
  error: {
    icon: XCircle,
    labelKey: 'health.severity.error',
    badge: 'destructive',
    alert: 'destructive',
    className: 'text-tone-danger',
  },
  skipped: {
    icon: MinusCircle,
    labelKey: 'health.severity.skipped',
    badge: 'outline',
    alert: 'info',
    className: 'text-muted-foreground',
  },
}

/** Checks that found something the user should act on. */
export function failingChecks(checks: HealthCheck[]) {
  return checks.filter((check) => check.severity === 'warning' || check.severity === 'error')
}
