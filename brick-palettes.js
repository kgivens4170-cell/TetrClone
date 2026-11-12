/*
 * Elemental brick palettes + animated, high-detail pixel brick renderer.
 *
 * Classic script (no modules, no build step), so it works from file:// and
 * from any <script> tag. Exposes window.BrickPalettes (and module.exports
 * when loaded from Node).
 *
 * Usage:
 *   const { PALETTES, drawHalo, drawBrick } = BrickPalettes;
 *   drawHalo(ctx, PALETTES[0], x, y, 2, seed, t);   // optional glow ring
 *   drawBrick(ctx, PALETTES[0], x, y, 2, seed, t);  // scale = units per sprite pixel
 *
 *   x, y  : top-left position of the brick in the context's units
 *   scale : context units per sprite pixel
 *   seed  : any integer; keeps each brick's texture stable across frames
 *   t     : time in seconds (e.g. performance.now() / 1000)
 *
 * Each brick is a 32 x 14 sprite: a bevelled frame around an element texture,
 * with an animation on top. The still part of each brick is drawn once into a
 * cache at the context's real resolution, so the detail costs almost nothing
 * per frame; only the animated pixels are drawn every frame.
 */
(function (root) {
  'use strict';

  var W = 32;          // sprite pixels across
  var H = 14;          // sprite pixels down
  var TAU = Math.PI * 2;

  /*
   * tones: [0] outline / deep shadow, [1] dark, [2] base, [3] light, [4] spark (hottest highlight)
   * glow : colour of the halo drawn around the brick
   * fx   : name of the element texture and animation below
   */
  var PALETTES = [
    {
      id: 'inferno', name: 'Inferno', element: 'Fire',
      note: 'Molten core. Flame tongues lick upward and embers climb.',
      tones: ['#2a0800', '#7d1a02', '#ff4f0f', '#ffb42a', '#fff7b8'],
      glow: '#ff5a0a', fx: 'ember'
    },
    {
      id: 'tidal', name: 'Tidal', element: 'Water',
      note: 'Deep current. Ripples roll and a bright wave crosses the face.',
      tones: ['#021a3d', '#0b4a8f', '#1f94ff', '#86f4ff', '#ffffff'],
      glow: '#2fb8ff', fx: 'wave'
    },
    {
      id: 'verdant', name: 'Verdant', element: 'Poison',
      note: 'Toxic bloom. Grass blades on dark soil, bubbles rising.',
      tones: ['#071f0e', '#17602a', '#2fdc4a', '#d4ff3a', '#f6ffc4'],
      glow: '#7dff3a', fx: 'bubble'
    },
    {
      id: 'thunder', name: 'Thunder', element: 'Lightning',
      note: 'A jagged bolt runs through it. Now and then it flashes white.',
      tones: ['#14093a', '#3a2490', '#ffe81a', '#fffbd6', '#ffffff'],
      glow: '#b9a6ff', fx: 'thunder'
    },
    {
      id: 'glacier', name: 'Glacier', element: 'Ice',
      note: 'Cut crystal facets. A long glint slides across the surface.',
      tones: ['#0a2c4a', '#2a6f9e', '#9cf0ff', '#e6ffff', '#ffffff'],
      glow: '#7fe7ff', fx: 'glacier'
    },
    {
      id: 'gale', name: 'Gale', element: 'Air',
      note: 'Light and fast. Wind swirls and streaks slide through.',
      tones: ['#2e3f55', '#6e8fb0', '#cfeeff', '#ffffff', '#9dffd6'],
      glow: '#b8f0ff', fx: 'gale'
    },
    {
      id: 'terra', name: 'Terra', element: 'Earth',
      note: 'Mortared stone blocks with magma veins that breathe.',
      tones: ['#1f0c04', '#5a2a12', '#a8552a', '#ff9a3c', '#ffe0a0'],
      glow: '#ff7a20', fx: 'terra'
    },
    {
      id: 'void', name: 'Void', element: 'Shadow',
      note: 'Dark matter full of stars. A violet ring orbits the core.',
      tones: ['#04010c', '#1b0838', '#5b19c9', '#d05cff', '#ffc6ff'],
      glow: '#a040ff', fx: 'void'
    }
  ];

  // Deterministic hash in [0, 1). Same inputs always give the same value.
  function hash(x, y, s) {
    var h = Math.imul(x + 101, 374761393) ^ Math.imul(y + 977, 668265263) ^ Math.imul(s + 31, 2246822519);
    h = Math.imul(h ^ (h >>> 15), 2246822519);
    h = Math.imul(h ^ (h >>> 13), 3266489917);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  function mod(a, n) {
    return ((a % n) + n) % n;
  }

  // The element texture and animation cover the inner area, inside the bevelled frame.
  var IX0 = 2, IX1 = W - 3, IY0 = 2, IY1 = H - 3;     // inner area, inclusive
  var BASE = IY1 - 1;                                  // first of the two bottom rows

  /*
   * Static element textures: the detail that shows what each brick is made of.
   * Each returns a tone index (0-4) for an inner pixel, or -1 to keep the base shading.
   * Seeded, so every brick keeps its own pattern.
   */
  var TEXTURES = {
    ember: function (x, y, s) {                     // flame tongues over glowing embers
      if (y >= BASE) return hash(x, y, s) > 0.8 ? 3 : 1;
      var col = x >> 1;
      var h = 2 + Math.floor(hash(col, 0, s) * 6);  // tongue height
      var top = BASE - h;
      if (y === top) return hash(col, 1, s) > 0.5 ? 4 : 3;
      if (y > top && y <= top + 2) return 3;
      if (y > top) return hash(x, y, s) > 0.92 ? 3 : 2;
      return -1;
    },

    wave: function (x, y, s) {                      // bright surface, ripples, deep water
      if (y === IY0) return (x + s) % 9 === 0 ? 4 : 3;
      if (y === IY0 + 1) return (x + s) % 4 === 0 ? 3 : -1;
      if (y >= BASE) return 1;
      if (y % 3 === 0 && (x + s + y * 2) % 8 < 4) return 3;
      if (y % 3 === 1 && (x + s + y * 2) % 8 === 4) return 1;
      if ((x * 7 + y * 3 + s) % 37 === 0) return 4;
      return -1;
    },

    bubble: function (x, y, s) {                    // grass blades on dark soil, dew
      if (y >= BASE) return hash(x, y, s) > 0.85 ? 2 : 1;
      if (hash(x, 3, s) > 0.3) {
        var h = 2 + Math.floor(hash(x, 2, s) * 6);
        var tip = BASE - h;
        if (y === tip) return 3;
        if (y > tip) return (x + y) % 5 === 0 ? 3 : 2;
      }
      if (hash(x, y, s) > 0.97) return 4;
      return -1;
    },

    thunder: function (x, y, s) {                   // a jagged bolt with a glow around it
      var seg = x >> 2, f = (x & 3) / 4;
      var span = IY1 - IY0 - 3;
      var y0 = IY0 + 1 + Math.floor(hash(seg, 0, s) * span);
      var y1 = IY0 + 1 + Math.floor(hash(seg + 1, 0, s) * span);
      var yb = Math.round(y0 + (y1 - y0) * f);
      if (y === yb) return 4;
      if (Math.abs(y - yb) === 1) return 3;
      if (y >= BASE) return 1;
      if (hash(x, y, s) > 0.96) return 4;
      return -1;
    },

    glacier: function (x, y, s) {                   // cut facets with sharp edges, glints
      if (hash(x, y, s) > 0.97) return 4;
      var d = (x + 2 * y + s) % 11;
      if (d === 0) return 3;
      if (d === 1) return 4;
      if ((x - y + s + 99) % 9 === 0) return 1;
      if (y >= BASE) return 1;
      return -1;
    },

    gale: function (x, y, s) {                      // two wind swirls and leaf flecks
      var w1 = IY0 + 2 + Math.round(Math.sin(x * 0.45 + s) * 2);
      var w2 = IY0 + 7 + Math.round(Math.sin(x * 0.45 + s + 2.2) * 2);
      if ((y === w1 || y === w2) && (x + s) % 7 > 1) return 3;
      if ((y === w1 + 1 || y === w2 + 1) && (x + s) % 5 === 0) return 4;
      if (hash(x, y, s) > 0.96) return 4;
      if (y >= BASE) return 1;
      return -1;
    },

    terra: function (x, y, s) {                     // mortared stone blocks with lit edges, grains, pits
      var band = Math.floor((y - IY0) / 4), inBand = (y - IY0) % 4;
      var off = (band % 2) * 6;
      if (inBand === 3) return 1;
      if ((x + off + s) % 12 === 0) return 1;
      if (inBand === 0 && (x + off + s) % 12 !== 1) return 3;
      if (hash(x, y, s) > 0.9) return 3;
      if (hash(x, y, s) < 0.04) return 0;
      return -1;
    },

    void: function (x, y, s) {                      // dark matter, stars, violet wisps
      var h = hash(x, y, s);
      if (h > 0.975) return 4;
      if (h > 0.955) return 3;
      if ((x + y * 2 + s) % 13 === 0) return 2;
      if (hash(x, y, s + 9) < 0.18) return 0;
      return 1;
    }
  };

  /*
   * Element animations on top of the texture. Each takes an inner pixel (x, y),
   * time t and seed s, and returns a tone index to draw, or -1 for nothing.
   */
  var FX = {
    ember: function (x, y, t, s) {
      var r = hash(x >> 1, 0, s);
      if (y <= IY0 + 2 && Math.sin(x * 0.95 + t * 9 + r * TAU) > 0.45) return 3;   // flickering tips
      if (r > 0.72) {
        var pos = BASE - mod(t * 7 + r * 14, BASE - IY0);
        if (Math.round(pos) === y && (x & 1) === 0) return 4;                    // rising embers
      }
      return -1;
    },

    wave: function (x, y, t, s) {
      var c = H / 2 + (H / 4) * Math.sin(x * 0.4 + t * 3.2 + s);
      if (Math.abs(y - c) < 0.7) return 3;
      if (y === IY0 && hash(x, Math.floor(t * 8), s) > 0.94) return 4;
      return -1;
    },

    bubble: function (x, y, t, s) {
      var r = hash(x >> 1, 0, s);
      if (r > 0.8) {
        var py = Math.round(BASE - mod(t * (3 + r * 3) + r * 18, BASE - IY0));
        if (py === y) return 4;
        if (py + 1 === y) return 3;
      }
      if (y === (H >> 1) && hash(x, Math.floor(t * 4), s) > 0.93) return 3;
      return -1;
    },

    thunder: function (x, y, t, s) {
      var k = Math.floor(t * 6);
      if (hash(k, 0, s) < 0.82) return -1;           // mostly calm
      var yb = Math.round(H / 2 + Math.sin(x * 1.1 + k) * 2);
      return y === yb ? 4 : 3;                        // white flash with an arc
    },

    glacier: function (x, y, t, s) {
      var gx = Math.round(mod(t * 7 + s * 3, W + 8)) - 4, gy = H >> 1;
      var d = Math.abs(x - gx) + Math.abs(y - gy);
      if (d <= 1 || (d <= 3 && (x === gx || y === gy))) return 4;     // long plus-shaped glint
      return -1;
    },

    gale: function (x, y, t, s) {
      var m = mod(x - Math.floor(t * 30) + y * 3 + s, 17);
      if (m === 0) return 4;
      if (m >= 1 && m <= 3) return 3;
      return -1;
    },

    terra: function (x, y, t, s) {                    // magma veins that breathe
      var crack = mod(x * 3 + y * 5 + s * 7, 29) === 0 ||
                  (mod(x + 2 * y + s, 31) === 0 && y > IY0);
      if (!crack) return -1;
      return Math.sin(t * 2.2 + x * 0.3 + s) > -0.2 ? 4 : 3;
    },

    void: function (x, y, t, s) {                     // a ring of sparks orbiting the core
      var dx = x - (W - 1) / 2, dy = (y - (H - 1) / 2) * 2.2;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (Math.abs(d - 8) > 1) return -1;
      var a = mod(Math.atan2(dy, dx) - t * 2.5 + s, TAU);
      if (a < 0.9) return 4;
      if (a < 1.7) return 3;
      return -1;
    }
  };

  function none() { return -1; }

  // Frame and base shading. Returns -1 for the cut-away rounded corners.
  function tileIndex(x, y, s) {
    var cx = Math.min(x, W - 1 - x), cy = Math.min(y, H - 1 - y);
    if (cx + cy < 2) return -1;                       // rounded corners
    if (cx === 0 || cy === 0 || (cx === 1 && cy === 1)) return 0;   // outline
    var idx = 2;
    if (y === 1) idx = 3;                             // top bevel catches light
    else if (y === H - 2) idx = 1;                    // bottom bevel in shadow
    else if (x === 1) idx = 3;                        // left bevel lit
    else if (x === W - 2) idx = 1;                    // right bevel shaded
    if (idx === 2) {
      var n = hash(x, y, s);                          // fixed speckle per brick
      if (n > 0.92) idx = 3;
      else if (n < 0.06) idx = 1;
    }
    return idx;
  }

  function inner(x, y) {
    return x >= IX0 && x <= IX1 && y >= IY0 && y <= IY1;
  }

  // Tone index of the still sprite (frame + texture) at one pixel
  function staticIndex(palette, x, y, s) {
    var idx = tileIndex(x, y, s);
    if (idx < 0 || !inner(x, y)) return idx;
    var tx = (TEXTURES[palette.fx] || none)(x, y, s);
    return tx >= 0 ? tx : idx;
  }

  function paintStatic(ctx, palette, ox, oy, scale, s) {
    var tones = palette.tones;
    for (var y = 0; y < H; y++) {
      for (var x = 0; x < W; x++) {
        var idx = staticIndex(palette, x, y, s);
        if (idx < 0) continue;
        ctx.fillStyle = tones[idx];
        ctx.fillRect(ox + x * scale, oy + y * scale, scale, scale);
      }
    }
  }

  // ----- cache of still sprites, drawn at the destination's real resolution -----
  var cache = {}, cacheSize = 0;
  var canCache = typeof document !== 'undefined' && document.createElement;

  function deviceScale(ctx) {
    if (ctx.getTransform) {
      var m = ctx.getTransform();
      return Math.sqrt(m.a * m.a + m.b * m.b) || 1;
    }
    return 1;
  }

  function cachedSprite(palette, scale, s, dev) {
    var px = Math.max(1, Math.round(scale * dev));    // device pixels per sprite pixel
    var key = palette.id + '|' + s + '|' + px;
    var c = cache[key];
    if (c) return c;
    if (cacheSize > 3000) { cache = {}; cacheSize = 0; }
    c = document.createElement('canvas');
    c.width = W * px;
    c.height = H * px;
    paintStatic(c.getContext('2d'), palette, 0, 0, px, s);
    cache[key] = c;
    cacheSize++;
    return c;
  }

  /*
   * Draw one animated brick at (px, py), each sprite pixel `scale` units wide.
   */
  function drawBrick(ctx, palette, px, py, scale, seed, t) {
    var s = seed | 0;
    if (canCache) {
      var sprite = cachedSprite(palette, scale, s, deviceScale(ctx));
      var smooth = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(sprite, px, py, W * scale, H * scale);
      ctx.imageSmoothingEnabled = smooth;
    } else {
      paintStatic(ctx, palette, px, py, scale, s);
    }
    // Animated pixels on top
    var fx = FX[palette.fx] || none, tones = palette.tones;
    for (var y = IY0; y <= IY1; y++) {
      for (var x = IX0; x <= IX1; x++) {
        var o = fx(x, y, t, s);
        if (o < 0) continue;
        ctx.fillStyle = tones[o];
        ctx.fillRect(px + x * scale, py + y * scale, scale, scale);
      }
    }
  }

  /*
   * One-sprite-pixel glow ring around a brick, with a gentle pulse.
   * Draw it before drawBrick.
   */
  function drawHalo(ctx, palette, px, py, scale, seed, t) {
    var a = 0.22 + 0.12 * Math.sin(t * 3 + (seed | 0));
    var x0 = px - scale, y0 = py - scale;
    var w = (W + 2) * scale, h = (H + 2) * scale;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = palette.glow;
    ctx.fillRect(x0, y0, w, scale);
    ctx.fillRect(x0, y0 + h - scale, w, scale);
    ctx.fillRect(x0, y0 + scale, scale, h - 2 * scale);
    ctx.fillRect(x0 + w - scale, y0 + scale, scale, h - 2 * scale);
    ctx.restore();
  }

  var api = {
    W: W,
    H: H,
    PALETTES: PALETTES,
    drawBrick: drawBrick,
    drawHalo: drawHalo,
    tileIndex: tileIndex,
    staticIndex: staticIndex
  };

  root.BrickPalettes = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
