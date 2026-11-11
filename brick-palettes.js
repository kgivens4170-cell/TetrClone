/*
 * Elemental brick palettes + animated, hyper-pixelated brick renderer.
 *
 * Classic script (no modules, no build step), so it works from file:// and
 * from any <script> tag. Exposes window.BrickPalettes (and module.exports
 * when loaded from Node).
 *
 * Usage:
 *   const { PALETTES, drawHalo, drawBrick } = BrickPalettes;
 *   drawHalo(ctx, PALETTES[0], x, y, 6, seed, t);   // optional glow ring
 *   drawBrick(ctx, PALETTES[0], x, y, 6, seed, t);  // scale = screen px per logical px
 *
 *   x, y  : top-left screen position of the brick's logical grid
 *   scale : screen pixels per logical pixel (use integers for crisp pixels)
 *   seed  : any integer; keeps each brick's texture stable across frames
 *   t     : time in seconds (e.g. performance.now() / 1000)
 *
 * Each brick is a 16 x 7 logical-pixel grid. Animation is computed per frame
 * from t, so there is no per-brick state to manage.
 */
(function (root) {
  'use strict';

  var W = 16;          // logical pixels across
  var H = 7;           // logical pixels down
  var TAU = Math.PI * 2;

  /*
   * tones: [0] outline / deep shadow, [1] dark bevel, [2] base,
   *        [3] light / bright, [4] spark (hottest highlight)
   * glow : colour of the pixel halo drawn around the brick
   * fx   : name of the element animation in FX below
   */
  var PALETTES = [
    {
      id: 'inferno', name: 'Inferno', element: 'Fire',
      note: 'Molten core. Embers climb and flame tips flicker.',
      tones: ['#2a0800', '#7d1a02', '#ff4f0f', '#ffb42a', '#fff7b8'],
      glow: '#ff5a0a', fx: 'ember'
    },
    {
      id: 'tidal', name: 'Tidal', element: 'Water',
      note: 'Deep current. A bright wave rolls across the face.',
      tones: ['#021a3d', '#0b4a8f', '#1f94ff', '#86f4ff', '#ffffff'],
      glow: '#2fb8ff', fx: 'wave'
    },
    {
      id: 'verdant', name: 'Verdant', element: 'Poison',
      note: 'Toxic bloom. Bubbles rise and spores pulse.',
      tones: ['#071f0e', '#17602a', '#2fdc4a', '#d4ff3a', '#f6ffc4'],
      glow: '#7dff3a', fx: 'bubble'
    },
    {
      id: 'thunder', name: 'Thunder', element: 'Lightning',
      note: 'Mostly calm, then a crackle flashes white with a zigzag arc.',
      tones: ['#14093a', '#3a2490', '#ffe81a', '#fffbd6', '#ffffff'],
      glow: '#b9a6ff', fx: 'thunder'
    },
    {
      id: 'glacier', name: 'Glacier', element: 'Ice',
      note: 'Cut crystal facets. A sparkle glints across the surface.',
      tones: ['#0a2c4a', '#2a6f9e', '#9cf0ff', '#e6ffff', '#ffffff'],
      glow: '#7fe7ff', fx: 'glacier'
    },
    {
      id: 'gale', name: 'Gale', element: 'Air',
      note: 'Light and fast. Streaks of wind slide through the brick.',
      tones: ['#2e3f55', '#6e8fb0', '#cfeeff', '#ffffff', '#9dffd6'],
      glow: '#b8f0ff', fx: 'gale'
    },
    {
      id: 'terra', name: 'Terra', element: 'Earth',
      note: 'Cracked stone with magma veins that breathe.',
      tones: ['#1f0c04', '#5a2a12', '#a8552a', '#ff9a3c', '#ffe0a0'],
      glow: '#ff7a20', fx: 'terra'
    },
    {
      id: 'void', name: 'Void', element: 'Shadow',
      note: 'Dark matter. A violet ring of sparks orbits the core.',
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

  /*
   * Element animations. Each takes interior pixel (x, y), time t and seed s,
   * and returns a tone index (0-4) to override the base colour, or -1 to keep it.
   */
  var FX = {
    // Rising embers, with flame tips that flicker.
    ember: function (x, y, t, s) {
      var r = hash(x, 0, s);
      if (y === 1 && Math.sin(x * 1.9 + t * 9 + r * TAU) > 0.2) return 3;
      if (r > 0.7) {
        var pos = (H - 2) - mod(t * 3 + r * 7, H - 2);
        if (Math.round(pos) === y) return 4;
      }
      return -1;
    },

    // A bright band that rolls across, plus splash glints on top.
    wave: function (x, y, t, s) {
      var c = 3 + 1.3 * Math.sin(x * 0.8 + t * 3.2 + s);
      if (Math.abs(y - c) < 0.6) return 3;
      if (y === 1 && hash(x, Math.floor(t * 8), s) > 0.92) return 4;
      return -1;
    },

    // Bubbles rising through the brick, plus pulsing spores.
    bubble: function (x, y, t, s) {
      var r = hash(x, 0, s);
      if (r > 0.65) {
        var pos = (H - 2) - mod(t * (1.2 + r) + r * 9, H - 2);
        if (Math.round(pos) === y) return 4;
      }
      if (y === 3 && hash(x, Math.floor(t * 4), s) > 0.9) return 3;
      return -1;
    },

    // Calm most of the time, then a white flash with a zigzag arc.
    thunder: function (x, y, t, s) {
      var k = Math.floor(t * 6);
      if (hash(k, 0, s) < 0.82) return -1;
      if (y === 3 + mod(x + k, 3) - 1) return 4;
      return 3;
    },

    // A plus-shaped sparkle travels across the facets.
    glacier: function (x, y, t, s) {
      var gx = Math.round(mod(t * 3 + s, W + 4)) - 2;
      var gy = 3;
      if (Math.abs(x - gx) + Math.abs(y - gy) <= 1) return 4;
      if (mod(x + y * 2 + s, 7) === 0) return 3;
      return -1;
    },

    // Diagonal wind streaks sliding sideways.
    gale: function (x, y, t, s) {
      var m = mod(x - Math.floor(t * 14) + y * 3 + s, 9);
      if (m === 0) return 4;
      if (m === 4 || m === 5) return 3;
      return -1;
    },

    // Cracks that glow with lava, pulsing in and out.
    terra: function (x, y, t, s) {
      var crack = mod(x * 3 + y * 5 + s * 7, 13) === 0 ||
                  (mod(x + 2 * y + s, 17) === 0 && y > 1);
      if (!crack) return -1;
      return Math.sin(t * 2.2 + x * 0.5 + s) > -0.2 ? 4 : 3;
    },

    // A ring of sparks orbiting the centre of the brick.
    void: function (x, y, t, s) {
      var dx = x - (W - 1) / 2;
      var dy = (y - (H - 1) / 2) * 2;     // pixels are ~2x taller than wide
      var d = Math.sqrt(dx * dx + dy * dy);
      if (Math.abs(d - 4.0) > 0.7) return -1;
      var a = mod(Math.atan2(dy, dx) - t * 2.5 + s, TAU);
      if (a < 1.0) return 4;
      if (a < 1.8) return 3;
      return -1;
    }
  };

  // Static shape and bevel of the brick. Returns -1 for transparent corners.
  function tileIndex(x, y, s) {
    var edgeX = (x === 0 || x === W - 1);
    var edgeY = (y === 0 || y === H - 1);
    if (edgeX && edgeY) return -1;      // rounded corners
    if (edgeX || edgeY) return 0;       // outline
    var idx = 2;
    if (y === 1) idx = 3;               // top bevel catches light
    if (y === H - 2) idx = 1;           // bottom bevel in shadow
    if (x === W - 2 && idx === 2) idx = 1;
    if (idx === 2) {
      var n = hash(x, y, s);            // fixed speckle texture per brick
      if (n > 0.9) idx = 3;
      else if (n < 0.08) idx = 1;
    }
    return idx;
  }

  /*
   * Draw one animated brick. px, py is the top-left screen position of the
   * logical grid. Draws only solid rectangles, so the edges stay hard.
   */
  function drawBrick(ctx, palette, px, py, scale, seed, t) {
    var tones = palette.tones;
    var fx = FX[palette.fx] || function () { return -1; };
    var s = seed | 0;
    for (var y = 0; y < H; y++) {
      for (var x = 0; x < W; x++) {
        var idx = tileIndex(x, y, s);
        if (idx < 0) continue;
        if (idx > 0) {
          var o = fx(x, y, t, s);
          if (o >= 0) idx = o;
        }
        ctx.fillStyle = tones[idx];
        ctx.fillRect(px + x * scale, py + y * scale, scale, scale);
      }
    }
  }

  /*
   * One-logical-pixel glow ring around a brick, with a gentle pulse.
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
    tileIndex: tileIndex
  };

  root.BrickPalettes = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
