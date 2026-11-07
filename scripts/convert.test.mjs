import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'

import { convert, crop, readPng, shortPalette } from './convert.mjs'

const table = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc = b => {
  let c = 0xffffffff
  for (const x of b) c = table[(c ^ x) & 255] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (t, d) => {
  const l = Buffer.alloc(4)
  l.writeUInt32BE(d.length)
  const td = Buffer.concat([Buffer.from(t), d])
  const c = Buffer.alloc(4)
  c.writeUInt32BE(crc(td))
  return Buffer.concat([l, td, c])
}
const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
const pngOf = (w, h, raw) => {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr.set([8, 6, 0, 0, 0], 8)
  return Buffer.concat([SIG, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

// Minimal RGBA 2x2: row 0 unfiltered, row 1 with the Up filter (2).
const png2x2 = () => pngOf(2, 2, Buffer.from([0, 255, 0, 0, 255, 0, 0, 0, 0, 2, 1, 255, 0, 0, 0, 255, 0, 255]))

// Unfiltered RGBA sheet from rows of pixels [r,g,b,a].
const sheet = rows => pngOf(rows[0].length, rows.length, Buffer.concat(rows.map(r => Buffer.concat([Buffer.from([0]), Buffer.from(r.flat())]))))

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'subquest-'))

test('reads RGBA and undoes the Up filter', () => {
  const { w, h, px } = readPng(png2x2())
  assert.equal(w, 2)
  assert.equal(h, 2)
  assert.deepEqual([...px.subarray(0, 4)], [255, 0, 0, 255])
  assert.equal(px[7], 0)
  // row 1, pixel 0: (255,0,0,255) + (1,255,0,0) = (0,255,0,255) with 8-bit wraparound
  assert.deepEqual([...px.subarray(8, 12)], [0, 255, 0, 255])
  // row 1, pixel 1: (0,0,0,0) + (0,255,0,255) = (0,255,0,255)
  assert.deepEqual([...px.subarray(12, 16)], [0, 255, 0, 255])
})

test('crops to the box of visible pixels', () => {
  assert.deepEqual(crop([readPng(png2x2())]), { x: 0, y: 0, w: 2, h: 2 })
})

test('rejects PNG that is not RGBA 8-bit', () => {
  const b = png2x2()
  b[25] = 2
  assert.throws(() => readPng(b), /RGBA 8-bit/)
})

test('short palette keeps the most used and maps the rest to the nearest', () => {
  const counts = new Map([['#ff0000', 10], ['#0000ff', 8], ['#fe0101', 1], ['#0101fe', 1]])
  const near = shortPalette(counts, 2)
  assert.equal(near.get('#ff0000'), '#ff0000')
  assert.equal(near.get('#fe0101'), '#ff0000')
  assert.equal(near.get('#0101fe'), '#0000ff')
})

const RUNS = /^(\d+\.\d+\.\d+\.\d+)(;\d+\.\d+\.\d+\.\d+)*$|^$/
const blobMap = source => ({
  source,
  frame: 2,
  characters: [{ key: 'blob', kind: 'monster', family: 'read', name: 'Blob', mirror: true, files: { idle: 'blob.png', attack: 'blob.png', hurt: 'blob.png', death: 'blob.png' } }],
})
// Two 2x2 frames side by side, different colors.
const blobSheet = () => {
  const R = [255, 0, 0, 255]
  const G = [0, 255, 0, 255]
  const B = [0, 0, 255, 255]
  return sheet([
    [R, R, G, B],
    [R, [0, 0, 0, 0], G, G],
  ])
}

test('end to end: sheet -> pack json', () => {
  const src = tmp()
  const out = tmp()
  try {
    fs.mkdirSync(path.join(src, 'deep', 'er'), { recursive: true })
    fs.writeFileSync(path.join(src, 'deep', 'er', 'blob.png'), blobSheet())
    const res = convert(blobMap(src), out)
    assert.equal(res.length, 1)
    assert.equal(res[0].ok, true)
    const pack = JSON.parse(fs.readFileSync(path.join(out, 'blob.json'), 'utf8'))
    assert.equal(pack.kind, 'monster')
    assert.equal(pack.family, 'read')
    assert.equal(pack.name, 'Blob')
    assert.ok(pack.w > 0 && pack.h > 0)
    assert.ok(pack.palette.length > 0)
    for (const c of pack.palette) assert.match(c, /^#[0-9a-f]{6}$/i)
    for (const a of ['idle', 'attack', 'hurt', 'death']) {
      assert.ok(Array.isArray(pack.anim[a]) && pack.anim[a].length > 0)
      for (const f of pack.anim[a]) {
        assert.equal(typeof f, 'string')
        assert.match(f, RUNS)
      }
    }
    assert.equal(pack.anim.idle.length, 2)
  } finally {
    fs.rmSync(src, { recursive: true, force: true })
    fs.rmSync(out, { recursive: true, force: true })
  }
})

test('missing animation errors for that key and the others still convert', () => {
  const src = tmp()
  const out = tmp()
  try {
    fs.writeFileSync(path.join(src, 'blob.png'), blobSheet())
    const map = blobMap(src)
    map.characters.unshift({ key: 'ghost', kind: 'monster', family: 'read', name: 'Ghost', files: { idle: 'nope.png', attack: ['a.png', 'b.png'], hurt: 'blob.png', death: 'blob.png' } })
    const res = convert(map, out)
    assert.equal(res[0].ok, false)
    assert.match(res[0].error, /^ghost: missing idle \(tried nope\.png\)$/)
    assert.equal(res[1].ok, true)
    assert.ok(fs.existsSync(path.join(out, 'blob.json')))
    assert.ok(!fs.existsSync(path.join(out, 'ghost.json')))
  } finally {
    fs.rmSync(src, { recursive: true, force: true })
    fs.rmSync(out, { recursive: true, force: true })
  }
})
