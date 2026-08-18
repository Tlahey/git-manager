import { toast } from '@git-manager/ui'
import { i18next } from '@git-manager/i18n'

/**
 * What is being copied, named in the confirmation toast.
 *
 * A closed union rather than a free-form label: the caller cannot pass raw English text (which is
 * how this helper used to leak untranslatable copy into the UI), and adding a new kind is one entry
 * here plus one key in each locale.
 */
export type CopyKind = 'sha' | 'path' | 'text'

const KIND_KEYS: Record<CopyKind, string> = {
  sha: 'clipboard.what.sha',
  path: 'clipboard.what.path',
  text: 'clipboard.what.text',
}

/**
 * Copies `value` to the clipboard and confirms with a toast (or reports failure).
 *
 * Reads the copy off `i18next` directly rather than a `t` from `useTranslation`: this is a plain
 * function called from event handlers, not a hook, so it has no component to take a `t` from — and
 * threading one through every call site would only move the same lookup outwards.
 */
export function copyWithToast(value: string, kind: CopyKind) {
  const what = i18next.t(KIND_KEYS[kind], { ns: 'git' })
  navigator.clipboard.writeText(value).then(
    () => toast.success(i18next.t('clipboard.copied', { ns: 'git', what }), { description: value }),
    () => toast.error(i18next.t('clipboard.copyFailed', { ns: 'git', what }))
  )
}
