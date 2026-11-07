import { expect, test } from 'claude-code/testing'

import { animate, encode, fromMap, mirrorHalf, outline, stack } from './pixel'

test('encode joins same-color runs per row', async () => {
  expect(encode([[0, 0, -1, 1], [-1, 1, 1, 1]])).toBe('0.0.2.0;3.0.1.1;1.1.3.1')
})

test('map + legend -> grid; half maps mirror into symmetric sprites', async () => {
  const g = fromMap(['.ab', 'b.a'], { a: 0, b: 1 })
  expect(g).toEqual([[-1, 0, 1], [1, -1, 0]])
  expect(mirrorHalf(['.a'])).toEqual(['.aa.'])
})

test('animate gives 2 idle, 3 attack, 1 hurt and 4 death frames, all inside the box', async () => {
  const base = fromMap(['....', '.aa.', '.aa.', '....'], { a: 0 })
  const c = animate(base, ['#000000'], { facing: 'left', seed: 7 })
  expect(c.anim.idle.length).toBe(2)
  expect(c.anim.attack.length).toBe(3)
  expect(c.anim.hurt.length).toBe(1)
  expect(c.anim.death.length).toBe(4)
  for (const frames of Object.values(c.anim))
    for (const f of frames)
      for (const r of f.split(';').filter(Boolean)) {
        const [x = 0, y = 0, n = 0] = r.split('.').map(Number)
        expect(x >= 0 && y >= 0 && x + n <= 4 && y < 4).toBe(true)
      }
  const count = (f: string) => f.split(';').filter(Boolean).reduce((s, r) => s + Number(r.split('.')[2]), 0)
  expect(count(c.anim.death[3] ?? '')).toBeLessThan(count(c.anim.idle[0] ?? ''))
})

test('stack puts later layers on top; outline wraps the body in ink', async () => {
  expect(stack(['ab.', '...'], ['.c.', '..d'])).toEqual(['ac.', '..d'])
  expect(outline([[-1, -1, -1], [-1, 1, -1]], 0)).toEqual([[-1, 0, -1], [0, 1, 0]])
})
