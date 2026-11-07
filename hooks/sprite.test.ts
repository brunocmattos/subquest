import { expect, test } from 'claude-code/testing'

import { feet, frameSvg } from './sprite'

const p = { w: 10, h: 5, palette: ['#00ff00', '#ff0000'], anim: { idle: ['4.1.2.0;2.3.6.1'], attack: [], hurt: [], death: [] } }

test('the runs of a frame become one path per color', async () => {
  expect(frameSvg(p, 'idle', 0)).toBe('<path stroke="#00ff00" d="M4 1.5h2"/><path stroke="#ff0000" d="M2 3.5h6"/>')
  // same color: the 2nd run moves relative to the end of the 1st (x 6 -> 2 = -4, y 1 -> 3 = +2)
  expect(frameSvg(p, 'idle', 0, '#ffffff')).toBe('<path stroke="#ffffff" d="M4 1.5h2m-4 2h6"/>')
  expect(frameSvg(p, 'attack', 5)).toBe('')
})

test('feet: body middle, lowest and highest row of the idle frame', async () => {
  // pixels x 4,5 and 2..7: (9 + 27) / 8 = 4.5
  expect(feet(p)).toEqual({ x: 4.5, y: 3, top: 1 })
})
