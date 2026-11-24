/*
 * Living 8-bit backdrops, one per scene.
 *
 * Classic script; exposes window.SceneArt (and module.exports from Node).
 *
 *   var art = SceneArt.make('RIVER', seed);   // null for an unknown scene
 *   art.paint(ctx);       // the still landscape; paint once into a cached canvas
 *   art.live(ctx, t);     // the moving parts (water, smoke, rain...), every frame
 *
 * Both draw in the game's 192 x 180 logical units, so the context should already
 * be scaled to the screen. Pixels are whole units (with a few half-unit details),
 * for an 8-bit look. The same seed always paints the same landscape.
 */
(function (root) {
  'use strict';

  var LW = 192, LH = 180, TAU = Math.PI * 2;

  // ---------- helpers ----------
  function rng(seed) {                                   // small seeded random (mulberry32)
    var a = seed | 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- stage colour grading ----------
  // Each stage grades every colour of a scene: a tint (applied more to bright colours,
  // so shadows stay dark), saturation and brightness. GRADE is set while a scene draws.
  var GRADES = [
    null,
    { tint: [255, 176, 112], amt: 0.30, sat: 1.0,  bright: 1.05 },   // 1 Dusty Dawn: warm
    { tint: [74, 138, 255],  amt: 0.34, sat: 0.95, bright: 0.92 },   // 2 Deep Tide: cool blue
    { tint: [255, 72, 40],   amt: 0.38, sat: 1.05, bright: 0.86 },   // 3 Ember Night: red
    { tint: [200, 236, 255], amt: 0.40, sat: 0.55, bright: 1.04 },   // 4 Frostfall: pale, icy
    { tint: [168, 72, 255],  amt: 0.42, sat: 0.9,  bright: 0.80 }    // 5 Void Tide: violet
  ];
  var GRADE = null;

  function makeGrade(stage) {
    var gr = GRADES[stage];
    if (!gr) return null;
    var cache = {};
    return function (col) {
      if (cache[col]) return cache[col];
      var m = /^#([0-9a-f]{6})$/i.exec(col);
      if (!m) return col;
      var n = parseInt(m[1], 16), rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
      var l = 0.3 * rgb[0] + 0.59 * rgb[1] + 0.11 * rgb[2];
      var out = rgb.map(function (v, i) {
        v = l + (v - l) * gr.sat;                                         // saturation
        v = v * (1 - gr.amt) + gr.tint[i] * (l / 255) * 1.4 * gr.amt;      // tint, scaled by brightness
        return Math.max(0, Math.min(255, Math.round(v * gr.bright)));
      });
      return (cache[col] = 'rgb(' + out[0] + ',' + out[1] + ',' + out[2] + ')');
    };
  }

  function G(col) { return GRADE ? GRADE(col) : col; }

  function rect(c, x, y, w, h, col) {
    c.fillStyle = G(col);
    c.fillRect(x, y, w, h);
  }

  function half(v) { return Math.round(v * 2) / 2; }

  function sky(c, top, bottom, y0, y1) {
    var g = c.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, G(top));
    g.addColorStop(1, G(bottom));
    c.fillStyle = g;
    c.fillRect(0, y0, LW, y1 - y0);
  }

  // A blocky filled ellipse, one unit per row
  function blob(c, cx, cy, rx, ry, col) {
    c.fillStyle = G(col);
    for (var dy = -ry; dy <= ry; dy++) {
      var w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (dy * dy) / (ry * ry || 1))));
      if (w > 0) c.fillRect(Math.round(cx - w), Math.round(cy + dy), 2 * w, 1);
    }
  }

  function speckle(c, r, x0, y0, w, h, n, cols) {
    for (var i = 0; i < n; i++) {
      rect(c, Math.round(x0 + r() * w), Math.round(y0 + r() * h), 1, 1, cols[Math.floor(r() * cols.length)]);
    }
  }

  // A mountain or dune range: fills from the ridge line down. Returns the ridge heights.
  function range(c, r, base, amp, freq, col, capCol) {
    var ph = r() * TAU, ph2 = r() * TAU, tops = [];
    for (var x = 0; x < LW; x++) {
      var h = Math.round(base - amp * (0.65 * Math.abs(Math.sin(x * freq + ph)) + 0.35 * Math.sin(x * freq * 2.3 + ph2)));
      tops.push(h);
      rect(c, x, h, 1, LH - h, col);
      if (capCol && h < base - amp * 0.6) rect(c, x, h, 1, 2 + (x % 3 === 0 ? 1 : 0), capCol);
    }
    return tops;
  }

  // A pixel pine tree
  function pine(c, x, baseY, h, col, trunk) {
    rect(c, Math.round(x), Math.round(baseY - 2), 1, 2, trunk);
    for (var dy = 0; dy < h; dy++) {
      var w = Math.floor((dy % 4 + dy / 2) * 0.5) + 1;
      rect(c, Math.round(x - w + 1), Math.round(baseY - 2 - h + dy), 2 * w - 1, 1, col);
    }
  }

  function stars(c, r, n, y1, cols) {
    for (var i = 0; i < n; i++) rect(c, Math.round(r() * LW), Math.round(r() * y1), 1, 1, cols[Math.floor(r() * cols.length)]);
  }

  // Wrap a value into [0, n)
  function wrap(v, n) { return ((v % n) + n) % n; }

  // ---------- scenes ----------
  var SCENES = {

    RIVER: function (seed) {
      var r = rng(seed), ph = r() * TAU, amp = 22 + r() * 14;
      function cx(y) { return LW / 2 + Math.sin(y * 0.03 + ph) * amp + Math.sin(y * 0.085 + ph * 2) * 6; }
      function hw(y) { return 13 + Math.sin(y * 0.05 + ph) * 3; }
      return {
        paint: function (c) {
          var p = rng(seed + 1);
          rect(c, 0, 0, LW, LH, '#173a1c');
          speckle(c, p, 0, 0, LW, LH, 900, ['#1d4622', '#12301a', '#24522a']);
          for (var y = 0; y < LH; y++) {
            var x = cx(y), w = hw(y);
            rect(c, Math.round(x - w - 3), y, Math.round(2 * w + 6), 1, '#4a3c22');   // muddy banks
            rect(c, Math.round(x - w), y, Math.round(2 * w), 1, '#103a64');           // water
            rect(c, Math.round(x - w * 0.45), y, Math.round(w * 0.9), 1, '#14487a');  // deeper middle
          }
          for (var i = 0; i < 30; i++) {                                         // stones and reeds
            var sy = Math.round(p() * LH), side = p() < 0.5 ? -1 : 1;
            var sx = cx(sy) + side * (hw(sy) + 4 + p() * 8);
            if (p() < 0.45) { blob(c, sx, sy, 2, 1, '#5a5a62'); rect(c, Math.round(sx - 1), sy - 1, 1, 1, '#7a7a84'); }
            else for (var k = 0; k < 3; k++) rect(c, Math.round(sx + k), sy - 3 - Math.round(p() * 3), 1, 4, '#3e7a2a');
          }
        },
        live: function (c, t) {
          c.globalAlpha = 0.55;
          for (var i = 0; i < 30; i++) {                                         // flowing current
            var y = wrap(i * 6.3 + t * 18, LH), w = hw(y);
            var x = cx(y) + (((i * 37) % 100) / 100 - 0.5) * w * 1.4;
            rect(c, half(x), half(y), 2.5, 0.5, i % 3 ? '#4a9ad8' : '#9fdcff');
          }
          c.globalAlpha = 1;
        }
      };
    },

    WATERFALL: function (seed) {
      var r = rng(seed), cw = 58 + Math.round(r() * 14), top = 18, pool = 148;
      var x0 = cw, x1 = LW - cw;
      return {
        paint: function (c) {
          var p = rng(seed + 1);
          sky(c, '#0d1a2c', '#122a3e', 0, pool);
          stars(c, p, 30, top, ['#3a5a7a', '#5a7a9a']);
          rect(c, x0, top, x1 - x0, pool - top, '#1a4a7a');                          // the falls
          for (var x = x0; x < x1; x += 3) rect(c, x, top, 1, pool - top, '#235c92');
          [[0, x0], [x1, LW]].forEach(function (s) {                                 // cliffs
            rect(c, s[0], top - 4, s[1] - s[0], LH, '#3a3028');
            for (var y = top; y < LH; y += 5 + Math.round(p() * 3)) rect(c, s[0], y, s[1] - s[0], 1, '#2c241e');
            speckle(c, p, s[0], top, s[1] - s[0], LH - top, 260, ['#4c4034', '#30281f', '#5a4a3a']);
            rect(c, s[0], top - 5, s[1] - s[0], 2, '#2e5a2a');                       // moss on top
            for (var k = 0; k < 4; k++) pine(c, s[0] + 6 + p() * (s[1] - s[0] - 12), top - 5, 8 + p() * 6, '#1e3e22', '#2a1e14');
          });
          rect(c, 0, pool, LW, LH - pool, '#14385e');                                // pool
          rect(c, x0 - 6, pool, x1 - x0 + 12, 2, '#9fd8ff');                         // foam line
        },
        live: function (c, t) {
          c.globalAlpha = 0.6;
          for (var i = 0; i < 44; i++) {                                             // falling streaks
            var x = x0 + ((i * 37) % (x1 - x0));
            var y = top + wrap(i * 23 + t * 70, pool - top);
            rect(c, x, half(y), 0.5, 4, i % 2 ? '#bfe8ff' : '#6ab4ec');
          }
          for (var j = 0; j < 8; j++) {                                              // mist at the base
            var mx = x0 - 8 + wrap(j * 17 + Math.sin(t + j) * 4, x1 - x0 + 16);
            c.globalAlpha = 0.18 + 0.1 * Math.sin(t * 2 + j);
            blob(c, mx, pool - 1, 6, 3, '#d8f0ff');
          }
          c.globalAlpha = 0.5;
          for (var k = 0; k < 3; k++) {                                              // ripples
            var ph = wrap(t * 0.5 + k / 3, 1), rw = 6 + ph * 40;
            c.globalAlpha = 0.5 * (1 - ph);
            rect(c, half(LW / 2 - rw), pool + 6 + k * 7, half(rw * 2), 0.5, '#6ab4ec');
          }
          c.globalAlpha = 1;
        }
      };
    },

    VOLCANO: function (seed) {
      var r = rng(seed), peak = 64 + Math.round(r() * 10), crater = 12;
      return {
        paint: function (c) {
          var p = rng(seed + 1);
          sky(c, '#2a0a06', '#120404', 0, LH);
          range(c, p, 130, 26, 0.03, '#1e0806');                                      // distant ridge
          for (var y = peak; y < LH; y++) {                                           // the cone
            var w = crater / 2 + (y - peak) * 0.7;
            rect(c, Math.round(LW / 2 - w), y, Math.round(2 * w), 1, '#2a1410');
          }
          speckle(c, p, 0, peak, LW, LH - peak, 400, ['#3a1e16', '#1e0c08']);
          rect(c, LW / 2 - crater / 2, peak - 1, crater, 3, '#ff6a14');               // lava crater
          for (var k = 0; k < 3; k++) {                                               // lava rivers
            var x = LW / 2 + (k - 1) * 4, dir = k - 1 || (p() < 0.5 ? -1 : 1);
            for (var y2 = peak + 2; y2 < LH; y2 += 2) {
              x += dir * (0.6 + p() * 0.8) + (p() - 0.5);
              rect(c, Math.round(x), y2, 2, 2, y2 % 6 ? '#c2380a' : '#ff7a1a');
            }
          }
        },
        live: function (c, t) {
          c.globalAlpha = 0.35 + 0.2 * Math.sin(t * 3);                               // crater glow pulse
          blob(c, LW / 2, peak - 2, crater, 4, '#ff9a3c');
          for (var i = 0; i < 9; i++) {                                               // smoke puffs
            var ph = wrap(t * 0.18 + i / 9, 1);
            c.globalAlpha = 0.45 * (1 - ph);
            blob(c, LW / 2 + Math.sin(ph * 6 + i) * 10 * ph + ph * 20, peak - 4 - ph * 70, 3 + ph * 10, 2 + ph * 6, '#3a2a2a');
          }
          c.globalAlpha = 0.8;
          for (var j = 0; j < 14; j++) {                                              // embers
            var e = wrap(t * 0.4 + j / 14, 1);
            rect(c, half(LW / 2 + Math.sin(j * 7 + e * 9) * 18 * e), half(peak - e * 90), 0.5, 0.5, j % 2 ? '#ffb42a' : '#ff4f0f');
          }
          c.globalAlpha = 1;
        }
      };
    },

    FOREST: function (seed) {
      var r = rng(seed), flies = [];
      for (var i = 0; i < 16; i++) flies.push({ x: r() * LW, y: 60 + r() * 110, p: r() * TAU });
      return {
        paint: function (c) {
          var p = rng(seed + 1);
          sky(c, '#0f1c14', '#0a140e', 0, LH);
          stars(c, p, 25, 50, ['#3a5a44', '#5a7a64']);
          [['#13261a', 70, 22], ['#173020', 100, 26], ['#1c3a24', 135, 30]].forEach(function (layer) {
            rect(c, 0, layer[1], LW, LH - layer[1], layer[0]);
            for (var x = -6; x < LW + 6; x += 7 + p() * 6) pine(c, x, layer[1] + 2, layer[2] * (0.6 + p() * 0.5), layer[0], '#0c1810');
          });
          rect(c, 0, LH - 10, LW, 10, '#14260f');
          speckle(c, p, 0, LH - 10, LW, 10, 120, ['#1e3a16', '#0e1c0a']);
        },
        live: function (c, t) {
          for (var i = 0; i < flies.length; i++) {                                    // fireflies
            var f = flies[i];
            c.globalAlpha = Math.max(0, Math.sin(t * 2 + f.p)) * 0.9;
            rect(c, half(f.x + Math.sin(t * 0.7 + f.p) * 8), half(f.y + Math.cos(t * 0.5 + f.p) * 5), 0.5, 0.5, '#d4ff6a');
          }
          c.globalAlpha = 0.7;
          for (var j = 0; j < 6; j++) {                                               // falling leaves
            var ph = wrap(t * 0.08 + j / 6, 1);
            rect(c, half(wrap(j * 37 + Math.sin(ph * 12) * 6, LW)), half(ph * LH), 1, 0.5, j % 2 ? '#3e7a32' : '#6a9a2a');
          }
          c.globalAlpha = 1;
        }
      };
    },

    MOUNTAINS: function (seed) {
      var r = rng(seed), clouds = [];
      for (var i = 0; i < 5; i++) clouds.push({ x: r() * LW, y: 18 + r() * 40, w: 10 + r() * 14, s: 2 + r() * 4 });
      return {
        paint: function (c) {
          var p = rng(seed + 1);
          sky(c, '#14243c', '#0a1220', 0, LH);
          stars(c, p, 30, 60, ['#3a4a6a', '#6a7a9a']);
          range(c, p, 100, 44, 0.025, '#26344a', '#cfe6ff');
          range(c, p, 130, 36, 0.035, '#1e2a3a', '#a8c0dc');
          var front = range(c, p, 160, 22, 0.05, '#162030');
          for (var x = 4; x < LW; x += 6 + p() * 8) pine(c, x, front[Math.round(x)] + 6, 6 + p() * 5, '#0f1a24', '#0a1018');
        },
        live: function (c, t) {
          for (var i = 0; i < clouds.length; i++) {                                   // drifting clouds
            var k = clouds[i], x = wrap(k.x + t * k.s, LW + 60) - 30;
            c.globalAlpha = 0.45;
            blob(c, x, k.y, k.w, 3, '#3a4a64');
            blob(c, x + k.w * 0.4, k.y - 2, k.w * 0.5, 2, '#4a5a74');
          }
          c.globalAlpha = 1;
        }
      };
    },

    STORM: function (seed) {
      var r = rng(seed);
      return {
        paint: function (c) {
          var p = rng(seed + 1);
          sky(c, '#10141c', '#06080c', 0, LH);
          range(c, p, 165, 14, 0.04, '#0c1010');
          for (var i = 0; i < 26; i++) blob(c, p() * LW, 6 + p() * 34, 12 + p() * 16, 5 + p() * 5, i % 2 ? '#1c2230' : '#262c3c');
        },
        live: function (c, t) {
          c.globalAlpha = 0.45;
          for (var i = 0; i < 70; i++) {                                              // slanting rain
            var x = wrap(i * 29 + t * 30, LW), y = wrap(i * 47 + t * 150, LH);
            rect(c, half(x), half(y), 0.5, 3, '#5a6a8a');
          }
          var cycle = 3.7, k = Math.floor(t / cycle), ph = t - k * cycle;
          if (ph < 0.18) {                                                            // lightning
            var lr = rng(seed + k * 31), bx = 20 + lr() * (LW - 40), by = 30;
            c.globalAlpha = 0.25 * (1 - ph / 0.18);
            rect(c, 0, 0, LW, LH, '#cfd6ff');
            c.globalAlpha = 0.9;
            while (by < 160) {
              var nx = bx + (lr() - 0.5) * 10, ny = by + 6 + lr() * 8;
              for (var s = 0; s <= 6; s++) rect(c, half(bx + (nx - bx) * s / 6), half(by + (ny - by) * s / 6), 1, 1, '#fffbd6');
              bx = nx; by = ny;
            }
          }
          c.globalAlpha = 1;
        }
      };
    },

    CRYSTAL: function (seed) {
      var r = rng(seed), gems = [];
      for (var i = 0; i < 26; i++) {                     // clusters on the ceiling and floor
        var onFloor = r() < 0.55, base = 10 + r() * (LW - 20);
        for (var k = 0; k < 3; k++) {
          gems.push({ x: base + (k - 1) * (3 + r() * 3), y: onFloor ? 172 - r() * 4 : 6 + r() * 4,
                      h: (k === 1 ? 14 : 8) + r() * 12, up: onFloor, c: r() < 0.6 ? 0 : 1 });
        }
      }
      var COLS = [['#2a8ab0', '#5ad8ff', '#d8f8ff'], ['#5a1a9a', '#a040ff', '#f0c8ff']];
      function gem(c, g, bright) {
        var cols = COLS[g.c];
        for (var dy = 0; dy < g.h; dy++) {
          var w = Math.max(1, Math.round((g.h - dy) * 0.45));
          var y = g.up ? g.y - dy : g.y + dy;
          rect(c, Math.round(g.x - w / 2), Math.round(y), w, 1, dy % 3 === 0 ? cols[1] : cols[0]);
          if (bright) rect(c, Math.round(g.x - w / 2), Math.round(y), 1, 1, cols[2]);
        }
      }
      return {
        paint: function (c) {
          var p = rng(seed + 1);
          rect(c, 0, 0, LW, LH, '#0c0a18');
          for (var y = 0; y < LH; y++) {                                              // jagged cave walls
            var lw = 10 + Math.round(Math.sin(y * 0.12 + seed) * 5 + p() * 3), rw = 10 + Math.round(Math.cos(y * 0.1 + seed) * 5 + p() * 3);
            rect(c, 0, y, lw, 1, '#1a1630'); rect(c, LW - rw, y, rw, 1, '#1a1630');
          }
          rect(c, 0, 0, LW, 6, '#1a1630'); rect(c, 0, LH - 6, LW, 6, '#1a1630');
          speckle(c, p, 0, 0, LW, LH, 300, ['#14102a', '#221c3c']);
          for (var i = 0; i < gems.length; i++) gem(c, gems[i], false);
        },
        live: function (c, t) {
          for (var i = 0; i < gems.length; i++) {                                     // glowing crystals
            c.globalAlpha = 0.3 + 0.3 * Math.sin(t * 1.6 + i);
            gem(c, gems[i], true);
          }
          c.globalAlpha = 1;
          for (var j = 0; j < 12; j++) {                                              // sparkles
            var a = Math.max(0, Math.sin(t * 3 + j * 1.7));
            c.globalAlpha = a;
            rect(c, half(wrap(j * 53, LW)), half(30 + wrap(j * 37, 120)), 0.5, 0.5, '#ffffff');
          }
          c.globalAlpha = 1;
        }
      };
    },

    'SKY ISLANDS': function (seed) {
      var r = rng(seed), islands = [], clouds = [];
      for (var i = 0; i < 3; i++) islands.push({ x: 24 + i * 70 + r() * 20, y: 60 + r() * 70, w: 14 + r() * 10 });
      for (var j = 0; j < 6; j++) clouds.push({ x: r() * LW, y: 20 + r() * 140, w: 8 + r() * 12, s: 3 + r() * 5 });
      var fall = islands[1];
      return {
        paint: function (c) {
          var p = rng(seed + 1);
          sky(c, '#1a3a5c', '#0e1e34', 0, LH);
          for (var k = 0; k < 8; k++) blob(c, p() * LW, 140 + p() * 40, 20 + p() * 20, 6, '#1e3654');
          islands.forEach(function (is) {
            for (var dy = 0; dy < is.w * 0.8; dy++) {                                 // tapering rock
              var w = Math.max(1, Math.round(is.w * (1 - dy / (is.w * 0.8))));
              rect(c, Math.round(is.x - w), Math.round(is.y + dy), 2 * w, 1, dy % 3 ? '#4a3424' : '#3a281c');
            }
            rect(c, Math.round(is.x - is.w), Math.round(is.y - 2), Math.round(is.w * 2), 2, '#3e7a2e');   // grass
            for (var v = 0; v < 4; v++) rect(c, Math.round(is.x - is.w + 3 + p() * is.w * 1.6), Math.round(is.y + 2), 0.5, 3 + p() * 6, '#2e5a22');
            pine(c, is.x - is.w * 0.4, is.y - 1, 6, '#2a5a22', '#3a281c');
          });
        },
        live: function (c, t) {
          for (var i = 0; i < clouds.length; i++) {
            var k = clouds[i];
            c.globalAlpha = 0.35;
            blob(c, wrap(k.x + t * k.s, LW + 40) - 20, k.y, k.w, 2, '#bcd4ec');
          }
          c.globalAlpha = 0.7;                                                        // a waterfall off an island
          for (var j = 0; j < 12; j++) {
            rect(c, half(fall.x + 2 + (j % 3)), half(fall.y + fall.w * 0.8 + wrap(j * 9 + t * 40, 70)), 0.5, 3, '#9fd8ff');
          }
          for (var b = 0; b < 3; b++) {                                               // birds
            var bx = wrap(b * 60 + t * 12, LW + 20) - 10, by = 30 + b * 22 + Math.sin(t * 2 + b) * 3;
            var flap = Math.floor(t * 6 + b) % 2;
            rect(c, half(bx), half(by), 1, 0.5, '#0a1424');
            rect(c, half(bx - 1), half(by - (flap ? 0.5 : 0)), 1, 0.5, '#0a1424');
            rect(c, half(bx + 1), half(by - (flap ? 0.5 : 0)), 1, 0.5, '#0a1424');
          }
          c.globalAlpha = 1;
        }
      };
    },

    SWAMP: function (seed) {
      var r = rng(seed), water = 128;
      return {
        paint: function (c) {
          var p = rng(seed + 1);
          sky(c, '#0e1a14', '#162a1e', 0, water);
          for (var i = 0; i < 6; i++) {                                               // dead trees
            var x = Math.round(10 + i * 32 + p() * 14), h = 40 + p() * 50;
            rect(c, x, water - h, 3, h, '#0a120c');
            for (var b = 0; b < 3; b++) {
              var by = Math.round(water - h + 6 + p() * h * 0.5), dir = p() < 0.5 ? -1 : 1;
              for (var k = 0; k < 6; k++) rect(c, x + 1 + dir * k, by - Math.round(k * 0.6), 1, 1, '#0a120c');
            }
          }
          rect(c, 0, water, LW, LH - water, '#0e2a22');
          for (var y = water + 3; y < LH; y += 5) rect(c, 0, y, LW, 0.5, '#123426');
          for (var j = 0; j < 9; j++) blob(c, p() * LW, water + 8 + p() * 44, 3, 1, '#2e5a2a');   // lily pads
          for (var k2 = 0; k2 < 18; k2++) rect(c, Math.round(p() * LW), water - 4 - Math.round(p() * 6), 1, 8, '#24442a');   // reeds
        },
        live: function (c, t) {
          for (var i = 0; i < 4; i++) {                                               // fog banks
            c.globalAlpha = 0.12;
            blob(c, wrap(i * 70 + t * (4 + i), LW + 80) - 40, 90 + i * 18, 40, 4, '#a8c8b0');
          }
          c.globalAlpha = 0.7;
          for (var j = 0; j < 8; j++) {                                               // bubbles
            var ph = wrap(t * 0.3 + j / 8, 1);
            rect(c, half(wrap(j * 41, LW)), half(LH - 4 - ph * 44), 1, 1, ph > 0.9 ? '#cfe8d0' : '#5a8a64');
          }
          c.globalAlpha = 1;
        }
      };
    },

    DESERT: function (seed) {
      var r = rng(seed), sunX = 40 + r() * 110, cacti = [];
      for (var i = 0; i < 4; i++) cacti.push({ x: 10 + r() * (LW - 20), h: 8 + r() * 8 });
      return {
        paint: function (c) {
          var p = rng(seed + 1);
          sky(c, '#3e1c10', '#1a0c08', 0, LH);
          blob(c, sunX, 44, 22, 22, '#ff9a3c');                                       // setting sun
          for (var y = 30; y < 66; y += 5) rect(c, sunX - 24, y, 48, 1.5, '#3e1c10');
          range(c, p, 120, 12, 0.03, '#5a3a1e');
          range(c, p, 145, 12, 0.045, '#4a2e16');
          var front = range(c, p, 168, 9, 0.06, '#3a2410');
          speckle(c, p, 0, 120, LW, 60, 220, ['#6a4626', '#2a180a']);
          cacti.forEach(function (k) {
            var bx = Math.round(k.x), by = front[bx] + 2;
            rect(c, bx, by - k.h, 2, k.h, '#2a3a1a');
            rect(c, bx - 3, by - k.h * 0.7, 3, 1, '#2a3a1a'); rect(c, bx - 3, by - k.h * 0.7 - 3, 1, 3, '#2a3a1a');
            rect(c, bx + 2, by - k.h * 0.5, 3, 1, '#2a3a1a'); rect(c, bx + 4, by - k.h * 0.5 - 3, 1, 3, '#2a3a1a');
          });
        },
        live: function (c, t) {
          c.globalAlpha = 0.18;
          for (var y = 100; y < 130; y += 3) {                                        // heat shimmer
            rect(c, half(Math.sin(t * 3 + y) * 6), y, LW, 0.5, '#ffcf8a');
          }
          c.globalAlpha = 0.6;
          for (var i = 0; i < 24; i++) {                                              // blowing sand
            rect(c, half(wrap(i * 31 + t * 40, LW)), half(110 + wrap(i * 17, 70) + Math.sin(t * 2 + i) * 2), 1, 0.5, '#d8a060');
          }
          c.globalAlpha = 1;
        }
      };
    },

    ARCANE: function (seed) {
      var r = rng(seed), cx = LW / 2, cy = 86, R = 58;
      return {
        paint: function (c) {
          var p = rng(seed + 1);
          sky(c, '#160a26', '#08040e', 0, LH);
          stars(c, p, 40, LH, ['#3a2a5a', '#5a3a8a']);
          for (var a = 0; a < 360; a += 1.5) {                                        // rune rings
            var rad = a * Math.PI / 180;
            rect(c, Math.round(cx + Math.cos(rad) * R), Math.round(cy + Math.sin(rad) * R * 0.9), 1, 1, '#3a1a5c');
            rect(c, Math.round(cx + Math.cos(rad) * R * 0.7), Math.round(cy + Math.sin(rad) * R * 0.63), 1, 1, '#2a1448');
          }
          for (var k = 0; k < 6; k++) {                                               // star lines inside
            var a1 = k * TAU / 6, a2 = a1 + 2 * TAU / 6;
            for (var s = 0; s <= 30; s++) {
              var f = s / 30;
              rect(c, Math.round(cx + (Math.cos(a1) * (1 - f) + Math.cos(a2) * f) * R * 0.7),
                      Math.round(cy + (Math.sin(a1) * (1 - f) + Math.sin(a2) * f) * R * 0.63), 1, 1, '#24103e');
            }
          }
          [[6, 22], [LW - 22, 22]].forEach(function (q) {                             // pillars
            rect(c, q[0], 40, 16, LH - 40, '#1a1030'); rect(c, q[0] - 2, 36, 20, 5, '#24163e');
          });
        },
        live: function (c, t) {
          for (var i = 0; i < 12; i++) {                                              // glyphs orbiting the ring
            var a = t * 0.3 + i * TAU / 12;
            c.globalAlpha = 0.5 + 0.4 * Math.sin(t * 2 + i);
            rect(c, half(cx + Math.cos(a) * R - 1), half(cy + Math.sin(a) * R * 0.9 - 1), 2, 2, i % 2 ? '#d05cff' : '#9cf0ff');
          }
          c.globalAlpha = 0.6;
          for (var j = 0; j < 14; j++) {                                              // rising motes
            var ph = wrap(t * 0.12 + j / 14, 1);
            rect(c, half(wrap(j * 47, LW)), half(LH - ph * LH), 0.5, 0.5, '#ffc6ff');
          }
          c.globalAlpha = 1;
        }
      };
    },

    BAMBOO: function (seed) {
      var r = rng(seed), front = [];
      for (var i = 0; i < 9; i++) front.push({ x: 6 + i * 22 + r() * 8, p: r() * TAU });
      return {
        paint: function (c) {
          var p = rng(seed + 1);
          sky(c, '#0e1a10', '#142614', 0, LH);
          for (var x = 2; x < LW; x += 5 + p() * 4) {                                 // back grove
            rect(c, Math.round(x), 0, 2, LH, '#183018');
            for (var y = 6 + p() * 10; y < LH; y += 14) rect(c, Math.round(x), Math.round(y), 2, 1, '#122612');
          }
          rect(c, 0, LH - 8, LW, 8, '#1a2a12');
        },
        live: function (c, t) {
          for (var i = 0; i < front.length; i++) {                                    // swaying front stalks
            var s = front[i], sway = Math.sin(t * 0.8 + s.p) * 2;
            for (var y = 0; y < LH - 8; y += 1) {
              var x = s.x + sway * (1 - y / LH);
              rect(c, half(x), y, 3, 1, y % 16 === 0 ? '#3e7a32' : '#2a5a26');
            }
            for (var k = 0; k < 3; k++) {                                             // leaves at the joints
              var ly = 20 + k * 48 + (i % 3) * 8, lx = s.x + sway * (1 - ly / LH);
              rect(c, half(lx + 3), half(ly), 5, 1, '#4a8a3a');
              rect(c, half(lx - 4), half(ly + 3), 4, 1, '#3e7a32');
            }
          }
          c.globalAlpha = 0.7;
          for (var j = 0; j < 5; j++) {                                               // drifting leaves
            var ph = wrap(t * 0.07 + j / 5, 1);
            rect(c, half(wrap(j * 41 + Math.sin(ph * 10) * 8, LW)), half(ph * LH), 1.5, 0.5, '#6a9a3a');
          }
          c.globalAlpha = 1;
        }
      };
    },

    METEOR: function (seed) {
      var r = rng(seed);
      return {
        paint: function (c) {
          var p = rng(seed + 1);
          sky(c, '#0a0818', '#050410', 0, LH);
          stars(c, p, 70, 140, ['#4a4a7a', '#8a8ab8', '#cfd6ff']);
          blob(c, 40 + p() * 110, 40 + p() * 30, 14, 14, '#2a1e3a');                   // distant planet
          var ground = range(c, p, 168, 6, 0.05, '#1a1418');
          for (var i = 0; i < 4; i++) {                                               // craters
            var x = 20 + p() * (LW - 40), y = ground[Math.round(x)] + 4;
            blob(c, x, y, 7, 2, '#100c10'); rect(c, Math.round(x - 7), Math.round(y - 2), 14, 1, '#2a2228');
          }
        },
        live: function (c, t) {
          for (var i = 0; i < 3; i++) {                                               // meteors streaking down
            var ph = wrap(t * 0.22 + i / 3, 1);
            var x = LW + 20 - ph * (LW + 60) + i * 30, y = -10 + ph * 150;
            for (var k = 0; k < 14; k++) {
              c.globalAlpha = (1 - k / 14) * 0.85;
              rect(c, half(x + k * 1.5), half(y - k), 1, 1, k < 2 ? '#ffe0a0' : '#ff7a20');
            }
          }
          for (var j = 0; j < 10; j++) {                                              // twinkle
            c.globalAlpha = Math.max(0, Math.sin(t * 2 + j * 2.1));
            rect(c, half(wrap(j * 59, LW)), half(wrap(j * 31, 130)), 0.5, 0.5, '#ffffff');
          }
          c.globalAlpha = 1;
        }
      };
    }
  };

  // ---------- stage weather, drawn over every scene ----------
  function weather(c, t, stage, seed) {
    var i, ph;
    if (stage === 1) {                                     // Dusty Dawn: light rays and dust
      for (i = 0; i < 4; i++) {
        c.globalAlpha = 0.05 + 0.03 * Math.sin(t * 0.4 + i);
        var rx = wrap(i * 60 + t * 3, LW + 80) - 40;
        for (var y = 0; y < LH; y += 2) c.fillStyle = '#ffd8a0', c.fillRect(Math.round(rx + y * 0.5), y, 10, 2);
      }
      c.globalAlpha = 0.6;
      for (i = 0; i < 18; i++) {
        c.fillStyle = '#ffe0b0';
        c.fillRect(half(wrap(i * 47 + t * 4, LW)), half(wrap(i * 29 + Math.sin(t * 0.6 + i) * 6, LH)), 0.5, 0.5);
      }
    } else if (stage === 2) {                              // Deep Tide: low mist and drizzle
      for (i = 0; i < 3; i++) {
        c.globalAlpha = 0.10;
        var mx = wrap(i * 80 + t * (5 + i * 2), LW + 120) - 60;
        c.fillStyle = '#9fc8ff';
        for (var dy = -3; dy <= 3; dy++) c.fillRect(Math.round(mx - 50 + Math.abs(dy) * 6), 150 + i * 8 + dy, 100 - Math.abs(dy) * 12, 1);
      }
      c.globalAlpha = 0.35;
      c.fillStyle = '#8ab8ff';
      for (i = 0; i < 30; i++) c.fillRect(half(wrap(i * 37 + t * 6, LW)), half(wrap(i * 53 + t * 90, LH)), 0.5, 2);
    } else if (stage === 3) {                              // Ember Night: falling ash, rising embers
      c.globalAlpha = 0.5;
      for (i = 0; i < 22; i++) {
        c.fillStyle = '#6a5a5a';
        c.fillRect(half(wrap(i * 41 + Math.sin(t + i) * 6, LW)), half(wrap(i * 31 + t * 12, LH)), 1, 0.5);
      }
      for (i = 0; i < 14; i++) {
        ph = wrap(t * 0.25 + i / 14, 1);
        c.globalAlpha = 0.9 * (1 - ph);
        c.fillStyle = i % 2 ? '#ffb42a' : '#ff4f0f';
        c.fillRect(half(wrap(i * 53 + Math.sin(ph * 8 + i) * 5, LW)), half(LH - ph * LH), 0.5, 0.5);
      }
    } else if (stage === 4) {                              // Frostfall: snow
      for (i = 0; i < 45; i++) {
        var big = i % 5 === 0;
        c.globalAlpha = big ? 0.9 : 0.6;
        c.fillStyle = '#ffffff';
        c.fillRect(half(wrap(i * 43 + Math.sin(t * 0.8 + i) * 8 + t * 3, LW)), half(wrap(i * 29 + t * (big ? 16 : 10), LH)),
                   big ? 1 : 0.5, big ? 1 : 0.5);
      }
    } else if (stage === 5) {                              // Void Tide: aurora and stars
      for (i = 0; i < 2; i++) {
        c.globalAlpha = 0.12;
        c.fillStyle = i ? '#5affc8' : '#d05cff';
        for (var x = 0; x < LW; x += 2) {
          var ay = 18 + i * 14 + Math.sin(x * 0.04 + t * 0.6 + i * 2) * 8;
          c.fillRect(x, Math.round(ay), 2, 5 + Math.round(Math.sin(x * 0.1 + t) * 2));
        }
      }
      for (i = 0; i < 16; i++) {
        c.globalAlpha = Math.max(0, Math.sin(t * 1.7 + i * 2.3));
        c.fillStyle = '#ffc6ff';
        c.fillRect(half(wrap(i * 61, LW)), half(wrap(i * 37, 110)), 0.5, 0.5);
      }
    }
    c.globalAlpha = 1;
  }

  var api = {
    // stage (1-5) grades the colours and adds that stage's weather; omit it for the plain scene
    make: function (name, seed, stage) {
      var f = SCENES[name];
      if (!f) return null;
      var inner = f(seed | 0), grade = makeGrade(stage | 0);
      return {
        paint: function (c) { GRADE = grade; try { inner.paint(c); } finally { GRADE = null; } },
        live: function (c, t) {
          GRADE = grade;
          try { inner.live(c, t); } finally { GRADE = null; }
          weather(c, t, stage | 0, seed | 0);
        }
      };
    },
    names: Object.keys(SCENES)
  };

  root.SceneArt = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
