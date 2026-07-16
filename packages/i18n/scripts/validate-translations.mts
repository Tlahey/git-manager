#!/usr/bin/env node
// Validates that every i18next `t(...)` key referenced in the app's source actually exists in
// every locale's JSON file, and that all locales define the same set of keys per namespace.
// Run via `pnpm validate:i18n` (see package.json / turbo.json).
//
// Deliberately dependency-free (no TypeScript compiler API): this repo pins `typescript@^7.0.2`,
// the native/Go-based preview, whose default export no longer exposes the classic
// createSourceFile/SyntaxKind AST API used by tooling — only `typescript/unstable/ast`, an
// explicitly unstable surface not worth depending on here. A small hand-rolled scanner over the
// handful of i18next call shapes actually used in this codebase is more robust to that churn.
// Runs directly via Node's built-in TypeScript type-stripping (no ts-node/tsx needed).

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '../../..')
const localesRoot = path.resolve(__dirname, '..', 'locales')
const defaultNamespace = 'common' // must match `defaultNS` in packages/i18n/src/index.ts

// i18next resolves a base key against these CLDR plural suffixes when `{ count }` is passed,
// so a key present only as e.g. `foo_one` / `foo_other` is valid even though `foo` itself isn't.
const PLURAL_SUFFIXES = ['_zero', '_one', '_two', '_few', '_many', '_other']

const SCAN_ROOT_DIRS = ['apps', 'packages']
const EXCLUDED_DIR_NAMES = new Set([
  'node_modules',
  'dist',
  'build',
  '.turbo',
  'src-tauri',
  '.storybook',
  'target',
])
const SOURCE_FILE_PATTERN = /\.(tsx?|jsx?)$/
const EXCLUDED_FILE_PATTERN = /\.(test|spec|stories)\.[tj]sx?$/

type KeysByLangNs = Record<string, Record<string, Set<string>>>

interface Locales {
  languages: string[]
  namespaces: Set<string>
  keysByLangNs: KeysByLangNs
}

interface ValidationError {
  file: string
  line: number
  message: string
}

/** Bound namespace(s) for a `t`-like local identifier; `null` means the namespace arg to
 * `useTranslation(...)` was itself dynamic and can't be resolved statically. */
type Bindings = Map<string, string[] | null>

interface ResolvedNamespace {
  ns: string
  key: string | null
}

interface LooseKeyLiteral {
  isTemplate: boolean
  value: string
  raw?: string
  index: number
}

function loadLocales(): Locales {
  const languages = fs
    .readdirSync(localesRoot)
    .filter((entry) => fs.statSync(path.join(localesRoot, entry)).isDirectory())
    .sort()

  const namespaces = new Set<string>()
  const keysByLangNs: KeysByLangNs = {}

  for (const lang of languages) {
    keysByLangNs[lang] = {}
    const langDir = path.join(localesRoot, lang)
    for (const file of fs.readdirSync(langDir)) {
      if (!file.endsWith('.json')) continue
      const ns = file.slice(0, -'.json'.length)
      namespaces.add(ns)
      const content = JSON.parse(fs.readFileSync(path.join(langDir, file), 'utf8'))
      keysByLangNs[lang][ns] = new Set(Object.keys(content))
    }
  }

  return { languages, namespaces, keysByLangNs }
}

function hasKey(keysByLangNs: KeysByLangNs, lang: string, ns: string, key: string): boolean {
  const set = keysByLangNs[lang]?.[ns]
  if (!set) return false
  if (set.has(key)) return true
  return PLURAL_SUFFIXES.some((suffix) => set.has(key + suffix))
}

function collectSourceFiles(): string[] {
  const results: string[] = []
  function walk(dir: string) {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (EXCLUDED_DIR_NAMES.has(entry.name)) continue
        walk(full)
      } else if (entry.isFile()) {
        if (!SOURCE_FILE_PATTERN.test(entry.name)) continue
        if (EXCLUDED_FILE_PATTERN.test(entry.name)) continue
        if (entry.name.endsWith('.d.ts')) continue
        results.push(full)
      }
    }
  }
  for (const rootDirName of SCAN_ROOT_DIRS) {
    walk(path.join(repoRoot, rootDirName))
  }
  return results
}

