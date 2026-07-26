import { describe, it, expect, beforeEach } from 'vitest'
import { useDashboardStore, DASHBOARD_SECTION_IDS, SECTION_COLORS } from './dashboard.store'

beforeEach(() => {
  useDashboardStore.setState({ collapsedSections: {}, hiddenSections: {}, sectionColors: {} })
})

describe('useDashboardStore', () => {
  it('starts with every section expanded', () => {
    for (const id of DASHBOARD_SECTION_IDS) {
      expect(useDashboardStore.getState().collapsedSections[id]).toBeFalsy()
    }
  })

  it('toggles a single section without touching the others', () => {
    useDashboardStore.getState().toggleSection('favorites')
    expect(useDashboardStore.getState().collapsedSections.favorites).toBe(true)
    expect(useDashboardStore.getState().collapsedSections.open).toBeFalsy()

    useDashboardStore.getState().toggleSection('favorites')
    expect(useDashboardStore.getState().collapsedSections.favorites).toBe(false)
  })

  it('sets a section collapsed state outright', () => {
    useDashboardStore.getState().setSectionCollapsed('recent', true)
    expect(useDashboardStore.getState().collapsedSections.recent).toBe(true)
    useDashboardStore.getState().setSectionCollapsed('recent', true)
    expect(useDashboardStore.getState().collapsedSections.recent).toBe(true)
  })

  it('collapses and expands every section at once', () => {
    useDashboardStore.getState().setAllSectionsCollapsed(true)
    for (const id of DASHBOARD_SECTION_IDS) {
      expect(useDashboardStore.getState().collapsedSections[id]).toBe(true)
    }

    useDashboardStore.getState().setAllSectionsCollapsed(false)
    for (const id of DASHBOARD_SECTION_IDS) {
      expect(useDashboardStore.getState().collapsedSections[id]).toBe(false)
    }
  })
})

describe('useDashboardStore — hiding sections', () => {
  it('starts with every section visible', () => {
    expect(useDashboardStore.getState().hiddenSections).toEqual({})
  })

  it('hides a section without touching the others', () => {
    useDashboardStore.getState().hideSection('recent')
    expect(useDashboardStore.getState().hiddenSections).toEqual({ recent: true })
  })

  it('restores a hidden section', () => {
    useDashboardStore.getState().hideSection('recent')
    useDashboardStore.getState().showSection('recent')
    expect(useDashboardStore.getState().hiddenSections).toEqual({})
  })

  it('restores every hidden section at once', () => {
    useDashboardStore.getState().hideSection('recent')
    useDashboardStore.getState().hideSection('all')
    useDashboardStore.getState().showAllSections()
    expect(useDashboardStore.getState().hiddenSections).toEqual({})
  })

  it('is independent of collapsing — a hidden section is not merely folded', () => {
    useDashboardStore.getState().hideSection('favorites')
    expect(useDashboardStore.getState().collapsedSections.favorites).toBeFalsy()
  })
})

describe('useDashboardStore — section colours', () => {
  it('has no colour by default', () => {
    expect(useDashboardStore.getState().sectionColors).toEqual({})
  })

  it('assigns a colour to one section', () => {
    useDashboardStore.getState().setSectionColor('open', 'emerald')
    expect(useDashboardStore.getState().sectionColors).toEqual({ open: 'emerald' })
  })

  it('replaces a colour rather than stacking them', () => {
    useDashboardStore.getState().setSectionColor('open', 'emerald')
    useDashboardStore.getState().setSectionColor('open', 'rose')
    expect(useDashboardStore.getState().sectionColors).toEqual({ open: 'rose' })
  })

  it('clears a colour back to the default header with null', () => {
    useDashboardStore.getState().setSectionColor('open', 'emerald')
    useDashboardStore.getState().setSectionColor('open', null)
    expect(useDashboardStore.getState().sectionColors).toEqual({})
  })

  it('colours each section independently', () => {
    useDashboardStore.getState().setSectionColor('open', 'emerald')
    useDashboardStore.getState().setSectionColor('all', 'sky')
    expect(useDashboardStore.getState().sectionColors).toEqual({ open: 'emerald', all: 'sky' })
  })

  it('offers a palette of theme tokens, never raw hex', () => {
    for (const color of SECTION_COLORS) {
      expect(color).not.toMatch(/^#/)
    }
    expect(SECTION_COLORS.length).toBeGreaterThan(1)
  })
})

describe('useDashboardStore — persistence', () => {
  it('persists folds, hidden sections and colours across a restart', () => {
    useDashboardStore.getState().toggleSection('open')
    useDashboardStore.getState().hideSection('recent')
    useDashboardStore.getState().setSectionColor('favorites', 'amber')

    const persisted = JSON.parse(localStorage.getItem('git-manager-dashboard')!)
    expect(persisted.state.collapsedSections).toEqual({ open: true })
    expect(persisted.state.hiddenSections).toEqual({ recent: true })
    expect(persisted.state.sectionColors).toEqual({ favorites: 'amber' })
  })
})
