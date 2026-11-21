import { describe, expect, it } from 'vitest'
import { GUIDE_IDS, GUIDE_LABEL, GUIDE_TITLE, GUIDE_TONE, guideHash, guideSeen, introClosed, isGuideHash, markGuideSeen, readGuideHash, setIntroClosed } from './guides'
import { ROLES } from './roles'

describe('guide', () => {
  it('una guida per ogni profilo, con etichetta, titolo e colore', () => {
    expect([...GUIDE_IDS].sort()).toEqual([...ROLES].sort())
    for (const id of GUIDE_IDS) {
      expect(GUIDE_LABEL[id]).toMatch(/^Guida /)
      expect(GUIDE_TITLE[id][0].length).toBeGreaterThan(5)
      expect(GUIDE_TONE[id].pill).toContain('ring-')
    }
  })

  it('link diretto: #/guida apre la propria, #/guida/<id> quella indicata', () => {
    expect(readGuideHash('#/guida', 'hr')).toBe('hr')
    expect(readGuideHash('#/guida/', 'hr')).toBe('hr')
    expect(readGuideHash('#/guida/pm', 'hr')).toBe('pm')
    expect(readGuideHash('#guida/director', 'hr')).toBe('director')
    expect(readGuideHash('#/guida/sconosciuta', 'turnista')).toBe('turnista')
    expect(readGuideHash('#/planner', 'hr')).toBeNull()
    expect(readGuideHash('#/guidatore', 'hr')).toBeNull()
    expect(readGuideHash('', 'hr')).toBeNull()
    for (const id of GUIDE_IDS) expect(readGuideHash(guideHash(id), 'viewer')).toBe(id)
  })

  it('riconosce solo gli indirizzi della guida', () => {
    expect(isGuideHash('#/guida')).toBe(true)
    expect(isGuideHash('#/guida/hr')).toBe(true)
    expect(isGuideHash('#/payroll')).toBe(false)
    expect(isGuideHash('#/guidatore')).toBe(false)
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
