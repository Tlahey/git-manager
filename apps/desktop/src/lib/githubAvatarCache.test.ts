import { beforeEach, describe, expect, it } from 'vitest'
import { cachedAvatars, clearGithubAvatarCache, rememberAvatars } from './githubAvatarCache'

beforeEach(() => {
  clearGithubAvatarCache()
})

describe('githubAvatarCache', () => {
  it('reports everything as missing before anything is known', () => {
    expect(cachedAvatars('acme', 'app', ['a', 'b'])).toEqual({ known: {}, missing: ['a', 'b'] })
  })

  it('asks only about the SHAs nobody has looked up yet', () => {
    // The whole point: the caller keys its SWR entry on the joined SHA list, so scrolling a blame
    // gutter by one line produces a new key — and, without this, a new fetch of everything.
    rememberAvatars('acme', 'app', ['a', 'b'], { a: 'https://x/a.png', b: 'https://x/b.png' })
    expect(cachedAvatars('acme', 'app', ['a', 'b', 'c'])).toEqual({
      known: { a: 'https://x/a.png', b: 'https://x/b.png' },
      missing: ['c'],
    })
  })

  it('remembers a resolved absence, so an unmatched author is not asked about forever', () => {
    rememberAvatars('acme', 'app', ['a', 'ghost'], { a: 'https://x/a.png' })
    const { known, missing } = cachedAvatars('acme', 'app', ['ghost'])
    expect(missing).toEqual([])
    expect(known).toEqual({})
  })

  it('keeps repositories apart, since a SHA alone does not name a commit', () => {
    rememberAvatars('acme', 'app', ['a'], { a: 'https://x/a.png' })
    expect(cachedAvatars('acme', 'other', ['a']).missing).toEqual(['a'])
  })

  it('stays bounded in a long session', () => {
    const many = Array.from({ length: 6000 }, (_, i) => `sha${i}`)
    rememberAvatars('acme', 'app', many, Object.fromEntries(many.map((s) => [s, `https://x/${s}`])))
    // The oldest went; the most recent are still there.
    expect(cachedAvatars('acme', 'app', ['sha0']).missing).toEqual(['sha0'])
    expect(cachedAvatars('acme', 'app', ['sha5999']).known).toHaveProperty('sha5999')
  })
})
