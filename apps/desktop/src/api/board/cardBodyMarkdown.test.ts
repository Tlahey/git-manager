import { describe, it, expect } from 'vitest'
import { parseCardBody, composeCardBody } from './cardBodyMarkdown'

describe('parseCardBody', () => {
  it('returns a plain body untouched, with no DOD and no metadata', () => {
    const parsed = parseCardBody('Just a description.')
    expect(parsed).toEqual({ description: 'Just a description.', dod: '', meta: {} })
  })

  it('splits the Definition-of-Done section out of the description', () => {
    const parsed = parseCardBody(
      'Fix the header.\n\n## Definition of Done\n\n- [x] Tests pass\n- [ ] Reviewed'
    )
    expect(parsed.description).toBe('Fix the header.')
    expect(parsed.dod).toBe('- [x] Tests pass\n- [ ] Reviewed')
  })

  it('reads the metadata marker and keeps it out of the description', () => {
    const parsed = parseCardBody(
      'Body.\n\n<!-- git-manager:meta {"dueDate":"2026-08-10","blockedReason":"Waiting on API"} -->'
    )
    expect(parsed.description).toBe('Body.')
    expect(parsed.meta.dueDate).toBe('2026-08-10')
    expect(parsed.meta.blockedReason).toBe('Waiting on API')
  })

  it('still reads the legacy standalone linkedBranch marker', () => {
    const parsed = parseCardBody('Body.\n\n<!-- git-manager:linkedBranch=card/fix-header -->')
    expect(parsed.description).toBe('Body.')
    expect(parsed.meta.linkedBranch).toBe('card/fix-header')
  })

  it('prefers the new marker over the legacy one when a card carries both', () => {
    const parsed = parseCardBody(
      'Body.\n\n<!-- git-manager:linkedBranch=old -->\n<!-- git-manager:meta {"linkedBranch":"new"} -->'
    )
    expect(parsed.meta.linkedBranch).toBe('new')
    expect(parsed.description).toBe('Body.')
  })

  it('survives a corrupt marker without losing the description or the checklist', () => {
    const parsed = parseCardBody(
      'Body.\n\n## Definition of Done\n\n- [ ] Ship\n\n<!-- git-manager:meta {not json} -->'
    )
    expect(parsed.description).toBe('Body.')
    expect(parsed.dod).toBe('- [ ] Ship')
    expect(parsed.meta).toEqual({})
  })
})

describe('composeCardBody', () => {
  it('writes nothing but the description when there is nothing else to store', () => {
    expect(composeCardBody({ description: 'Body.', dod: '', meta: {} })).toBe('Body.')
  })

  it('omits empty metadata fields rather than writing an empty marker', () => {
    const body = composeCardBody({
      description: 'Body.',
      dod: '',
      meta: { dueDate: undefined, blockedReason: '' },
    })
    expect(body).toBe('Body.')
  })

  it('round-trips every field back to the same values', () => {
    const original = {
      description: 'Fix the header.',
      dod: '- [x] Tests pass\n- [ ] Reviewed',
      meta: { dueDate: '2026-08-10', blockedReason: 'Waiting on API', linkedBranch: 'card/x' },
    }
    expect(parseCardBody(composeCardBody(original))).toEqual(original)
  })

  it('produces a checklist GitHub renders natively, under a real heading', () => {
    const body = composeCardBody({ description: 'B.', dod: '- [ ] Ship', meta: {} })
    expect(body).toContain('## Definition of Done')
    expect(body).toContain('- [ ] Ship')
  })
})
