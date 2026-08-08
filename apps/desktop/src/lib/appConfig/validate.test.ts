import { describe, it, expect } from 'vitest'
import { validateSection } from './validate'

describe('validateSection — a section as a whole', () => {
  it("hands back the raw value, not zod's stripped output", () => {
    // The difference matters on a downgrade: a field a newer version added must survive an older
    // one merely reading the file, and zod's parsed output would have deleted it.
    const raw = { openTabs: ['/a'], activeRepo: null, activeTab: '/a', somethingNewer: 42 }
    const { value, problems } = validateSection('workspace', raw)
    expect(value).toBe(raw)
    expect(problems).toEqual([])
  })

  it('drops a section whose shape is wrong, and says why', () => {
    const { value, problems } = validateSection('workspace', { openTabs: 'not-an-array' })
    expect(value).toBeUndefined()
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('workspace')
  })

  it('treats a non-object as no section at all', () => {
    expect(validateSection('workspace', 'nonsense').value).toBeUndefined()
    expect(validateSection('workspace', undefined).value).toBeUndefined()
  })

  it('accepts an achievement it only knows the id of', () => {
    // `game.store.ts` rebuilds every definition from `INITIAL_ACHIEVEMENTS` on rehydration, so
    // validating the fields it throws away would only create ways to lose a trophy.
    const raw = {
      achievements: [{ id: 'first-commit', unlocked: true, points: 10, kind: 'action' }],
      points: 10,
      terminalHistorySnapshot: null,
      rewardsEnabled: true,
      commitCount: 1,
      prMergedCount: 0,
      terminalCommandCount: 0,
    }
    expect(validateSection('rewards', raw).value).toBe(raw)
  })
})

describe('validateSection — settings, repaired group by group', () => {
  const validAppearance = {
    theme: 'dracula',
    fontSize: 14,
    density: 'normal',
    showAvatars: true,
    enableAnimations: true,
    terminalBackground: '#000000',
    terminalForeground: '#ffffff',
    viewSwitcherPosition: 'toolbar',
  }

  it('keeps every valid group when one of them is broken', () => {
    // The reason settings are repaired one level finer than every other section: they hold thirteen
    // unrelated things, and a mistyped font size must not cost the user their GitHub account.
    const { value, problems } = validateSection('settings', {
      appearance: { ...validAppearance, fontSize: 'quatorze' },
      language: 'en',
      github: { accounts: [], activeAccountId: null },
    })

    expect(value).toEqual({ language: 'en', github: { accounts: [], activeAccountId: null } })
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('settings.appearance')
  })

  it('keeps a group this version has never heard of', () => {
    // A newer build's setting. Dropping it would make merely launching an older build destroy it.
    const { value, problems } = validateSection('settings', { fromTheFuture: { enabled: true } })
    expect(value).toEqual({ fromTheFuture: { enabled: true } })
    expect(problems).toEqual([])
  })

  it('accepts an AI preset id it does not know, because the store remaps it', () => {
    // `migrateAiPresetId` folds the retired per-vendor presets into `openai-compatible`; rejecting
    // here would throw away the URL, model and API key that go with it.
    const { value, problems } = validateSection('settings', {
      ai: { preset: 'lmstudio', url: 'http://localhost:1234', model: 'x', timeoutSeconds: 30 },
    })
    expect((value as { ai: { preset: string } }).ai.preset).toBe('lmstudio')
    expect(problems).toEqual([])
  })

  it('accepts a theme name it cannot enumerate', () => {
    // User themes are files in ~/.git-manager/themes/ — an open set by construction.
    const { problems } = validateSection('settings', {
      appearance: { ...validAppearance, theme: 'my-own-theme' },
    })
    expect(problems).toEqual([])
  })

  it('resets a language that is not one the app ships', () => {
    const { value, problems } = validateSection('settings', { language: 'de' })
    expect(value).toEqual({})
    expect(problems[0]).toContain('settings.language')
  })
})
