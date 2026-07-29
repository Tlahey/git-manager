import type { HealthCheckId, HealthFinding } from '@git-manager/git-types'

type Translate = (key: string, options?: Record<string, unknown>) => string

/**
 * Turns a structured finding into one translated line.
 *
 * The backend deliberately sends no prose — only the check `id` and the finding's
 * `actual`/`expected` — so every sentence the user reads is composed here and a new
 * locale needs no Rust change. Each check reads its fields differently, hence the
 * switch rather than one generic template.
 */
export function describeFinding(
  checkId: HealthCheckId,
  finding: HealthFinding,
  t: Translate
): string {
  const { actual, expected } = finding

  switch (checkId) {
    case 'versionAlignment':
      return t('health.finding.ranges', { ranges: actual ?? '' })

    case 'missingInstall':
      return t('health.finding.notInstalled', { expected: expected ?? '' })

    case 'rangeMismatch':
      return t('health.finding.installed', { actual: actual ?? '', expected: expected ?? '' })

    case 'packageManagerField':
      return actual == null
        ? t('health.finding.managerMissing', { expected: expected ?? '' })
        : t('health.finding.managerMismatch', { actual, expected: expected ?? '' })

    // The fix is always the same word regardless of the versions, so this says what
    // to write rather than contrasting two ranges — which read as a no-op whenever
    // the declared range and the catalog's happened to be identical.
    case 'catalogDrift':
      return t('health.finding.useCatalog', { actual: actual ?? '', expected: expected ?? '' })

    case 'workspaceProtocol':
      return t('health.finding.actualExpected', { actual: actual ?? '', expected: expected ?? '' })

    // duplicateDependency says everything through its two refs; adding a sentence
    // would only repeat the rows underneath it.
    case 'duplicateDependency':
      return ''
  }
}
