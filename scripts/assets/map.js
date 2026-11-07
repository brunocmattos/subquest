// The region map behind every README asset: a daylight parchment overworld drawn by code in chunky pixels
// (`u` screen px per art pixel). Five regions, one per monster family, the Boss Lair, the Guild and dotted trails.
// Loaded into the page by render.mts: window.map(canvas, options) draws it; `t` (seconds) and `active` (families
// being fought) only move the battle markers, so the parchment is drawn once and cached.
;(() => {
  const INK = '#3d2b1f'
  const SEPIA = '#6b4e34'
  const PAPER = ['#f4e8c8', '#ecdcb3', '#e2cd9f', '#d5bb88', '#c2a26d', '#a8865a']
  const TABLE = '#2b1e16'
  const TRAIL = '#9a4a32'
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16)
  const bayer = (x, y) => BAYER[(y & 3) * 4 + (x & 3)]
  const hex = c => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]
  const canvas = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h })

  // Region kinds: patch tint, its rim, patch radius (art px) and the landmark drawn on it.
  const KIND = {
    read: { tint: '#d3cdbb', rim: '#a8a18e', r: 19 },
    edit: { tint: '#d8bb92', rim: '#ad8f66', r: 19 },
    command: { tint: '#bcc391', rim: '#8f9a64', r: 20 },
    web: { tint: '#d9c8a4', rim: '#ae9a74', r: 19 },
    other: { tint: '#bac78c', rim: '#8c9d5f', r: 20 },
    lair: { tint: '#b3a3a6', rim: '#82717a', r: 24 },
    guild: { tint: '#dcca99', rim: '#b29d6c', r: 14 },
  }

  // mulberry32: the same seed draws the same map
  const rng = seed => {
    let s = seed
    return () => {
      s = (s + 0x6d2b79f5) | 0
      let r = Math.imul(s ^ (s >>> 15), 1 | s)
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296
    }
  }

  // Pixel text: the font drawn at its own size, every pixel snapped to on/off (no anti-aliasing), then stamped at
  // `scale` with nearest-neighbour. Returns the stamped width (target px).
  function stamp(g, str, x, y, o) {
    const size = o.size ?? 8
    const font = `${size}px '${o.font ?? 'Tiny5'}'`
    const m = canvas(1, 1).getContext('2d')
    m.font = font
    m.letterSpacing = `${o.spacing ?? 0}px`
    const w = Math.ceil(m.measureText(str).width) + 2
    const h = Math.ceil(size * 1.4) + 2
    const t = canvas(w, h)
    const tg = t.getContext('2d')
    tg.font = font
    tg.letterSpacing = `${o.spacing ?? 0}px`
    tg.textBaseline = 'alphabetic'
    tg.fillStyle = '#000'
    tg.fillText(str, 1, Math.round(size * 1.05) + 1)
    const d = tg.getImageData(0, 0, w, h)
    const ink = (o.cut ?? 110)
    const on = new Uint8Array(w * h)
    for (let i = 0; i < w * h; i++) on[i] = d.data[i * 4 + 3] > ink ? 1 : 0
    // snapped to the stamp's own pixel grid; `middle` centres the ink (not the em box) on that y
    const s = o.scale ?? 1
    let top = h
    let bottom = 0
    for (let i = 0; i < w * h; i++) if (on[i]) (top = Math.min(top, Math.floor(i / w))), (bottom = Math.max(bottom, Math.floor(i / w)))
    const x0 = o.align === 'left' ? x : Math.round(x / s - w / 2) * s
    const y0 = o.middle !== undefined ? Math.round(o.middle / s - (top + bottom + 1) / 2) * s : y
    const paint = (c, dx, dy, mask) => {
      const [r, gg, b] = hex(c)
      const img = tg.createImageData(w, h)
      for (let i = 0; i < w * h; i++)
        if (mask[i]) img.data.set([r, gg, b, 255], i * 4)
      const l = canvas(w, h)
      l.getContext('2d').putImageData(img, 0, 0)
      g.imageSmoothingEnabled = false
      g.drawImage(l, x0 + dx * s, y0 + dy * s, w * s, h * s)
    }
    if (o.halo) {
      const halo = new Uint8Array(w * h)
      for (let yy = 0; yy < h; yy++)
        for (let xx = 0; xx < w; xx++)
          for (let k = -1; k <= 1 && !halo[yy * w + xx]; k++)
            for (let j = -1; j <= 1; j++) {
              const X = xx + j
              const Y = yy + k
              if (X >= 0 && Y >= 0 && X < w && Y < h && on[Y * w + X]) {
                halo[yy * w + xx] = 1
                break
              }
            }
      paint(o.halo, 0, 0, halo)
    }
    if (o.shadow) paint(o.shadow, 0, 1, on)
    paint(o.color ?? INK, 0, 0, on)
    return w * (o.scale ?? 1)
  }

  // A shape from a predicate: ink where it borders the outside, `fill(x, y)` inside.
  function shape(px, x0, y0, x1, y1, inside, fill) {
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        if (!inside(x, y)) continue
        const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1)
        px(x, y, edge ? INK : fill(x, y))
      }
  }

  // --- landmarks: (cx, by) is the centre of the ground line they stand on
  const LAND = {
    read(px, cx, by) {
      const box = (x, y, w, h, f, l, s) => {
        px(x, y, INK, w, h)
        px(x + 1, y + 1, f, w - 2, h - 2)
        px(x + 1, y + 1, l, 1, h - 2)
        px(x + w - 2, y + 1, s, 1, h - 2)
      }
      // graves around the crypt: rounded stones and ink crosses
      for (const [dx, dy] of [[-15, 2], [-10, 5], [11, 3], [15, 6]]) {
        px(cx + dx, by + dy - 4, INK, 4, 5)
        px(cx + dx + 1, by + dy - 5, INK, 2, 1)
        px(cx + dx + 1, by + dy - 4, '#d6d0c2', 2, 3)
        px(cx + dx + 2, by + dy - 4, '#a8a193', 1, 3)
      }
      for (const [dx, dy] of [[-13, -2], [13, -3], [-5, 6], [6, 7]]) {
        px(cx + dx, by + dy - 4, INK, 1, 4)
        px(cx + dx - 1, by + dy - 3, INK, 3, 1)
      }
      // the mausoleum: steps, body, columns, a dark door, a pediment and a cross
      px(cx - 9, by - 1, INK, 19, 2)
      px(cx - 8, by - 1, '#b9b2a2', 17, 1)
      box(cx - 7, by - 11, 15, 11, '#bdb6a6', '#d9d3c5', '#8e887a')
      for (const x of [cx - 5, cx + 4]) {
        px(x, by - 10, '#e4dfd3', 1, 9)
        px(x + 1, by - 10, '#8e887a', 1, 9)
      }
      px(cx - 2, by - 8, INK, 5, 7)
      px(cx - 1, by - 9, INK, 3, 1)
      px(cx - 1, by - 7, '#1d1714', 3, 6)
      px(cx - 9, by - 12, INK, 19, 2)
      px(cx - 8, by - 12, '#a8a193', 17, 1)
      shape(px, cx - 8, by - 19, cx + 8, by - 12, (x, y) => y <= by - 12 && Math.abs(x - cx) <= (y - (by - 19)) * 1.2 + 1, x => (x < cx ? '#d9d3c5' : '#aaa395'))
      px(cx, by - 23, INK, 1, 4)
      px(cx - 1, by - 22, INK, 3, 1)
    },
    edit(px, cx, by, rnd) {
      // forge glow on the ground, dithered
      for (let y = -6; y <= 3; y++)
        for (let x = -12; x <= 6; x++) {
          const d = Math.hypot((x + 4) / 2, y)
          if (d < 3.2 && (x + y) % 2 === 0) px(cx + x, by + y, '#efb06a')
          else if (d < 4.6 && (x + y) % 2 === 0 && (x & 1)) px(cx + x, by + y, '#e8b986')
        }
      // the hut: stone walls, a slab roof, a glowing doorway, the chimney
      px(cx - 9, by - 10, INK, 14, 10)
      px(cx - 8, by - 9, '#a08c72', 12, 9)
      px(cx - 8, by - 9, '#bba68a', 1, 9)
      px(cx + 3, by - 9, '#7d6b55', 1, 9)
      for (let i = 0; i < 9; i++) px(cx - 7 + Math.floor(rnd() * 10), by - 8 + Math.floor(rnd() * 7), '#8a7760')
      px(cx - 11, by - 13, INK, 18, 3)
      px(cx - 10, by - 12, '#7a5236', 16, 1)
      px(cx + 1, by - 19, INK, 5, 7)
      px(cx + 2, by - 18, '#8f7b63', 3, 6)
      px(cx + 2, by - 18, '#a8947a', 1, 6)
      px(cx - 6, by - 7, INK, 5, 7)
      px(cx - 5, by - 6, '#e8742e', 3, 6)
      px(cx - 4, by - 4, '#ffd36b', 1, 4)
      // smoke and sparks over the chimney
      for (const [x, y, c] of [[3, -21, '#ffd36b'], [2, -23, '#f08a3a'], [5, -24, '#f6c35a'], [4, -26, '#e8742e']]) px(cx + x, by + y, c)
      // the anvil
      px(cx + 7, by - 6, INK, 8, 3)
      px(cx + 8, by - 5, '#9aa1a8', 6, 1)
      px(cx + 6, by - 5, INK, 1, 1)
      px(cx + 9, by - 3, INK, 4, 1)
      px(cx + 8, by - 2, INK, 6, 2)
      px(cx + 9, by - 2, '#5f666e', 4, 1)
      // hammer leaning on it
      px(cx + 15, by - 7, INK, 1, 6)
      px(cx + 14, by - 8, INK, 3, 2)
    },
    command(px, cx, by, rnd) {
      const pool = (x0, y0, rx, ry) => {
        shape(px, x0 - rx - 1, y0 - ry - 1, x0 + rx + 1, y0 + ry + 1, (x, y) => ((x - x0) / rx) ** 2 + ((y - y0) / ry) ** 2 <= 1, (x, y) =>
          y === y0 - ry + 1 && x > x0 - rx + 1 && x < x0 ? '#9cc09a' : (x + y) % 3 === 0 ? '#58775a' : '#628565',
        )
      }
      pool(cx - 6, by - 4, 7, 3.2)
      pool(cx + 7, by + 1, 5, 2.4)
      pool(cx + 3, by - 10, 4, 2)
      for (const [x, y] of [[-8, -4], [-3, -5], [7, 1], [4, -10]]) px(cx + x, by + y, '#b7d6a8')
      // reeds: stems with a cattail on top
      for (const [x, y, h] of [[-15, -1, 5], [-13, 0, 4], [-12, -2, 6], [0, 2, 4], [1, 1, 6], [12, -6, 5], [14, -5, 4], [-2, -9, 4]]) {
        px(cx + x, by + y - h, '#4e6a3a', 1, h)
        px(cx + x, by + y - h - 1, '#7a5230', 1, 2)
      }
      // a sunken dead tree
      px(cx + 12, by - 12, INK, 1, 7)
      px(cx + 10, by - 11, INK, 2, 1)
      px(cx + 13, by - 13, INK, 2, 1)
      px(cx + 9, by - 12, INK, 1, 1)
      void rnd
    },
    web(px, cx, by) {
      const peak = (mx, h, half, snow) => {
        const top = by - h
        shape(px, mx - half - 1, top - 1, mx + half + 1, by, (x, y) => y >= top && y <= by && Math.abs(x - mx) <= ((y - top) * half) / h + 0.5, (x, y) => {
          const left = x < mx || (x === mx && y < top + 2)
          if (y - top < snow + ((x * 7) % 3 === 0 ? 1 : 0)) return left ? '#f7f1e0' : '#d8d1c0'
          return left ? '#c9b798' : '#957f60'
        })
      }
      peak(cx - 9, 13, 9, 4)
      peak(cx + 10, 11, 8, 3)
      peak(cx, 20, 11, 6)
      // the cave mouth
      px(cx - 3, by - 5, INK, 6, 5)
      px(cx - 2, by - 6, INK, 4, 1)
      px(cx - 2, by - 5, '#1d1714', 4, 5)
      // bats over the peaks
      for (const [x, y] of [[-13, -20], [9, -23], [15, -17]]) {
        px(cx + x, by + y, INK, 2, 1)
        px(cx + x + 3, by + y, INK, 2, 1)
        px(cx + x + 2, by + y + 1, INK, 1, 1)
        px(cx + x + 1, by + y + 1, INK, 1, 1)
        px(cx + x + 3, by + y + 1, INK, 1, 1)
      }
    },
    other(px, cx, by, rnd) {
      // dense brush, drawn back to front
      const bush = (x0, y0, r) =>
        shape(px, x0 - r - 1, y0 - r - 1, x0 + r + 1, y0 + r, (x, y) => Math.hypot(x - x0, (y - y0) * 1.15) <= r + 0.3 && y <= y0 + 1, (x, y) =>
          x - x0 + (y - y0) < -1 ? '#9bb55e' : (x * 3 + y) % 5 === 0 ? '#5d7a3a' : '#6f8f45',
        )
      const spots = [[-12, -8, 3], [-6, -11, 4], [2, -12, 3], [9, -9, 4], [14, -6, 3], [-15, -3, 3], [-9, -4, 4], [-1, -6, 4], [7, -3, 3], [13, 0, 3], [-4, 0, 3]]
      for (const [x, y, r] of spots.sort((a, b) => a[1] - b[1])) bush(cx + x, by + y, r)
      // crossed bones and claw marks on open ground
      const bx = cx + 2
      const bb = by + 5
      for (let i = 0; i < 5; i++) {
        px(bx + i, bb - 2 + i, '#f6f0de')
        px(bx + 4 - i, bb - 2 + i, '#f6f0de')
      }
      for (const [x, y] of [[0, -3], [4, -3], [-1, -2], [5, -2], [0, 3], [4, 3], [-1, 2], [5, 2]]) px(bx + x, bb + y, INK)
      for (let k = 0; k < 3; k++) for (let i = 0; i < 4; i++) px(cx - 12 + k * 2 + i, by + 2 + i, SEPIA)
      void rnd
    },
    lair(px, cx, by) {
      const K = '#241c26'
      const tower = (x, y, w, h, f, l, s) => {
        px(x, y, K, w, h)
        px(x + 1, y + 1, f, w - 2, h - 2)
        px(x + 1, y + 1, l, 1, h - 2)
        px(x + w - 2, y + 1, s, 1, h - 2)
        for (let i = 0; i < w; i += 2) px(x + i, y - 2, K, 1, 2)
        for (let i = 0; i < w; i += 2) if (i > 0 && i < w - 1) px(x + i, y - 1, f, 1, 1)
        px(x, y - 2, K, 1, 2)
        px(x + w - 1, y - 2, K, 1, 2)
      }
      const F = '#5a5064'
      const L = '#7a7086'
      const S = '#3e3546'
      tower(cx - 15, by - 17, 7, 17, F, L, S)
      tower(cx + 9, by - 17, 7, 17, F, L, S)
      tower(cx - 9, by - 11, 19, 11, '#4e4558', '#665c72', S)
      tower(cx - 5, by - 26, 11, 26, F, L, S)
      // windows glowing red, the gate with its portcullis
      for (const [x, y] of [[-12, -13], [12, -13], [-2, -22], [2, -22], [-2, -16], [2, -16]]) {
        px(cx + x, by + y, '#ff7a4a', 1, 2)
        px(cx + x, by + y, '#ffc06a', 1, 1)
      }
      px(cx - 3, by - 7, K, 7, 7)
      px(cx - 2, by - 8, K, 5, 1)
      px(cx - 2, by - 7, '#16101a', 5, 7)
      for (const x of [-1, 1]) px(cx + x, by - 7, '#4a4050', 1, 7)
      px(cx - 2, by - 4, '#4a4050', 5, 1)
      // the banner: a pole and a crimson swallowtail flag with a gold crown
      px(cx, by - 38, SEPIA, 1, 12)
      px(cx, by - 39, '#f2c14e', 1, 1)
      shape(px, cx + 1, by - 38, cx + 12, by - 30, (x, y) => x >= cx + 1 && x <= cx + 12 && y >= by - 38 && y <= by - 30 && !(x > cx + 9 && Math.abs(y - (by - 34)) < x - (cx + 9)), () => '#b8402f')
      px(cx + 3, by - 35, '#f2c14e', 7, 2)
      px(cx + 3, by - 36, '#f2c14e', 1, 1)
      px(cx + 6, by - 36, '#f2c14e', 1, 1)
      px(cx + 9, by - 36, '#f2c14e', 1, 1)
      px(cx + 3, by - 37, '#f2c14e', 1, 1)
      px(cx + 6, by - 37, '#f2c14e', 1, 1)
      px(cx + 9, by - 37, '#f2c14e', 1, 1)
      px(cx + 2, by - 34, '#e3933a', 9, 1)
    },
    guild(px, cx, by) {
      // a timbered hall with a red roof, a sign and Clawd's orange pennant
      px(cx - 8, by - 9, INK, 16, 9)
      px(cx - 7, by - 8, '#f1e2bd', 14, 8)
      px(cx - 7, by - 8, '#fbf1d6', 1, 8)
      px(cx - 4, by - 8, '#7a5230', 1, 8)
      px(cx + 3, by - 8, '#7a5230', 1, 8)
      px(cx - 7, by - 5, '#7a5230', 14, 1)
      px(cx - 1, by - 5, INK, 3, 5)
      px(cx, by - 4, '#6b4423', 1, 4)
      px(cx - 6, by - 4, INK, 2, 2)
      px(cx + 5, by - 4, INK, 2, 2)
      px(cx - 6, by - 4, '#f2c14e', 1, 1)
      px(cx + 5, by - 4, '#f2c14e', 1, 1)
      shape(px, cx - 10, by - 17, cx + 10, by - 8, (x, y) => y <= by - 8 && y >= by - 16 && Math.abs(x - cx) <= (y - (by - 17)) * 1.15, (x, y) =>
        y === by - 8 ? '#8a3a2a' : x < cx ? ((x + y) % 4 === 0 ? '#b5523b' : '#c9674d') : (x + y) % 4 === 0 ? '#8a3a2a' : '#a8492f',
      )
      px(cx, by - 23, SEPIA, 1, 7)
      px(cx + 1, by - 23, '#D97757', 4, 1)
      px(cx + 1, by - 22, '#D97757', 3, 1)
      px(cx + 1, by - 21, '#c0613f', 2, 1)
      px(cx + 10, by - 6, SEPIA, 1, 6)
      px(cx + 8, by - 8, INK, 5, 3)
      px(cx + 9, by - 7, '#d9a65e', 3, 1)
    },
  }

  // Crossed swords: the marker over a region being fought.
  const SWORDS = ['k.......k', 'kwk...kwk', '.kwk.kwk.', '..kwkwk..', '...kwk...', '..kwkwk..', '.gkk.kkg.', 'gyg...gyg', '.g.....g.']
  const SWORD_C = { k: INK, w: '#eef1f4', g: '#b8862e', y: '#f2c14e' }

  function compass(px, x0, y0) {
    px(x0, y0 - 9, INK, 1, 2)
    for (let i = 1; i <= 7; i++) {
      const wide = i <= 3
      for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        const x = x0 + dx * i
        const y = y0 + dy * i
        if (wide) {
          // a two-tone point: the lit half and the shaded half
          const [ox, oy] = dx ? [0, 1] : [1, 0]
          px(x - ox, y - oy, '#f4e8c8')
          px(x + ox, y + oy, SEPIA)
        }
        px(x, y, INK)
      }
    }
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) for (let i = 1; i <= 3; i++) px(x0 + dx * i, y0 + dy * i, SEPIA)
    for (let a = 0; a < 40; a++) {
      const x = Math.round(x0 + Math.cos((a / 40) * Math.PI * 2) * 5.5)
      const y = Math.round(y0 + Math.sin((a / 40) * Math.PI * 2) * 5.5)
      if (a % 2 === 0) px(x, y, SEPIA)
    }
    px(x0, y0, '#b8402f')
  }

  function ribbon(px, cx, y, w, h) {
    const x0 = cx - Math.floor(w / 2)
    const x1 = x0 + w - 1
    const T = Math.round(h * 0.75) // tail length
    const D = Math.round(h * 0.3) // tails hang this much lower
    for (const side of [-1, 1]) {
      const inner = side < 0 ? x0 + 3 : x1 - 3
      const outer = side < 0 ? x0 - T : x1 + T
      const lo = Math.min(inner, outer)
      const hi = Math.max(inner, outer)
      const mid = y + D + (h - 1) / 2
      shape(px, lo, y + D, hi, y + D + h - 1, (x, yy) => {
        if (x < lo || x > hi || yy < y + D || yy > y + D + h - 1) return false
        const fromOuter = Math.abs(x - outer)
        return fromOuter >= Math.round(h / 2) - 1 - Math.abs(yy - mid) * 1.0
      }, (x, yy) => (yy >= y + D + h - 3 ? '#8f4329' : '#b8603f'))
      // the fold that tucks the band behind the tail
      const fx = side < 0 ? x0 : x1 - 3
      shape(px, fx, y + h - 1, fx + 3, y + h + D, (x, yy) => x >= fx && x <= fx + 3 && yy >= y + h - 1 && yy <= y + h + D - (side < 0 ? x - fx : fx + 3 - x) * 0, () => '#6e321f')
    }
    shape(px, x0, y, x1, y + h - 1, (x, yy) => x >= x0 && x <= x1 && yy >= y && yy <= y + h - 1, (x, yy) =>
      yy === y + 1 ? '#f2a585' : yy >= y + h - 3 ? '#a9553a' : '#D97757',
    )
    // stitched edge
    for (let x = x0 + 3; x < x1 - 2; x += 3) {
      px(x, y + 2, '#c4603f')
      px(x, y + h - 4, '#c4603f')
    }
  }

  function region(px, p, rnd) {
    const ph1 = rnd() * 6.28
    const ph2 = rnd() * 6.28
    const R = p.r ?? p.k.r
    const inside = (x, y) => {
      const dx = x - p.x
      const dy = (y - p.y) / 0.72
      const a = Math.atan2(dy, dx)
      return Math.hypot(dx, dy) <= R * (1 + 0.12 * Math.sin(3 * a + ph1) + 0.07 * Math.sin(5 * a + ph2))
    }
    for (let y = p.y - R; y <= p.y + R; y++)
      for (let x = p.x - R - 3; x <= p.x + R + 3; x++) {
        if (!inside(x, y)) continue
        const rim = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1)
        px(x, y, rim ? p.k.rim : p.k.tint)
      }
    for (let n = 0; n < 26; n++) {
      const x = p.x + Math.round((rnd() - 0.5) * R * 1.8)
      const y = p.y + Math.round((rnd() - 0.5) * R * 1.3)
      if (!inside(x - 1, y) || !inside(x + 2, y)) continue
      if (p.kind === 'read' || p.kind === 'edit' || p.kind === 'web') px(x, y, p.k.rim, rnd() > 0.5 ? 2 : 1, 1)
      else if (p.kind === 'command' || p.kind === 'other') px(x, y, p.k.rim), px(x + 1, y - 1, p.k.rim)
      else if (p.kind === 'lair') px(x, y, '#8d7c84')
    }
    LAND[p.kind](px, p.x, p.y + (p.kind === 'lair' ? 10 : p.kind === 'guild' ? 4 : 6), rnd)
    p.labelY = p.y + Math.round(R * 0.72) + 2
  }

  function drawBase(o) {
    const u = o.u ?? 3
    const cols = Math.ceil(o.w / u)
    const rows = Math.ceil(o.h / u)
    const A = v => Math.round(v / u)
    const rnd = rng(o.seed ?? 7)
    const art = canvas(cols, rows)
    const g = art.getContext('2d')
    const px = (x, y, c, w = 1, h = 1) => {
      g.fillStyle = c
      g.fillRect(x, y, w, h)
    }

    // 1. Parchment: two octaves of value noise for stains, a burnt rim, ordered dither between the tones.
    const grid = (n, cell) => {
      const gw = Math.ceil(cols / cell) + 2
      const gh = Math.ceil(rows / cell) + 2
      const v = Array.from({ length: gw * gh }, rnd)
      return (x, y) => {
        const fx = x / cell
        const fy = y / cell
        const ix = Math.floor(fx)
        const iy = Math.floor(fy)
        const sx = (fx - ix) ** 2 * (3 - 2 * (fx - ix))
        const sy = (fy - iy) ** 2 * (3 - 2 * (fy - iy))
        const at = (i, j) => v[j * gw + i]
        return (at(ix, iy) * (1 - sx) + at(ix + 1, iy) * sx) * (1 - sy) + (at(ix, iy + 1) * (1 - sx) + at(ix + 1, iy + 1) * sx) * sy
      }
    }
    const big = grid(0, 22)
    const small = grid(0, 7)
    const walk = (n, lo, hi) => {
      const out = []
      let d = lo + rnd() * (hi - lo)
      for (let i = 0; i < n; i++) {
        if (i % 2 === 0) d = Math.max(lo, Math.min(hi, d + (rnd() - 0.5) * 2.2))
        out.push(Math.round(d))
      }
      return out
    }
    const tear = { top: walk(cols, 1, 4), bottom: walk(cols, 1, 4), left: walk(rows, 1, 4), right: walk(rows, 1, 4) }
    const img = g.createImageData(cols, rows)
    const P = PAPER.map(hex)
    const T = hex(TABLE)
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        const e = Math.min(x - tear.left[y], cols - 1 - x - tear.right[y], y - tear.top[x], rows - 1 - y - tear.bottom[x])
        let c
        if (e < 0) c = T
        else {
          const burn = e < 12 ? (12 - e) / 12 : 0
          const v = 0.35 + big(x, y) * 1.5 + small(x, y) * 0.55 + burn * burn * 3.2
          c = P[Math.max(0, Math.min(P.length - 1, Math.floor(v + bayer(x, y) - 0.5) + (e === 0 ? 1 : 0)))]
        }
        img.data.set([c[0], c[1], c[2], 255], (y * cols + x) * 4)
      }
    g.putImageData(img, 0, 0)

    // 2. A cartographer's double rule just inside the torn edge.
    const m = 7
    for (const k of [m, m + 2]) {
      for (let x = k; x < cols - k; x++) if (x % 2 === 0 || k === m) px(x, k, SEPIA), px(x, rows - 1 - k, SEPIA)
      for (let y = k; y < rows - k; y++) if (y % 2 === 0 || k === m) px(k, y, SEPIA), px(cols - 1 - k, y, SEPIA)
    }
    for (const [x, y] of [[m, m], [cols - 1 - m, m], [m, rows - 1 - m], [cols - 1 - m, rows - 1 - m]]) px(x - 1, y - 1, INK, 3, 3)

    const places = (o.regions ?? []).map(r => ({ ...r, x: A(r.x), y: A(r.y), k: KIND[r.kind] }))
    const keep = (o.keep ?? []).map(([x, y, w, h]) => [A(x), A(y), A(w), A(h)])
    const free = (x, y, pad) =>
      x > m + 4 && y > m + 4 && x < cols - m - 5 && y < rows - m - 5 &&
      places.every(p => Math.hypot(x - p.x, (y - p.y) * 1.2) > (p.r ?? p.k.r) + pad) &&
      // and the labels under them
      places.every(p => !p.label || Math.abs(x - p.x) > 30 + pad || y < p.y || y > p.y + (p.r ?? p.k.r) * 0.72 + 20 + pad) &&
      (!o.compass || Math.hypot(x - A(o.compass.x), y - A(o.compass.y) + 4) > 16 + pad) &&
      keep.every(([kx, ky, kw, kh]) => x < kx - pad || x > kx + kw + pad || y < ky - pad || y > ky + kh + pad)

    // 3. The sea along one edge: a ragged coast, a shoal band and little wave marks.
    if (o.sea) {
      const along = o.sea === 'left' || o.sea === 'right' ? rows : cols
      const coast = walk(along, o.seaDepth ?? 16, (o.seaDepth ?? 16) + 7)
      for (let i = 0; i < along; i++) {
        const d = coast[i]
        for (let j = 0; j < d; j++) {
          const [x, y] = o.sea === 'left' ? [j, i] : o.sea === 'right' ? [cols - 1 - j, i] : o.sea === 'top' ? [i, j] : [i, rows - 1 - j]
          const e = Math.min(x - tear.left[y], cols - 1 - x - tear.right[y], y - tear.top[x], rows - 1 - y - tear.bottom[x])
          if (e < 0) continue
          const fromCoast = d - j
          const c = fromCoast === 1 ? SEPIA : fromCoast <= 3 ? ((x + y) % 2 ? '#c6d5bd' : '#b4c9b2') : fromCoast <= 5 && (x + y) % 2 ? '#b4c9b2' : '#a3bfae'
          px(x, y, c)
        }
      }
      for (let n = 0; n < along / 5; n++) {
        const i = Math.floor(rnd() * along)
        const j = 4 + Math.floor(rnd() * Math.max(1, coast[i] - 9))
        const [x, y] = o.sea === 'left' ? [j, i] : o.sea === 'right' ? [cols - 1 - j, i] : o.sea === 'top' ? [i, j] : [i, rows - 1 - j]
        if (x < m + 2 || y < m + 2 || x > cols - m - 3 || y > rows - m - 3) continue
        px(x, y, '#7fa39a', 2, 1)
        px(x + 2, y - 1, '#7fa39a', 2, 1)
      }
    }

    // 4. Map symbols on open ground: little woods, grass tufts and hills (symbols, not scenery).
    const tree = (x, y) => {
      px(x - 1, y - 4, INK, 3, 1)
      px(x - 2, y - 3, INK, 5, 2)
      px(x - 1, y - 1, INK, 3, 1)
      px(x - 1, y - 3, '#9db564', 2, 1)
      px(x + 1, y - 3, '#6f8a45', 1, 2)
      px(x - 1, y - 2, '#86a052', 2, 1)
      px(x, y, SEPIA, 1, 1)
    }
    const symbols = o.symbols ?? Math.round((cols * rows) / 900)
    for (let i = 0; i < symbols; i++) {
      const x = Math.floor(rnd() * cols)
      const y = Math.floor(rnd() * rows)
      const k = rnd()
      if (o.sea && ((o.sea === 'bottom' && y > rows - (o.seaDepth ?? 16) - 12) || (o.sea === 'left' && x < (o.seaDepth ?? 16) + 12) || (o.sea === 'right' && x > cols - (o.seaDepth ?? 16) - 12) || (o.sea === 'top' && y < (o.seaDepth ?? 16) + 12))) continue
      if (k < 0.45) {
        if (!free(x, y, 8)) continue
        const n = 3 + Math.floor(rnd() * 4)
        const pts = Array.from({ length: n }, () => [x + Math.round((rnd() - 0.5) * 12), y + Math.round((rnd() - 0.5) * 7)]).sort((a, b) => a[1] - b[1])
        for (const [tx, ty] of pts) if (free(tx, ty, 4)) tree(tx, ty)
      } else if (k < 0.8) {
        if (!free(x, y, 3)) continue
        px(x, y, '#a08a58')
        px(x + 2, y, '#a08a58')
        px(x + 1, y + 1, '#a08a58')
      } else {
        if (!free(x, y, 6)) continue
        for (let j = -4; j <= 4; j++) px(x + j, y - Math.round(Math.sqrt(16 - j * j) * 0.6), j < 0 ? SEPIA : '#a08a58')
        px(x - 2, y - 1, '#e6d3a4', 2, 1)
      }
    }

    // 5. Trails: dashed lines from the Guild to each region and to the Lair, bowed a little.
    const find = k => places.find(p => p.kind === k)
    const pairs = o.trails ?? places.filter(p => p.kind !== 'guild').map(p => ['guild', p.kind])
    pairs.forEach(([from, to, bend], i) => {
        const a = find(from)
        const p = find(to)
        if (!a || !p) return
        const ax = a.x
        const ay = a.y
        const bx = p.x
        const by = p.y
        const len = Math.hypot(bx - ax, by - ay)
        const bow = (bend ?? (i % 2 ? 0.14 : -0.14)) * len
        const cx = (ax + bx) / 2 + (-(by - ay) / len) * bow
        const cy = (ay + by) / 2 + ((bx - ax) / len) * bow
        let run = 0
        let lx = ax
        let ly = ay
        const steps = Math.ceil(len * 3)
        for (let s = 0; s <= steps; s++) {
          const t = s / steps
          const x = (1 - t) ** 2 * ax + 2 * (1 - t) * t * cx + t * t * bx
          const y = (1 - t) ** 2 * ay + 2 * (1 - t) * t * cy + t * t * by
          run += Math.hypot(x - lx, y - ly)
          lx = x
          ly = y
          if (run % 5 < 2.6) px(Math.round(x), Math.round(y), to === 'lair' ? '#b8402f' : TRAIL)
        }
      })

    // 6. Regions: a tinted patch with a rim, a scatter of ground detail, the landmark and its label.
    for (const p of places) region(px, p, rnd)

    // Token shadows: where a sprite stands on the map.
    for (const [x, y, w] of o.shadows ?? []) {
      const cx = A(x)
      const cy = A(y)
      const rx = A(w) / 2
      for (let yy = -2; yy <= 2; yy++)
        for (let xx = -Math.ceil(rx); xx <= Math.ceil(rx); xx++)
          if ((xx / rx) ** 2 + (yy / 2.4) ** 2 <= 1 && (xx + yy) % 2 === 0) px(cx + xx, cy + yy, PAPER[5])
    }

    if (o.compass) compass(px, A(o.compass.x), A(o.compass.y))
    if (o.ribbon) ribbon(px, A(o.ribbon.x), A(o.ribbon.y), A(o.ribbon.w), A(o.ribbon.h))

    // Upscale the art, then stamp the text on top (labels on the art grid, other text at its own scale).
    const out = canvas(o.w, o.h)
    const og = out.getContext('2d')
    og.imageSmoothingEnabled = false
    og.drawImage(art, 0, 0, cols * u, rows * u)
    for (const p of places) {
      if (!p.label) continue
      p.label.split('\n').forEach((line, i) =>
        stamp(og, line.toUpperCase(), p.x * u + u, (p.labelY + i * 8) * u, { size: 8, scale: u, halo: PAPER[0], color: INK }),
      )
    }
    if (o.compass) stamp(og, 'N', A(o.compass.x) * u + u, (A(o.compass.y) - 17) * u, { size: 8, scale: u, color: INK, halo: PAPER[0] })
    if (o.ribbon) {
      const r = o.ribbon
      const s = r.scale ?? u
      stamp(og, r.text, A(r.x) * u, 0, { font: 'Jersey 10', size: r.size, spacing: 1, scale: s, middle: (A(r.y) + A(r.h) / 2 - 0.5) * u, color: '#fff3dc', shadow: '#8f3b22' })
    }
    for (const tx of o.texts ?? []) stamp(og, tx.text, tx.x, tx.y, { size: 8, scale: u, color: INK, halo: tx.halo, ...tx })
    out.places = places.map(p => ({ kind: p.kind, x: p.x * u, y: p.y * u }))
    return out
  }

  // One region on its own (transparent background), for the bestiary cards.
  window.landmark = function landmark(target, kind, u, seed = 3) {
    const k = KIND[kind]
    const cols = k.r * 2 + 10
    const rows = Math.round(k.r * 0.72) + 34
    const art = canvas(cols, rows)
    const g = art.getContext('2d')
    const px = (x, y, c, w = 1, h = 1) => {
      g.fillStyle = c
      g.fillRect(x, y, w, h)
    }
    region(px, { kind, k, x: cols / 2, y: rows - Math.round(k.r * 0.72) - 2 }, rng(seed))
    target.width = cols * u
    target.height = rows * u
    const tg = target.getContext('2d')
    tg.imageSmoothingEnabled = false
    tg.drawImage(art, 0, 0, cols * u, rows * u)
  }

  let cache = { key: '', base: null }
  window.map = function map(target, o) {
    const u = o.u ?? 3
    if (target.width !== o.w) target.width = o.w
    if (target.height !== o.h) target.height = o.h
    const key = JSON.stringify({ ...o, t: 0, active: 0 })
    if (cache.key !== key) cache = { key, base: drawBase(o) }
    const g = target.getContext('2d')
    g.imageSmoothingEnabled = false
    g.drawImage(cache.base, 0, 0)
    // battle markers: crossed swords bobbing over every region being fought
    const bob = Math.floor((o.t ?? 0) * 4) % 2
    for (const p of cache.base.places) {
      if (!(o.active ?? []).includes(p.kind)) continue
      const x0 = p.x - 4 * u
      const y0 = p.y - (29 + bob) * u
      SWORDS.forEach((row, y) =>
        [...row].forEach((ch, x) => {
          if (ch === '.') return
          g.fillStyle = SWORD_C[ch]
          g.fillRect(x0 + x * u, y0 + y * u, u, u)
        }),
      )
    }
    return cache.base.places
  }
})()