function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function lineAt(text: string, index: number): number {
  let line = 1
  for (let i = 0; i < index; i++) {
    if (text.charCodeAt(i) === 10) line++
  }
  return line
}

// Scans forward from just past a call's opening '(' to find the index of its matching ')',
// treating quoted/template string contents as opaque so parens inside them (or inside nested
// calls in an argument, e.g. `items.filter(x => x.active).length`) don't throw off the depth.
function findMatchingParenEnd(text: string, startIdx: number): number {
  let depth = 1
  let i = startIdx
  let inString: string | null = null
  while (i < text.length && depth > 0) {
    const ch = text[i]
    if (inString) {
      if (ch === '\\') {
        i += 2
        continue
      }
      if (ch === inString) inString = null
      i++
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inString = ch
      i++
      continue
    }
    if (ch === '(') depth++
    else if (ch === ')') depth--
    i++
  }
  return i - 1 // index of the matching ')'
}

// Parses a single-quoted/double-quoted string literal starting at text[startIdx] (the opening
// quote), returning its unescaped value and the index just past the closing quote.
function parseStringLiteral(text: string, startIdx: number): { value: string; endIdx: number } {
  const quote = text[startIdx]
  let i = startIdx + 1
  let value = ''
  while (i < text.length && text[i] !== quote) {
    if (text[i] === '\\') {
      value += text[i + 1]
      i += 2
    } else {
      value += text[i]
      i++
    }
  }
  return { value, endIdx: i + 1 }
}

// Parses a template literal starting at text[startIdx] (the opening backtick). Returns the
// static "head" text before the first `${`, whether it has any substitutions, and the index
// just past the closing backtick. Doesn't attempt to parse nested expressions inside `${...}`.
function parseTemplateLiteral(
  text: string,
  startIdx: number,
): { head: string; hasSubstitution: boolean; endIdx: number } {
  let i = startIdx + 1
  let head = ''
  let sawHead = false
  let hasSubstitution = false
  while (i < text.length && text[i] !== '`') {
    if (text[i] === '\\') {
      if (!sawHead) head += text[i + 1]
      i += 2
      continue
    }
    if (text[i] === '$' && text[i + 1] === '{') {
      hasSubstitution = true
      sawHead = true
      let depth = 1
      i += 2
      while (i < text.length && depth > 0) {
        if (text[i] === '{') depth++
        else if (text[i] === '}') depth--
        i++
      }
      continue
    }
    if (!sawHead) head += text[i]
    i++
  }
  return { head, hasSubstitution, endIdx: i + 1 }
}

// Mirrors findMatchingParenEnd for `{`/`}`, used to isolate a `label: { ... }` object's text.
function findMatchingBraceEnd(text: string, startIdx: number): number {
  let depth = 1
  let i = startIdx
  let inString: string | null = null
  while (i < text.length && depth > 0) {
    const ch = text[i]
    if (inString) {
      if (ch === '\\') {
        i += 2
        continue
      }
      if (ch === inString) inString = null
      i++
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inString = ch
      i++
      continue
    }
    if (ch === '{') depth++
    else if (ch === '}') depth--
    i++
  }
  return i - 1
}

