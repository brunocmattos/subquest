import { expect, test } from 'claude-code/testing'

import { CLASSES } from '../game'
import { bossCharacter } from './bosses'
import { heroCharacter } from './heroes'
import { monsterCharacter } from './monsters'

const inside = (c: { w: number; h: number; palette: string[]; anim: Record<string, string[]> }) =>
  Object.values(c.anim).every(fs =>
    fs.every(f =>
      f.split(';').filter(Boolean).every(r => {
        const [x = 0, y = 0, n = 0, ci = 0] = r.split('.').map(Number)
        return x + n <= c.w && y < c.h && ci < c.palette.length
      }),
    ),
  )

test('same seed, same monster; different seeds vary', async () => {
  expect(monsterCharacter('read', 42)).toEqual(monsterCharacter('read', 42))
  const looks = new Set(Array.from({ length: 40 }, (_, i) => JSON.stringify(monsterCharacter('command', i).character.anim.idle)))
  expect(looks.size).toBeGreaterThan(10)
})

test('every monster family is 16x16, inside its box, with a name in both languages', async () => {
  for (const f of ['read', 'edit', 'command', 'web', 'other'] as const)
    for (let s = 0; s < 20; s++) {
      const m = monsterCharacter(f, s)
      expect([m.character.w, m.character.h]).toEqual([16, 16])
      expect(inside(m.character)).toBe(true)
      expect(m.name.en.length > 0 && m.name['pt-BR'].length > 0).toBe(true)
    }
})

test('heroes: 8 classes x 3 levels, 16x16', async () => {
  for (const c of CLASSES)
    for (const lv of [1, 2, 3] as const) {
      const h = heroCharacter(c, lv, 7)
      expect([h.w, h.h]).toEqual([16, 16])
      expect(inside(h)).toBe(true)
    }
  const px = (c: ReturnType<typeof heroCharacter>) => (c.anim.idle[0] ?? '').split(';').filter(Boolean).reduce((s, r) => s + Number(r.split('.')[2]), 0)
  expect(px(heroCharacter('knight', 3, 1))).toBeGreaterThan(px(heroCharacter('knight', 1, 1)))
})

test('bosses: 32x32, seeded places, names in both languages', async () => {
  for (const b of ['warlord', 'darkKnight'] as const) {
    expect(bossCharacter(b, 5)).toEqual(bossCharacter(b, 5))
    const looks = new Set<string>()
    for (let s = 0; s < 8; s++) {
      const { character: c, name } = bossCharacter(b, s)
      expect([c.w, c.h]).toEqual([32, 32])
      expect(inside(c)).toBe(true)
      expect(name.en.length > 0 && name['pt-BR'].length > 0).toBe(true)
      looks.add(JSON.stringify(c.palette))
    }
    expect(looks.size).toBeGreaterThan(2)
  }
})
