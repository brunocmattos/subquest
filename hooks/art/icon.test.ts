import { expect, test } from 'claude-code/testing'

import { iconCharacter, iconGrid } from './icon'

test('the brand icon is 32x32 and every run stays inside the box', async () => {
  const g = iconGrid()
  expect(g.length).toBe(32)
  expect(g.every(r => r.length === 32)).toBe(true)
  const c = iconCharacter()
  expect([c.w, c.h]).toEqual([32, 32])
  for (const frames of Object.values(c.anim))
    for (const f of frames)
      for (const r of f.split(';').filter(Boolean)) {
        const [x = 0, y = 0, n = 0, ci = 0] = r.split('.').map(Number)
        expect(x >= 0 && y >= 0 && x + n <= 32 && y < 32 && ci < c.palette.length).toBe(true)
      }
  // rounded corners stay transparent, the middle is filled
  expect(g[0]?.[0]).toBe(-1)
  expect((g[16]?.[16] ?? -1) >= 0).toBe(true)
})
