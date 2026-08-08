import type { z } from 'zod'
import { SECTION_SCHEMAS, type ConfigSection } from './sections'
import { SETTINGS_GROUP_SCHEMAS } from './settingsSchema'

/**
 * Validates one section of the configuration file, repairing rather than rejecting.
 *
 * The rule everywhere here: **a value that doesn't validate is treated as absent**, never as fatal
 * and never as a reason to discard its neighbours. An absent section (or settings group) is exactly
 * what a fresh install has, and every store already knows how to fill that from its defaults — so
 * the worst a corrupt field can do is reset the thing it belongs to.
 *
 * `settings` is repaired one group finer, because it is the section that holds thirteen unrelated
 * things: a mistyped `fontSize` costs the appearance group, not the AI provider, the GitHub account
 * and the per-repository overrides.
 *
 * What comes back is the **raw** value, not zod's parsed output. Parsing would strip every key the
 * schema doesn't name — which is precisely the fields a newer version of the app added — turning an
 * older build merely reading the file into an older build silently deleting from it.
 */

export interface SectionValidation {
  /** The value to hand the store, or `undefined` when nothing usable was left. */
  value: unknown
  /** Human-readable reasons, one per dropped group/section. Empty when the section was clean. */
  problems: string[]
}

function describe(error: z.ZodError): string {
  return error.issues
    .slice(0, 3)
    .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('; ')
}

export function validateSection(section: ConfigSection, raw: unknown): SectionValidation {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      value: undefined,
      problems: raw === undefined ? [] : [`"${section}" is not an object — ignored`],
    }
  }

  if (section === 'settings') return validateSettings(raw as Record<string, unknown>)

  const result = SECTION_SCHEMAS[section].safeParse(raw)
  return result.success
    ? { value: raw, problems: [] }
    : {
        value: undefined,
        problems: [`"${section}" does not match its schema (${describe(result.error)}) — reset`],
      }
}

function validateSettings(raw: Record<string, unknown>): SectionValidation {
  const kept: Record<string, unknown> = {}
  const problems: string[] = []

  for (const [key, value] of Object.entries(raw)) {
    const schema = SETTINGS_GROUP_SCHEMAS[key as keyof typeof SETTINGS_GROUP_SCHEMAS]
    // A group this version doesn't know is kept untouched: it belongs to a newer build, and
    // dropping it would make an older one destroy a setting simply by having been launched.
    if (!schema) {
      kept[key] = value
      continue
    }
    const result = schema.safeParse(value)
    if (result.success) kept[key] = value
    else problems.push(`settings.${key} is invalid (${describe(result.error)}) — reset to defaults`)
  }

  return { value: kept, problems }
}
