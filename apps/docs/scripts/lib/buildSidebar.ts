/**
 * Turns the parsed features plus the hand-curated section list into the
 * VitePress sidebar shape.
 */
import type { DocFeature } from './parseDocFeatures.ts'
import { DOCS_ROUTE } from '../../docs.config.ts'
import type { DocSection } from '../../docs.config.ts'

export interface SidebarItem {
  text: string
  link: string
}

export interface SidebarGroup {
  text: string
  items: SidebarItem[]
}

function toItem(feature: DocFeature): SidebarItem {
  return { text: feature.name, link: `${DOCS_ROUTE}/features/${feature.slug}` }
}

/**
 * Groups `features` following `sections`. A feature no section lists is
 * collected — alphabetically, so the output stays stable — under
 * `fallbackTitle`, and a section whose features are all absent is dropped
 * rather than rendered empty.
 */
export function buildSidebar(
  features: DocFeature[],
  sections: DocSection[],
  fallbackTitle: string
): SidebarGroup[] {
  const bySlug = new Map(features.map((feature) => [feature.slug, feature]))
  const claimed = new Set<string>()

  const groups: SidebarGroup[] = []

  for (const section of sections) {
    const items = section.features
      .map((slug) => {
        const feature = bySlug.get(slug)
        if (feature) claimed.add(slug)
        return feature
      })
      .filter((feature): feature is DocFeature => feature !== undefined)
      .map(toItem)

    if (items.length > 0) groups.push({ text: section.title, items })
  }

  const orphans = features
    .filter((feature) => !claimed.has(feature.slug))
    .sort((a, b) => a.slug.localeCompare(b.slug))
    .map(toItem)

  if (orphans.length > 0) groups.push({ text: fallbackTitle, items: orphans })

  return groups
}
