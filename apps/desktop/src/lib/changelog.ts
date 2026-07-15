import changelogRaw from '../../../../CHANGELOG.md?raw'

export interface ChangelogSection {
  heading: string
  items: string[]
}

export interface ChangelogEntry {
  version: string
  date: string | null
  sections: ChangelogSection[]
}

/**
 * Parses the repo's root CHANGELOG.md — `## [x.y.z] - date` version headings, optional
 * `### Category` subheadings, and `-`/`*` bullet items (hand-written entries use `-`; GitHub's
 * generated release notes, used by prepare-release.yml, use a flat `*` list with no subheading)
 * — into structured entries, in file order (newest first, by convention of how the file is
 * maintained). Bullets found directly under a version heading with no `### ` subheading yet are
 * grouped into an implicit section with an empty heading.
 */
export function parseChangelog(raw: string = changelogRaw): ChangelogEntry[] {
  const entries: ChangelogEntry[] = []
  let current: ChangelogEntry | null = null
  let currentSection: ChangelogSection | null = null

  for (const line of raw.split('\n')) {
    const versionMatch = line.match(/^##\s+\[([^\]]+)\](?:\s*-\s*(.+))?/)
    if (versionMatch) {
      current = { version: versionMatch[1], date: versionMatch[2]?.trim() || null, sections: [] }
      currentSection = null
      entries.push(current)
      continue
    }
    if (!current) continue

    const sectionMatch = line.match(/^###\s+(.+)/)
    if (sectionMatch) {
      currentSection = { heading: sectionMatch[1].trim(), items: [] }
      current.sections.push(currentSection)
      continue
    }

    const itemMatch = line.match(/^[-*]\s+(.+)/)
    if (itemMatch) {
      if (!currentSection) {
        currentSection = { heading: '', items: [] }
        current.sections.push(currentSection)
      }
      currentSection.items.push(itemMatch[1].trim())
    }
  }

  return entries
}

export function getAppChangelog(): ChangelogEntry[] {
  return parseChangelog()
}