// Beyond `t('key')`, this codebase also stashes translation keys in data descriptors and reads
// them back through a dynamic property the primary scan can't resolve — e.g.
// `{ labelKey: 'gitTree.columns.refs' }` consumed later as `t(col.labelKey)` (columns.ts /
// prState.ts / themes.ts / waterlineBuckets.ts), and `label: { key: 'undoRedo.commit', params }`
// consumed as `t(undoLabel.key, undoLabel.params)` (ActionToolbar.tsx via git.api.ts). Since the
// namespace can't be traced across files with this approach, these are validated against the
// union of all namespaces' keys rather than one specific namespace.
function collectLooseKeyLiterals(text: string): LooseKeyLiteral[] {
  const found: LooseKeyLiteral[] = []

  const labelKeyRegex = /\blabelKey\s*:\s*(['"`])/g
  let match: RegExpExecArray | null
  while ((match = labelKeyRegex.exec(text))) {
    const quote = match[1]
    const literalStart = match.index + match[0].length - 1
    if (quote === '`') {
      const { head, hasSubstitution, endIdx } = parseTemplateLiteral(text, literalStart)
      found.push({ isTemplate: hasSubstitution, value: head, raw: text.slice(literalStart, endIdx), index: match.index })
    } else {
      const { value } = parseStringLiteral(text, literalStart)
      found.push({ isTemplate: false, value, index: match.index })
    }
  }

  const labelObjRegex = /\blabel\s*:\s*\{/g
  while ((match = labelObjRegex.exec(text))) {
    const braceStart = match.index + match[0].length - 1
    const braceEnd = findMatchingBraceEnd(text, braceStart + 1)
    const objText = text.slice(braceStart + 1, braceEnd)
    const keyPropMatch = objText.match(/\bkey\s*:\s*([\s\S]*?)(?:,\s*params\b|$)/)
    if (!keyPropMatch) continue
    // The key's value is either a plain string literal or a ternary of two string literals
    // (`kind === 'autosquash' ? 'undoRedo.autosquash' : 'undoRedo.interactiveRebase'`) — only
    // pull literals from those positions, not from an unrelated comparison in the condition.
    const keyExprText = keyPropMatch[1].trim()
    const ternaryMatch = keyExprText.match(/\?\s*(['"])((?:\\.|(?!\1).)*)\1\s*:\s*(['"])((?:\\.|(?!\3).)*)\3\s*$/)
    const plainMatch = keyExprText.match(/^(['"])((?:\\.|(?!\1).)*)\1$/)
    const literalValues = ternaryMatch ? [ternaryMatch[2], ternaryMatch[4]] : plainMatch ? [plainMatch[2]] : []
    for (const value of literalValues) {
      found.push({ isTemplate: false, value, index: match.index })
    }
  }

  return found
}

function checkLooseKeyLiteral(
  literal: LooseKeyLiteral,
  relPath: string,
  line: number,
  languages: string[],
  keysByLangNs: KeysByLangNs,
  errors: ValidationError[],
) {
  for (const lang of languages) {
    const namespacesForLang = keysByLangNs[lang]
    let foundInAny: boolean
    if (literal.isTemplate && literal.raw) {
      const pattern = new RegExp(
        '^' + literal.raw.slice(1, -1).split(/\$\{[^}]*\}/).map(escapeRegExp).join('.*') + '$',
      )
      foundInAny = Object.values(namespacesForLang).some((set) => [...set].some((key) => pattern.test(key)))
    } else {
      foundInAny = Object.keys(namespacesForLang).some((ns) => hasKey(keysByLangNs, lang, ns, literal.value))
    }
    if (!foundInAny) {
      errors.push({
        file: relPath,
        line,
        message: `Missing translation key '${literal.value}' for language '${lang}' (indirect labelKey/label.key reference)`,
      })
    }
  }
}

function parseUseTranslationBindings(text: string): Bindings {
  // e.g. `const { t } = useTranslation('git')`, `const { t: tGit } = useTranslation(['a','b'])`
  const bindingRegex = /const\s*\{\s*([^}]+?)\s*\}\s*=\s*useTranslation\(([^)]*)\)/g
  const bindings: Bindings = new Map()
  let match: RegExpExecArray | null
  while ((match = bindingRegex.exec(text))) {
    const [, destructured, nsArg] = match
    let tLocalName: string | null = null
    for (const part of destructured.split(',')) {
      const trimmed = part.trim()
      if (trimmed === 't') tLocalName = 't'
      else {
        const aliasMatch = trimmed.match(/^t\s*:\s*(\w+)$/)
        if (aliasMatch) tLocalName = aliasMatch[1]
      }
    }
    if (!tLocalName) continue

    const trimmedNsArg = nsArg.trim()
    let namespaces: string[] | null
    if (trimmedNsArg === '') {
      namespaces = [defaultNamespace]
    } else if (trimmedNsArg.startsWith('[')) {
      namespaces = [...trimmedNsArg.matchAll(/['"]([^'"]*)['"]/g)].map((m) => m[1])
    } else {
      const literalMatch = trimmedNsArg.match(/^['"]([^'"]*)['"]$/)
      namespaces = literalMatch ? [literalMatch[1]] : null // dynamic namespace, can't resolve
    }
    bindings.set(tLocalName, namespaces)
  }
  return bindings
}

function extractNsOption(argsText: string): string | null {
  const match = argsText.match(/\bns\s*:\s*(['"])([^'"]*)\1/)
  return match ? match[2] : null
}

function resolveEffectiveNamespace(
  namespaces: string[] | null,
  nsOverride: string | null,
  keyHead: string,
  allNamespaces: Set<string>,
): ResolvedNamespace | null {
  if (nsOverride) return { ns: nsOverride, key: null }
  if (keyHead.includes(':')) {
    const [prefix, ...rest] = keyHead.split(':')
    if (allNamespaces.has(prefix)) return { ns: prefix, key: rest.join(':') }
  }
  if (!namespaces) return null // dynamic namespace, can't resolve statically
  return { ns: namespaces[0], key: null }
}

function checkKeyAgainstNamespace(
  resolved: ResolvedNamespace,
  keyArg: string,
  relPath: string,
  line: number,
  allNamespaces: Set<string>,
  languages: string[],
  keysByLangNs: KeysByLangNs,
  errors: ValidationError[],
) {
  const ns = resolved.ns
  const key = resolved.key ?? keyArg
  if (!allNamespaces.has(ns)) {
    errors.push({ file: relPath, line, message: `Unknown namespace '${ns}' referenced for key '${key}'` })
    return
  }
  for (const lang of languages) {
    if (!hasKey(keysByLangNs, lang, ns, key)) {
      errors.push({ file: relPath, line, message: `Missing translation key '${ns}:${key}' for language '${lang}'` })
    }
  }
}

function checkDynamicKey(
  resolved: ResolvedNamespace,
  rawTemplate: string,
  relPath: string,
  line: number,
  languages: string[],
  keysByLangNs: KeysByLangNs,
  errors: ValidationError[],
) {
  const ns = resolved.ns
  // Build a regex from the template's literal spans, turning each `${...}` into a wildcard.
  const pattern = new RegExp(
    '^' +
      rawTemplate
        .slice(1, -1) // strip backticks
        .split(/\$\{[^}]*\}/)
        .map(escapeRegExp)
        .join('.*') +
      '$',
  )
  for (const lang of languages) {
    const set = keysByLangNs[lang]?.[ns]
    if (!set) continue
    const matches = [...set].some((key) => pattern.test(key))
    if (!matches) {
      errors.push({
        file: relPath,
        line,
        message: `Dynamic key pattern in namespace '${ns}' matches no entries for language '${lang}' (from template literal)`,
      })
    }
  }
}

function analyzeFile(filePath: string, locales: Locales): ValidationError[] {
  const { languages, namespaces: allNamespaces, keysByLangNs } = locales
  const text = fs.readFileSync(filePath, 'utf8')
  const relPath = path.relative(repoRoot, filePath)
  const errors: ValidationError[] = []

  for (const literal of collectLooseKeyLiterals(text)) {
    checkLooseKeyLiteral(literal, relPath, lineAt(text, literal.index), languages, keysByLangNs, errors)
  }

  const bindings = parseUseTranslationBindings(text)
  if (bindings.size === 0) return errors

  const localNames = [...bindings.keys()].map(escapeRegExp).join('|')
  const callRegex = new RegExp(`\\b(?:${localNames})\\(`, 'g')

  let match: RegExpExecArray | null
  while ((match = callRegex.exec(text))) {
    const callOpenParenIdx = match.index + match[0].length - 1
    const calleeName = match[0].slice(0, -1)
    const namespaces = bindings.get(calleeName) ?? null

    const argsEndIdx = findMatchingParenEnd(text, callOpenParenIdx + 1)

    const firstArgStart = callOpenParenIdx + 1
    const firstChar = text[firstArgStart]
    const line = lineAt(text, match.index)

    if (firstChar === '"' || firstChar === "'") {
      const { value: key, endIdx } = parseStringLiteral(text, firstArgStart)
      const restArgsText = text.slice(endIdx, argsEndIdx)
      const nsOverride = extractNsOption(restArgsText)
      const resolved = resolveEffectiveNamespace(namespaces, nsOverride, key, allNamespaces)
      if (!resolved) continue
      checkKeyAgainstNamespace(resolved, key, relPath, line, allNamespaces, languages, keysByLangNs, errors)
    } else if (firstChar === '`') {
      const { head, hasSubstitution, endIdx } = parseTemplateLiteral(text, firstArgStart)
      const restArgsText = text.slice(endIdx, argsEndIdx)
      const nsOverride = extractNsOption(restArgsText)
      const resolved = resolveEffectiveNamespace(namespaces, nsOverride, head, allNamespaces)
      if (!resolved) continue
      if (!hasSubstitution) {
        checkKeyAgainstNamespace(resolved, head, relPath, line, allNamespaces, languages, keysByLangNs, errors)
      } else {
        checkDynamicKey(resolved, text.slice(firstArgStart, endIdx), relPath, line, languages, keysByLangNs, errors)
      }
    }
    // Any other argument shape (identifier, property access, ternary...) is a fully dynamic key
    // that can't be resolved statically, so it's intentionally skipped rather than flagged.

    callRegex.lastIndex = argsEndIdx
  }

  return errors
}

function checkLanguageParity(locales: Locales): ValidationError[] {
  const { languages, keysByLangNs } = locales
  const errors: ValidationError[] = []
  const allNamespaces = new Set<string>()
  for (const lang of languages) {
    for (const ns of Object.keys(keysByLangNs[lang])) allNamespaces.add(ns)
  }

  for (const ns of allNamespaces) {
    for (const langA of languages) {
      const keysA = keysByLangNs[langA]?.[ns]
      if (!keysA) {
        errors.push({
          file: `packages/i18n/locales/${langA}/${ns}.json`,
          line: 1,
          message: `Namespace '${ns}' has no file for language '${langA}'`,
        })
        continue
      }
      for (const langB of languages) {
        if (langA === langB) continue
        const keysB = keysByLangNs[langB]?.[ns]
        if (!keysB) continue
        for (const key of keysA) {
          if (!keysB.has(key)) {
            errors.push({
              file: `packages/i18n/locales/${langB}/${ns}.json`,
              line: 1,
              message: `Key '${ns}:${key}' exists in '${langA}' but is missing in '${langB}'`,
            })
          }
        }
      }
    }
  }

  return errors
}

function main() {
  const locales = loadLocales()
  const files = collectSourceFiles()

  const errors: ValidationError[] = []
  for (const file of files) {
    errors.push(...analyzeFile(file, locales))
  }
  errors.push(...checkLanguageParity(locales))

  if (errors.length > 0) {
    const byFile = new Map<string, ValidationError[]>()
    for (const error of errors) {
      if (!byFile.has(error.file)) byFile.set(error.file, [])
      byFile.get(error.file)!.push(error)
    }
    console.error(`\n✗ Translation validation failed: ${errors.length} issue(s) found\n`)
    for (const [file, fileErrors] of [...byFile.entries()].sort()) {
      console.error(file)
      for (const error of fileErrors.sort((a, b) => a.line - b.line)) {
        console.error(`  ${error.line}: ${error.message}`)
      }
    }
    console.error('')
    process.exit(1)
  }

  console.log(
    `✓ Translations valid — scanned ${files.length} source files against ${locales.languages.join(', ')} locales`,
  )
}

main()
