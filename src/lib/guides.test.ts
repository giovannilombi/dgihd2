import { describe, expect, it } from 'vitest'
import { GUIDE_HASH, GUIDE_TITLE, GUIDE_TONE, guideSeen, introClosed, isGuideHash, markGuideSeen, setIntroClosed } from './guides'
import { ROLES } from './roles'

describe('guide', () => {
  it('una guida per ogni profilo, con titolo e colore', () => {
    for (const role of ROLES) {
      expect(GUIDE_TITLE[role][0].length).toBeGreaterThan(5)
      expect(GUIDE_TONE[role].pill).toContain('ring-')
    }
    expect(Object.keys(GUIDE_TITLE).sort()).toEqual([...ROLES].sort())
  })

  it('link diretto: #/guida (anche con un profilo in coda) apre la guida di chi lo apre', () => {
    expect(isGuideHash(GUIDE_HASH)).toBe(true)
    expect(isGuideHash('#/guida/')).toBe(true)
    expect(isGuideHash('#guida')).toBe(true)
    expect(isGuideHash('#/guida/hr')).toBe(true)
    expect(isGuideHash('#/payroll')).toBe(false)
    expect(isGuideHash('#/guidatore')).toBe(false)
    expect(isGuideHash('#/guida/hr/altro')).toBe(false)
    expect(isGuideHash('')).toBe(false)
  })

  it('senza memoria locale ricorda la guida vista e il riquadro chiuso per la sessione', () => {
    expect(guideSeen('pm')).toBe(false)
    markGuideSeen('pm')
    expect(guideSeen('pm')).toBe(true)
    expect(guideSeen('hr')).toBe(false)
    expect(introClosed()).toBe(false)
    setIntroClosed(true)
    expect(introClosed()).toBe(true)
    setIntroClosed(false)
    expect(introClosed()).toBe(false)
  })
})
