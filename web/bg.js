/* TetrClone animated backgrounds. Each world draws to a low-resolution canvas that is scaled up (pixel art) or smoothed. */
(function (root) {
  'use strict';
  var cv = null, cx = null, W = 0, H = 0, theme = null, T = 0, lastTs = 0, lastDraw = 0, dirty = true;
  var level = 1, pulse = 0, rocket = null, star = null;
  var reduce = false; try { reduce = root.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  function seeded(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function hex(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
  function mix(a, b, t) { var A = hex(a), B = hex(b); return 'rgb(' + Math.round(A[0] + (B[0] - A[0]) * t) + ',' + Math.round(A[1] + (B[1] - A[1]) * t) + ',' + Math.round(A[2] + (B[2] - A[2]) * t) + ')'; }
  function offscreen(w, h) { var o = document.createElement('canvas'); o.width = w; o.height = h; return o; }

  // ------------------------------------------------------------------ 8-bit: night sky, onion-dome skyline, brick ground, rocket
  // per level: [skyTop, skyBottom, farTower, nearTower, domeA, domeB]; the colors change every level like the cartridge did
  var NES = [
    ['#000018', '#10208c', '#0c1860', '#1838b8', '#d82800', '#fcfcfc'], ['#001808', '#0c5c20', '#083c18', '#148030', '#f8b800', '#fcfcfc'],
    ['#10001c', '#5c1c8c', '#3c1060', '#7c34b8', '#f878f8', '#fcfcfc'], ['#001418', '#0c5c6c', '#08404c', '#1c8c9c', '#f8b800', '#fcfcfc'],
    ['#1c0000', '#8c1408', '#600c04', '#b83418', '#fcfc84', '#fcfcfc'], ['#001410', '#10785c', '#0c5040', '#20a888', '#f87858', '#fcfcfc'],
    ['#101010', '#585858', '#383838', '#7c7c7c', '#d82800', '#fcfcfc'], ['#180008', '#6c1c4c', '#481030', '#983878', '#58d854', '#fcfcfc'],
    ['#000828', '#2038c8', '#142088', '#4068f8', '#fc7460', '#fcfcfc'], ['#180800', '#a84410', '#702808', '#e87028', '#fcfc84', '#fcfcfc']
  ];
  var nes = { towersFar: [], towersNear: [], periodFar: 0, periodNear: 0, stars: [], clouds: [] };
  function makeTowers(seed, minW, maxW, minH, maxH, minGap, maxGap, need) {
    var r = seeded(seed), list = [], x = 0;
    while (x < need) {
      var w = minW + Math.floor(r() * (maxW - minW)), h = minH + Math.floor(r() * (maxH - minH));
      list.push({ x: x, w: w, h: h, r: Math.max(2, Math.floor(w * 0.45)) });
      x += w + minGap + Math.floor(r() * (maxGap - minGap));
    }
    return { list: list, period: x };
  }
  function tower(c, x, base, t, body, a, b) {
    var cxm = x + (t.w >> 1), top = base - t.h, r = t.r;
    c.fillStyle = body; c.fillRect(x, top, t.w, t.h);
    c.fillStyle = 'rgba(0,0,0,.35)';
    for (var wy = top + 4; wy < base - 4; wy += 6) c.fillRect(cxm, wy, 1, 2);
    c.fillStyle = body; c.fillRect(cxm - 1, top - 3, 3, 3);
    var cy = top - 3 - r + 1;
    for (var dy = -r; dy <= r; dy++) {
      var dx = Math.floor(Math.sqrt(r * r - dy * dy) * (dy > 0 ? 1 - dy / (r * 2.6) : 1));
      for (var xx = -dx; xx <= dx; xx++) { c.fillStyle = (((cxm + xx + cy + dy) >> 1) & 1) ? a : b; c.fillRect(cxm + xx, cy + dy, 1, 1); }
    }
    c.fillStyle = b; c.fillRect(cxm, cy - r - 3, 1, 3);
  }
  function nesBuild() {
    var f = makeTowers(11, 8, 14, 26, 46, 6, 20, W + 60), n = makeTowers(23, 10, 18, 14, 30, 8, 26, W + 80);
    nes.towersFar = f.list; nes.periodFar = f.period; nes.towersNear = n.list; nes.periodNear = n.period;
    var r = seeded(5); nes.stars = []; nes.clouds = [];
    for (var i = 0; i < 46; i++) nes.stars.push({ x: Math.floor(r() * W), y: Math.floor(r() * H * 0.6), ph: r() * 4 });
    for (i = 0; i < 5; i++) nes.clouds.push({ x: r() * W, y: 18 + Math.floor(r() * H * 0.4), w: 14 + Math.floor(r() * 16), v: 2 + r() * 3 });
  }
  function nesDraw(c, t, dt) {
    var P = NES[(level - 1) % 10], i, groundH = 12, base = H - groundH, skyH = base, bands = 9;
    for (i = 0; i < bands; i++) { c.fillStyle = mix(P[0], P[1], i / (bands - 1)); c.fillRect(0, Math.floor(i * skyH / bands), W, Math.ceil(skyH / bands) + 1); }
    for (i = 0; i < nes.stars.length; i++) {
      var s = nes.stars[i], on = ((t * 1.3 + s.ph) % 4) < 3;
      if (on) { c.fillStyle = (i % 3 === 0) ? '#a4e4fc' : '#fcfcfc'; c.fillRect(s.x, s.y, 1, 1); if (i % 7 === 0) { c.fillRect(s.x - 1, s.y, 3, 1); c.fillRect(s.x, s.y - 1, 1, 3); } }
    }
    for (i = 0; i < nes.clouds.length; i++) {
      var cl = nes.clouds[i], x = Math.floor(((cl.x + t * cl.v) % (W + 40)) - 30);
      c.fillStyle = mix(P[1], '#fcfcfc', 0.22);
      c.fillRect(x + 3, cl.y, cl.w - 6, 2); c.fillRect(x, cl.y + 2, cl.w, 3); c.fillRect(x + 2, cl.y + 5, cl.w - 4, 1);
    }
    var off, k, list;
    off = (t * 3) % nes.periodFar; list = nes.towersFar;
    for (k = 0; k < list.length; k++) { tower(c, Math.floor(list[k].x - off), base, list[k], P[2], mix(P[4], '#000000', 0.45), mix(P[5], '#000000', 0.5)); tower(c, Math.floor(list[k].x - off + nes.periodFar), base, list[k], P[2], mix(P[4], '#000000', 0.45), mix(P[5], '#000000', 0.5)); }
    off = (t * 7) % nes.periodNear; list = nes.towersNear;
    for (k = 0; k < list.length; k++) { tower(c, Math.floor(list[k].x - off), base, list[k], P[3], P[4], P[5]); tower(c, Math.floor(list[k].x - off + nes.periodNear), base, list[k], P[3], P[4], P[5]); }
    // brick ground
    c.fillStyle = mix(P[2], '#000000', 0.25); c.fillRect(0, base, W, groundH);
    c.fillStyle = 'rgba(0,0,0,.45)';
    for (var row = 0; row < 3; row++) {
      c.fillRect(0, base + row * 4, W, 1);
      for (var bx = (row % 2) * 4; bx < W; bx += 8) c.fillRect(bx, base + row * 4, 1, 4);
    }
    c.fillStyle = 'rgba(255,255,255,.12)'; c.fillRect(0, base, W, 1);
    // rocket
    if (rocket) {
      rocket.y -= (28 + (H - rocket.y) * 0.35) * dt; var rx = rocket.x, ry = Math.floor(rocket.y), fl = ((t * 14) | 0) % 2;
      c.fillStyle = '#fcfcfc'; c.fillRect(rx, ry, 3, 8); c.fillStyle = '#d82800'; c.fillRect(rx, ry - 2, 3, 2); c.fillRect(rx + 1, ry - 4, 1, 2);
      c.fillRect(rx - 2, ry + 5, 2, 3); c.fillRect(rx + 3, ry + 5, 2, 3);
      c.fillStyle = fl ? '#fcb800' : '#fc7460'; c.fillRect(rx, ry + 8, 3, 4 + fl * 2); c.fillStyle = '#fcfcfc'; c.fillRect(rx + 1, ry + 8, 1, 2);
      if (ry < -16) rocket = null;
    }
  }

  // ------------------------------------------------------------------ 16-bit: dithered dusk sky, sun, parallax ridges, water
  var snes = { sky: null, ridges: [], clouds: [], horizon: 0 };
  var BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  function snesBuild() {
    var hy = snes.horizon = Math.floor(H * 0.64), o = offscreen(W, H), c = o.getContext('2d'), img = c.createImageData(W, H), d = img.data;
    var stops = [[0, [20, 14, 70]], [0.35, [86, 38, 128]], [0.62, [208, 82, 108]], [0.82, [255, 160, 92]], [1, [255, 220, 150]]], L = 14, x, y, i;
    function col(f) { for (var s = 1; s < stops.length; s++) if (f <= stops[s][0]) { var a = stops[s - 1], b = stops[s], k = (f - a[0]) / (b[0] - a[0]); return [a[1][0] + (b[1][0] - a[1][0]) * k, a[1][1] + (b[1][1] - a[1][1]) * k, a[1][2] + (b[1][2] - a[1][2]) * k]; } return stops[stops.length - 1][1]; }
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
      var f = y < hy ? y / hy : 1, q = f * L, lv = Math.floor(q) + ((q - Math.floor(q)) > BAYER[(y & 3) * 4 + (x & 3)] / 16 ? 1 : 0), cc = y < hy ? col(Math.min(1, lv / L)) : [24, 18, 62];
      i = (y * W + x) * 4; d[i] = cc[0]; d[i + 1] = cc[1]; d[i + 2] = cc[2]; d[i + 3] = 255;
    }
    c.putImageData(img, 0, 0);
    var sx = Math.floor(W * 0.7), R = Math.floor(W * 0.13);
    for (var dy = -R; dy <= 0; dy++) { var dx = Math.floor(Math.sqrt(R * R - dy * dy)); c.fillStyle = dy < -R * 0.5 ? '#ffe9a8' : '#ffd37a'; c.fillRect(sx - dx, hy + dy, dx * 2 + 1, 1); }
    snes.sky = o;
    var r = seeded(9), n = 0; snes.ridges = []; snes.clouds = [];
    for (n = 0; n < 3; n++) snes.ridges.push({ a: 10 + n * 6, b: 5 + n * 3, f1: 0.022 + n * 0.008, f2: 0.07 + n * 0.02, p: r() * 6, v: 3 + n * 5, c: ['#4a2a6e', '#33204f', '#1f1538'][n], hi: ['#6a3f8e', '#4a3070', '#2f2250'][n], base: hy + 2 - (2 - n) * 0 });
    for (n = 0; n < 6; n++) snes.clouds.push({ x: r() * W, y: 8 + r() * hy * 0.55, w: 22 + Math.floor(r() * 26), v: 1.5 + r() * 3 });
  }
  function snesDraw(c, t, dt) {
    var hy = snes.horizon, i, x;
    c.drawImage(snes.sky, 0, 0);
    for (i = 0; i < snes.clouds.length; i++) {
      var cl = snes.clouds[i], px = Math.floor(((cl.x + t * cl.v) % (W + 70)) - 50);
      c.fillStyle = '#c98fc2'; c.fillRect(px + 4, cl.y + 3, cl.w - 6, 3);
      c.fillStyle = '#ffd6e8'; c.fillRect(px + 6, cl.y, cl.w - 10, 3); c.fillRect(px, cl.y + 2, cl.w - 2, 2);
    }
    for (i = 0; i < snes.ridges.length; i++) {
      var rd = snes.ridges[i], off = t * rd.v;
      for (x = 0; x < W; x++) {
        var h = rd.a + rd.b * Math.sin((x + off) * rd.f1 + rd.p) + (rd.b * 0.5) * Math.sin((x + off) * rd.f2 + rd.p * 2), top = Math.floor(hy - h);
        c.fillStyle = rd.c; c.fillRect(x, top, 1, hy - top + 1); c.fillStyle = rd.hi; c.fillRect(x, top, 1, 1);
      }
    }
    // water with sun glints
    c.fillStyle = '#241a4a'; c.fillRect(0, hy + 1, W, H - hy);
    var sx = Math.floor(W * 0.7);
    for (var row = 0; row < 30; row++) {
      var y = hy + 3 + row * (2 + row * 0.18), w = 4 + row * 1.2, wob = Math.sin(t * 1.4 + row * 1.7) * (3 + row * 0.4);
      if (y > H) break;
      c.fillStyle = row % 3 === 0 ? '#ffd37a' : '#c56a88'; c.fillRect(Math.floor(sx + wob - w / 2), Math.floor(y), Math.floor(w), 1);
      c.fillStyle = '#3b2a70'; c.fillRect(Math.floor((row * 37 + t * (6 + row * 0.5)) % (W + 30)) - 20, Math.floor(y + 1), 14 + row, 1);
    }
    if (star) { star.x += 90 * dt; star.y += 40 * dt; star.t -= dt; c.fillStyle = '#fcfcfc'; for (var k = 0; k < 8; k++) c.fillRect(Math.floor(star.x - k * 2), Math.floor(star.y - k), 1, 1); if (star.t <= 0) star = null; }
  }

  // ------------------------------------------------------------------ handheld: four greens, drifting dither, hills
  var GB = ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'];
  var gb = { tile: null, clouds: [] };
  function gbBuild() {
    var o = offscreen(8, 8), c = o.getContext('2d'); c.fillStyle = GB[3]; c.fillRect(0, 0, 8, 8); c.fillStyle = GB[2];
    for (var i = 0; i < 8; i++) { c.fillRect(i, i, 1, 1); c.fillRect((i + 4) % 8, i, 1, 1); }
    gb.tile = c.createPattern(o, 'repeat');
    var r = seeded(3); gb.clouds = []; for (i = 0; i < 4; i++) gb.clouds.push({ x: r() * W, y: 6 + r() * H * 0.45, w: 16 + Math.floor(r() * 14), v: 2 + r() * 3 });
  }
  function gbDraw(c, t) {
    c.fillStyle = GB[3]; c.fillRect(0, 0, W, H);
    c.save(); c.translate(-((t * 4) % 8), (t * 4) % 8); c.fillStyle = gb.tile; c.globalAlpha = 0.55; c.fillRect(0, -8, W + 16, H + 16); c.restore(); c.globalAlpha = 1;
    for (var i = 0; i < gb.clouds.length; i++) {
      var cl = gb.clouds[i], x = Math.floor(((cl.x + t * cl.v) % (W + 40)) - 30);
      c.fillStyle = GB[3]; c.fillRect(x + 3, cl.y, cl.w - 6, 3); c.fillRect(x, cl.y + 2, cl.w, 3);
      c.fillStyle = GB[2]; c.fillRect(x, cl.y + 5, cl.w, 1);
    }
    var base = H - 14;
    for (var x = 0; x < W; x++) { var h = 8 + Math.floor(5 * Math.sin((x + t * 5) * 0.06) + 3 * Math.sin((x + t * 5) * 0.17)); c.fillStyle = GB[1]; c.fillRect(x, base - h, 1, h + 14); c.fillStyle = GB[0]; if (((x + (t * 5 | 0)) >> 2) % 3 === 0) c.fillRect(x, base - h, 1, 1); }
    c.fillStyle = GB[0]; c.fillRect(0, H - 6, W, 6);
  }

  // ------------------------------------------------------------------ synthwave: striped sun, mountains, scrolling grid
  var out = { sky: null, hy: 0, m1: [], m2: [], stars: [] };
  function outBuild() {
    var hy = out.hy = Math.floor(H * 0.5), o = offscreen(W, H), c = o.getContext('2d');
    var g = c.createLinearGradient(0, 0, 0, hy); g.addColorStop(0, '#07011a'); g.addColorStop(0.55, '#2a0a52'); g.addColorStop(1, '#b3166a');
    c.fillStyle = g; c.fillRect(0, 0, W, hy);
    var f = c.createLinearGradient(0, hy, 0, H); f.addColorStop(0, '#2a0a4a'); f.addColorStop(1, '#0a0216'); c.fillStyle = f; c.fillRect(0, hy, W, H - hy);
    var r = seeded(8); c.fillStyle = '#fff'; for (var i = 0; i < 60; i++) { c.globalAlpha = 0.25 + r() * 0.6; c.fillRect(Math.floor(r() * W), Math.floor(r() * hy * 0.85), 1, 1); } c.globalAlpha = 1;
    out.sky = o; out.m1 = []; out.m2 = [];
    for (var x = 0; x <= W; x += 6) { out.m1.push([x, hy - (14 + 20 * Math.abs(Math.sin(x * 0.045 + 1)) + 8 * Math.sin(x * 0.13))]); out.m2.push([x, hy - (6 + 11 * Math.abs(Math.sin(x * 0.09 + 3)))]); }
  }
  function outDraw(c, t, dt) {
    var hy = out.hy, i, cxm = W / 2;
    c.drawImage(out.sky, 0, 0);
    var R = W * 0.27 * (1 + pulse * 0.07), cy = hy - R * 0.28;
    c.save(); c.beginPath(); c.arc(cxm, cy, R, 0, 7); c.clip();
    var g = c.createLinearGradient(0, cy - R, 0, cy + R); g.addColorStop(0, '#ffe14d'); g.addColorStop(0.55, '#ff7a59'); g.addColorStop(1, '#ff2e88'); c.fillStyle = g; c.fillRect(cxm - R, cy - R, R * 2, R * 2);
    c.fillStyle = '#c0156c'; var gap = R * 0.2, o2 = (t * 5) % gap;
    for (i = 0; i < 6; i++) { var yy = cy + R * 0.05 + i * gap - o2 + gap * 0.6, hh = 1 + i * 0.9; if (yy > cy) c.fillRect(cxm - R, yy, R * 2, hh); }
    c.restore();
    [[out.m2, '#1d0838', '#ff3ea5'], [out.m1, '#12042a', '#22d3ee']].forEach(function (m) {
      c.beginPath(); c.moveTo(0, hy); for (i = 0; i < m[0].length; i++) c.lineTo(m[0][i][0], m[0][i][1]); c.lineTo(W, hy); c.closePath(); c.fillStyle = m[1]; c.fill();
      c.beginPath(); for (i = 0; i < m[0].length; i++) { if (i) c.lineTo(m[0][i][0], m[0][i][1]); else c.moveTo(m[0][i][0], m[0][i][1]); } c.strokeStyle = m[2]; c.globalAlpha = 0.6; c.lineWidth = 1; c.stroke(); c.globalAlpha = 1;
    });
    c.fillStyle = '#ff3ea5'; c.globalAlpha = 0.5 + pulse * 0.4; c.fillRect(0, hy, W, 1); c.globalAlpha = 1;
    // perspective grid scrolling toward the viewer
    var N = 14, spd = 0.16 + pulse * 0.2; c.lineWidth = 1;
    for (i = 0; i < N; i++) {
      var d = ((i / N) + (t * spd) % (1 / N)) , y = hy + (H - hy) * Math.pow(d, 2.3);
      c.strokeStyle = '#ff3ea5'; c.globalAlpha = 0.15 + d * 0.65; c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke();
    }
    for (i = -9; i <= 9; i++) { c.strokeStyle = '#22d3ee'; c.globalAlpha = 0.5; c.beginPath(); c.moveTo(cxm + i * 3, hy); c.lineTo(cxm + i * W * 0.28, H); c.stroke(); }
    c.globalAlpha = 1;
  }

  // ------------------------------------------------------------------ dungeon worlds (roguelike acts)
  // P.depth 0-2 is the stage within the act (deeper is darker); P.boss swaps in the boss variant; P.camp draws a campfire (shop).
  var P = { depth: 0, boss: false, camp: false };
  function campfire(c, t, light) {
    var x = W >> 1, y = H - 14, f = ((t * 9) | 0) % 3, pulseK = 1 + 0.1 * Math.sin(t * 17);
    if (light) { var g = c.createRadialGradient(x, y, 2, x, y, 70 * pulseK); g.addColorStop(0, 'rgba(255,160,60,.35)'); g.addColorStop(1, 'rgba(255,120,30,0)'); c.fillStyle = g; c.fillRect(x - 80, y - 80, 160, 160); }
    c.fillStyle = '#4a2d18'; c.fillRect(x - 7, y + 4, 14, 3); c.fillRect(x - 5, y + 2, 10, 2); c.fillStyle = '#2d1a0e'; c.fillRect(x - 7, y + 6, 14, 1);
    c.fillStyle = '#d4461b'; c.fillRect(x - 4, y - 1 + (f === 1 ? 1 : 0), 8, 4);
    c.fillStyle = '#ff9a2a'; c.fillRect(x - 3, y - 4 - f, 6, 5 + f);
    c.fillStyle = '#ffdd55'; c.fillRect(x - 1, y - 6 - f, 3, 5);
  }

  // ---- catacombs: torchlit moss-covered brick, drips, bats; boss hall adds chains and anvil sparks
  var cat = { wall: null, lc: null, drip: null, splash: null, bat: null, nextDrip: 2, nextBat: 7, sparks: [], nextSpark: 1.5, col: 14 };
  function catBuild() {
    var o = offscreen(W, H), c = o.getContext('2d'), r = seeded(21), bh = 7, bw = 13, x, y, i, row;
    c.fillStyle = '#1e1c18'; c.fillRect(0, 0, W, H);
    for (y = 0, row = 0; y < H; y += bh, row++) {
      var off = (row % 2) * (bw >> 1);
      for (x = -off; x < W; x += bw) {
        var tone = r(); c.fillStyle = tone < 0.33 ? '#3b3933' : tone < 0.66 ? '#34322c' : '#403d36';
        c.fillRect(x + 1, y + 1, bw - 1, bh - 1);
        c.fillStyle = 'rgba(255,255,255,.06)'; c.fillRect(x + 1, y + 1, bw - 1, 1);
        if (r() < 0.09) { c.fillStyle = '#26241f'; c.fillRect(x + 2 + ((r() * 7) | 0), y + 2, 1, bh - 3); }
      }
    }
    for (i = 0; i < 110; i++) { c.fillStyle = r() < 0.5 ? '#3f5a28' : '#587a34'; c.fillRect((r() * W) | 0, (H * 0.3 + r() * H * 0.7) | 0, 1 + ((r() * 3) | 0), 1); }
    var cw = cat.col;
    [0, W - cw].forEach(function (x0, k) {
      c.fillStyle = '#15130e'; c.fillRect(x0, 0, cw, H);
      c.fillStyle = '#2b2820'; c.fillRect(k ? x0 : x0 + cw - 2, 0, 2, H);
      c.fillStyle = '#221f18'; c.fillRect(x0, 0, cw, 7); c.fillRect(x0 - (k ? 2 : 0), 7, cw + 2, 2); c.fillRect(x0, H - 9, cw, 9);
      for (var yy = 12; yy < H - 12; yy += 9) { c.fillStyle = '#1d1a14'; c.fillRect(x0 + 2 + ((yy * 7) % 5), yy, 3, 1); }
    });
    c.strokeStyle = '#15130e'; c.lineWidth = 5; c.beginPath(); c.ellipse(W / 2, 0, W / 2 - cw + 2, 34, 0, 0, Math.PI); c.stroke();
    cat.wall = o; cat.lc = offscreen(W, H);
  }
  function catDraw(c, t, dt) {
    var d = P.depth, N = [4, 3, 2][d] || 2, amb = [0.52, 0.66, 0.8][d] || 0.7, rad = ([64, 56, 48][d] || 50) * (1 + pulse * 0.3), i, k;
    c.globalCompositeOperation = 'source-over'; c.drawImage(cat.wall, 0, 0);
    var cw = cat.col, spots = [[cw + 2, H * 0.28], [W - cw - 3, H * 0.28], [cw + 2, H * 0.62], [W - cw - 3, H * 0.62]].slice(0, N).map(function (q) { return [Math.floor(q[0]), Math.floor(q[1])]; });
    // water drip
    cat.nextDrip -= dt;
    if (cat.nextDrip <= 0 && !cat.drip && !cat.splash) { cat.drip = { x: cw + 4 + Math.floor(Math.random() * (W - 2 * cw - 8)), y: 4, v: 0 }; cat.nextDrip = 2 + Math.random() * 3; }
    if (cat.drip) { cat.drip.v += 140 * dt; cat.drip.y += cat.drip.v * dt; c.fillStyle = '#7fb4d8'; c.fillRect(cat.drip.x, Math.floor(cat.drip.y), 1, 2); if (cat.drip.y > H - 14) { cat.splash = { x: cat.drip.x, t: 0 }; cat.drip = null; } }
    if (cat.splash) { cat.splash.t += dt; var sr = Math.floor(cat.splash.t * 14); c.fillStyle = 'rgba(160,200,230,.7)'; c.fillRect(cat.splash.x - sr, H - 13, 1, 1); c.fillRect(cat.splash.x + sr, H - 13, 1, 1); c.fillRect(cat.splash.x, H - 14 - (sr < 2 ? 1 : 0), 1, 1); if (cat.splash.t > 0.4) cat.splash = null; }
    // bat
    cat.nextBat -= dt;
    if (cat.nextBat <= 0 && !cat.bat) { cat.bat = { x: -8, y: H * (0.15 + Math.random() * 0.3), t: 0, dir: Math.random() < 0.5 ? 1 : -1 }; if (cat.bat.dir < 0) cat.bat.x = W + 8; cat.nextBat = 9 + Math.random() * 10; }
    if (cat.bat) {
      var b = cat.bat; b.t += dt; b.x += b.dir * 38 * dt; var by = Math.floor(b.y + Math.sin(b.t * 3) * 6), up = ((b.t * 12) | 0) % 2;
      c.fillStyle = '#0a0908'; c.fillRect(Math.floor(b.x), by, 3, 2); c.fillRect(Math.floor(b.x) - 3, by - (up ? 2 : 0), 3, 1); c.fillRect(Math.floor(b.x) + 3, by - (up ? 2 : 0), 3, 1);
      if ((b.dir > 0 && b.x > W + 10) || (b.dir < 0 && b.x < -10)) cat.bat = null;
    }
    // boss hall: chains and anvil sparks
    if (P.boss) {
      for (k = 0; k < 3; k++) { var cx0 = Math.floor(W * (0.25 + k * 0.25)), len = 34 + k * 14;
        for (i = 0; i < len; i += 3) { var xo = Math.sin(t * 0.9 + k * 2 + i * 0.07) * i * 0.05; c.fillStyle = (i / 3) % 2 ? '#6b6b74' : '#4a4a52'; c.fillRect(Math.floor(cx0 + xo), i, 1, 2); }
        c.fillStyle = '#8a8a94'; c.fillRect(Math.floor(cx0 + Math.sin(t * 0.9 + k * 2 + len * 0.07) * len * 0.05) - 1, len, 3, 2); }
      cat.nextSpark -= dt;
      if (cat.nextSpark <= 0) { for (i = 0; i < 9; i++) cat.sparks.push({ x: W * 0.5, y: H - 20, vx: (Math.random() - 0.5) * 50, vy: -20 - Math.random() * 40, l: 0.6 + Math.random() * 0.5 }); cat.nextSpark = 1.2 + Math.random() * 1.6; }
      for (i = cat.sparks.length - 1; i >= 0; i--) { var sp = cat.sparks[i]; sp.vy += 120 * dt; sp.x += sp.vx * dt; sp.y += sp.vy * dt; sp.l -= dt; if (sp.l <= 0) { cat.sparks.splice(i, 1); continue; } c.fillStyle = sp.l > 0.3 ? '#ffd24a' : '#ff7a1f'; c.fillRect(Math.floor(sp.x), Math.floor(sp.y), 1, 1); }
    }
    // warm tint, then darkness with light pools punched out
    var warm = P.boss ? '255,90,50' : '255,150,60';
    c.globalCompositeOperation = 'screen';
    spots.forEach(function (q, j) { var fl = 1 + 0.12 * Math.sin(t * 13 + j * 2) + 0.06 * Math.sin(t * 31 + j), g = c.createRadialGradient(q[0], q[1], 1, q[0], q[1], rad * fl); g.addColorStop(0, 'rgba(' + warm + ',.32)'); g.addColorStop(1, 'rgba(' + warm + ',0)'); c.fillStyle = g; c.fillRect(q[0] - rad * 1.2, q[1] - rad * 1.2, rad * 2.4, rad * 2.4); });
    c.globalCompositeOperation = 'source-over';
    var l = cat.lc.getContext('2d'); l.globalCompositeOperation = 'source-over'; l.clearRect(0, 0, W, H); l.fillStyle = 'rgba(6,5,10,' + amb + ')'; l.fillRect(0, 0, W, H); l.globalCompositeOperation = 'destination-out';
    spots.forEach(function (q, j) { var fl = 1 + 0.12 * Math.sin(t * 13 + j * 2) + 0.06 * Math.sin(t * 31 + j), g = l.createRadialGradient(q[0], q[1], 2, q[0], q[1], rad * fl); g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)'); l.fillStyle = g; l.fillRect(q[0] - rad * 1.3, q[1] - rad * 1.3, rad * 2.6, rad * 2.6); });
    if (P.camp) { var cg = l.createRadialGradient(W / 2, H - 14, 2, W / 2, H - 14, 78); cg.addColorStop(0, 'rgba(0,0,0,1)'); cg.addColorStop(1, 'rgba(0,0,0,0)'); l.fillStyle = cg; l.fillRect(0, H - 100, W, 100); }
    c.drawImage(cat.lc, 0, 0);
    // flames on top so they stay bright
    var flame = P.boss ? ['#ffb08a', '#ff5030', '#a02010'] : ['#ffdd55', '#ff9a2a', '#d4461b'];
    spots.forEach(function (q, j) {
      var f = ((t * 10 + j * 3) | 0) % 3;
      c.fillStyle = '#5a4a3a'; c.fillRect(q[0] - 1, q[1] + 3, 3, 5); c.fillRect(q[0] - 2, q[1] + 2, 5, 1);
      c.fillStyle = flame[2]; c.fillRect(q[0] - 1, q[1] - 1 - (f === 2 ? 1 : 0), 3, 4);
      c.fillStyle = flame[1]; c.fillRect(q[0] - 1, q[1] - 2 - f, 2 + (f === 1 ? 1 : 0), 4);
      c.fillStyle = flame[0]; c.fillRect(q[0], q[1] - 3 - f, 1, 3);
    });
    if (P.camp) campfire(c, t, false);
  }

  // ---- crystal caverns: stalactites, pulsing crystal clusters, drifting motes, mist (dense mist and eyes for the boss)
  var cry = { bg: null, clusters: [], motes: [], eyes: null, nextEyes: 5 };
  var GEMS = ['#5ee7ff', '#8f7bff', '#ff7bd5', '#6dffb8'];
  function cryBuild() {
    var o = offscreen(W, H), c = o.getContext('2d'), r = seeded(33), x, i;
    var g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#060418'); g.addColorStop(0.6, '#0e0a2c'); g.addColorStop(1, '#170f3c'); c.fillStyle = g; c.fillRect(0, 0, W, H);
    for (i = 0; i < 220; i++) { c.fillStyle = r() < 0.5 ? 'rgba(120,110,220,.10)' : 'rgba(0,0,0,.18)'; c.fillRect((r() * W) | 0, (r() * H) | 0, 1 + ((r() * 3) | 0), 1); }
    for (x = -4; x < W; x += 8 + ((r() * 6) | 0)) { var h = 6 + ((r() * 26) | 0), w = 6 + ((r() * 4) | 0); for (var k = 0; k < h; k++) { var ww = Math.max(1, Math.round(w * (1 - k / h))); c.fillStyle = '#04030c'; c.fillRect(x + ((w - ww) >> 1), k, ww, 1); } c.fillStyle = '#1f1a4a'; c.fillRect(x + (w >> 1) - 1, h - 1, 1, 1); }
    for (x = -2; x < W; x += 10 + ((r() * 8) | 0)) { var hh = 5 + ((r() * 16) | 0), w2 = 7 + ((r() * 4) | 0); for (k = 0; k < hh; k++) { var w3 = Math.max(1, Math.round(w2 * (1 - k / hh))); c.fillStyle = '#04030c'; c.fillRect(x + ((w2 - w3) >> 1), H - 1 - k, w3, 1); } }
    cry.bg = o; cry.clusters = [];
    var spots = [[8, 0.72], [W - 10, 0.66], [10, 0.38], [W - 8, 0.34], [W * 0.5, 0.97], [W * 0.22, 0.98], [W * 0.78, 0.98], [14, 0.9], [W - 14, 0.92]];
    spots.forEach(function (q, n) {
      var prisms = [], m = 3 + ((r() * 3) | 0);
      for (var j = 0; j < m; j++) prisms.push({ dx: (j - (m - 1) / 2) * 4 + Math.floor(r() * 3) - 1, h: 7 + ((r() * 12) | 0), w: 3 + ((r() * 2) | 0) });
      cry.clusters.push({ x: Math.floor(q[0]), y: Math.floor(q[1] * H), col: GEMS[n % 4], ph: r() * 6, prisms: prisms });
    });
    cry.motes = []; for (i = 0; i < 34; i++) cry.motes.push({ x: r() * W, y: r() * H, v: 3 + r() * 6, ph: r() * 6 });
  }
  function cryDraw(c, t, dt) {
    var d = P.depth, i, n = [5, 7, 9][d] || 7, bright = ([0.8, 1, 1.2][d] || 1) * (1 + pulse * 0.6);
    c.globalCompositeOperation = 'source-over'; c.drawImage(cry.bg, 0, 0);
    for (i = 0; i < n && i < cry.clusters.length; i++) {
      var cl = cry.clusters[i], pu = (0.65 + 0.35 * Math.sin(t * 1.3 + cl.ph)) * bright;
      c.globalCompositeOperation = 'screen'; var g = c.createRadialGradient(cl.x, cl.y, 1, cl.x, cl.y, 34); g.addColorStop(0, 'rgba(' + hex(cl.col).join(',') + ',' + (0.3 * pu).toFixed(3) + ')'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(cl.x - 36, cl.y - 36, 72, 72);
      c.globalCompositeOperation = 'source-over';
      cl.prisms.forEach(function (pr) {
        var px = cl.x + pr.dx, top = cl.y - pr.h, w = pr.w;
        c.fillStyle = mix(cl.col, '#0a0820', 0.45 - 0.2 * Math.min(1, pu)); c.fillRect(px, top + 3, w, pr.h - 3);
        c.fillStyle = mix(cl.col, '#ffffff', 0.25 * pu); c.fillRect(px, top + 3, 1, pr.h - 3);
        c.fillStyle = mix(cl.col, '#ffffff', 0.5 * pu); c.fillRect(px + 1, top + 1, Math.max(1, w - 2), 2); c.fillRect(px + (w >> 1), top, 1, 1);
      });
    }
    // drifting motes
    for (i = 0; i < cry.motes.length; i++) {
      var m = cry.motes[i]; m.y -= m.v * dt * (1 + pulse * 2); m.x += Math.sin(t * 0.7 + m.ph) * 0.12; if (m.y < -2) { m.y = H + 2; m.x = Math.random() * W; }
      c.fillStyle = 'rgba(166,240,255,' + (0.25 + 0.4 * Math.abs(Math.sin(t * 1.5 + m.ph))).toFixed(2) + ')'; c.fillRect(Math.floor(m.x), Math.floor(m.y), 1, 1);
    }
    // mist bands
    var bands = P.boss ? 8 : 3, alpha = P.boss ? 0.08 : 0.035;
    for (i = 0; i < bands; i++) {
      var y = Math.floor(H * (0.15 + 0.8 * (i / bands)) + Math.sin(t * 0.3 + i) * 5), x0 = Math.floor(((t * (4 + i * 1.7) + i * 40) % (W + 90)) - 80);
      for (var k = 0; k < 4; k++) { c.fillStyle = 'rgba(150,140,255,' + alpha + ')'; c.fillRect(x0 - k * 5, y - k, 90 + k * 10, 6 + k * 2); }
    }
    if (P.boss) {
      cry.nextEyes -= dt;
      if (cry.nextEyes <= 0 && !cry.eyes) { cry.eyes = { x: 20 + Math.random() * (W - 40), y: H * (0.3 + Math.random() * 0.4), t: 0 }; cry.nextEyes = 4 + Math.random() * 5; }
      if (cry.eyes) { cry.eyes.t += dt; var e = cry.eyes, vis = Math.sin(e.t * Math.PI / 2.4); if (vis > 0.2) { c.fillStyle = 'rgba(255,60,80,' + Math.min(1, vis).toFixed(2) + ')'; c.fillRect(Math.floor(e.x), Math.floor(e.y), 2, 1); c.fillRect(Math.floor(e.x) + 5, Math.floor(e.y), 2, 1); } if (e.t > 2.4) cry.eyes = null; }
    }
    if (P.camp) { c.globalCompositeOperation = 'screen'; campfire(c, t, true); c.globalCompositeOperation = 'source-over'; campfire(c, t, false); }
  }

  // ---- ember keep: obsidian pillars, a lava river that rises with depth, drifting embers; vault boss adds floating tetromino outlines
  var frg = { bg: null, embers: [], shapes: [] };
  var LAVA = ['#6e1007', '#d4380f', '#ff7a1f', '#ffd24a'];
  var SHAPE_CELLS = [[[0, 0], [1, 0], [2, 0], [3, 0]], [[0, 0], [1, 0], [0, 1], [1, 1]], [[1, 0], [0, 1], [1, 1], [2, 1]], [[1, 0], [2, 0], [0, 1], [1, 1]], [[0, 0], [1, 0], [1, 1], [2, 1]], [[0, 0], [0, 1], [1, 1], [2, 1]], [[2, 0], [0, 1], [1, 1], [2, 1]]];
  function frgBuild() {
    var o = offscreen(W, H), c = o.getContext('2d'), r = seeded(44), x, i;
    var g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#08020a'); g.addColorStop(0.7, '#200806'); g.addColorStop(1, '#3a0d06'); c.fillStyle = g; c.fillRect(0, 0, W, H);
    [['#12060a', 0.75, 20], ['#0b0407', 1, 28]].forEach(function (L) {
      for (x = -6; x < W + 20; x += L[2] + ((r() * 18) | 0)) {
        var w = 9 + ((r() * 8) | 0), top = H * (0.12 + r() * 0.28) * L[1];
        c.fillStyle = L[0]; c.fillRect(x, top, w, H - top); c.fillRect(x - 2, top, w + 4, 4);
        c.fillStyle = 'rgba(255,110,40,.18)'; c.fillRect(x, top + 4, 1, H - top);
        for (var wy = top + 12; wy < H * 0.7; wy += 14) { c.fillStyle = 'rgba(255,120,40,.25)'; c.fillRect(x + (w >> 1), wy, 1, 3); }
      }
    });
    frg.bg = o; frg.embers = []; for (i = 0; i < 46; i++) frg.embers.push({ x: r() * W, y: r() * H, v: 8 + r() * 14, ph: r() * 6, s: r() < 0.2 ? 2 : 1 });
    frg.shapes = []; for (i = 0; i < 6; i++) frg.shapes.push({ x: r() * W, y: r() * H * 0.7, t: (r() * 7) | 0, rot: (r() * 4) | 0, v: 2 + r() * 3, spin: 2 + r() * 3, ph: r() * 8 });
  }
  function rotCells(cells, n) { return cells.map(function (q) { return [n - 1 - q[1], q[0]]; }); }
  function frgDraw(c, t, dt) {
    var d = P.depth, i, k, lavaH = Math.floor(H * ([0.08, 0.115, 0.15][d] || 0.115));
    c.globalCompositeOperation = 'source-over'; c.drawImage(frg.bg, 0, 0);
    if (P.boss) {
      for (i = 0; i < frg.shapes.length; i++) {
        var sh = frg.shapes[i]; sh.y -= sh.v * dt; if (sh.y < -14) { sh.y = H - lavaH; sh.x = Math.random() * W; }
        var cells = SHAPE_CELLS[sh.t], n = sh.t === 0 ? 4 : 3, rr = Math.floor((t / sh.spin + sh.ph) % 4); for (k = 0; k < rr; k++) cells = rotCells(cells, n);
        c.fillStyle = 'rgba(255,150,70,' + (0.25 + 0.15 * Math.sin(t + sh.ph)).toFixed(2) + ')';
        cells.forEach(function (q) { var bx = Math.floor(sh.x) + q[0] * 5, by = Math.floor(sh.y) + q[1] * 5; c.fillRect(bx, by, 5, 1); c.fillRect(bx, by + 4, 5, 1); c.fillRect(bx, by, 1, 5); c.fillRect(bx + 4, by, 1, 5); });
      }
    }
    c.globalCompositeOperation = 'screen'; var g = c.createLinearGradient(0, H - lavaH - 50, 0, H - lavaH); g.addColorStop(0, 'rgba(255,90,20,0)'); g.addColorStop(1, 'rgba(255,90,20,' + (0.3 + pulse * 0.25).toFixed(2) + ')'); c.fillStyle = g; c.fillRect(0, H - lavaH - 50, W, 50); c.globalCompositeOperation = 'source-over';
    for (var row = 0; row < lavaH; row++) {
      var y = H - lavaH + row, shade = 1 - row / lavaH * 0.5;
      for (var x = 0; x < W; x += 4) {
        var v = Math.sin(x * 0.09 + t * 0.8 + row * 0.5) + Math.sin(x * 0.05 - t * 0.5 + row * 0.3), idx = v > 1.1 ? 3 : v > 0.35 ? 2 : v > -0.5 ? 1 : 0;
        if (row < 2) idx = Math.max(idx, 2); c.fillStyle = idx === 3 && shade < 0.75 ? LAVA[2] : LAVA[idx]; c.fillRect(x, y, 4, 1);
      }
    }
    for (i = 0; i < frg.embers.length; i++) {
      var e = frg.embers[i]; e.y -= e.v * dt * (1 + pulse * 2.5); e.x += Math.sin(t + e.ph) * 0.18; if (e.y < -2) { e.y = H - lavaH + 2; e.x = Math.random() * W; }
      var fl = Math.abs(Math.sin(t * 3 + e.ph)); c.fillStyle = fl > 0.5 ? '#ffd24a' : '#ff7a1f'; c.globalAlpha = 0.4 + 0.5 * fl; c.fillRect(Math.floor(e.x), Math.floor(e.y), e.s, e.s); c.globalAlpha = 1;
    }
    if (P.camp) { c.globalCompositeOperation = 'screen'; campfire(c, t, true); c.globalCompositeOperation = 'source-over'; campfire(c, t, false); }
  }

  var THEMES = {
    nes: { scale: 3, build: nesBuild, draw: nesDraw, pixel: true },
    snes: { scale: 2, build: snesBuild, draw: snesDraw, pixel: true },
    gb: { scale: 4, build: gbBuild, draw: gbDraw, pixel: true },
    outrun: { scale: 2, build: outBuild, draw: outDraw, pixel: false },
    catacombs: { scale: 3, build: catBuild, draw: catDraw, pixel: true },
    crystal: { scale: 3, build: cryBuild, draw: cryDraw, pixel: true },
    forge: { scale: 3, build: frgBuild, draw: frgDraw, pixel: true }
  };

  function resize() {
    if (!cv || !theme) return;
    W = Math.ceil(root.innerWidth / theme.scale); H = Math.ceil(root.innerHeight / theme.scale);
    cv.width = W; cv.height = H; cv.style.imageRendering = theme.pixel ? 'pixelated' : 'auto';
    theme.build(); dirty = true;
  }
  var API = {
    init: function (canvas) { cv = canvas; cx = cv.getContext('2d'); root.addEventListener('resize', resize); },
    set: function (id) { theme = THEMES[id] || null; if (cv) { cv.hidden = !theme; if (theme) resize(); } },
    params: function (p) { P.depth = p.depth || 0; P.boss = !!p.boss; P.camp = !!p.camp; dirty = true; },
    level: function (n) { if (n !== level) { level = n; dirty = true; } },
    event: function (name) {
      pulse = 1;
      if (!theme || reduce) return;
      if (theme === THEMES.nes && name === 'big' && !rocket) rocket = { x: Math.floor(W * (0.15 + Math.random() * 0.7)), y: H - 12 };
      if (theme === THEMES.snes && name === 'big' && !star) star = { x: Math.random() * W * 0.4, y: 4 + Math.random() * 20, t: 1.6 };
    },
    frame: function (ts) {
      var dt = Math.min(0.1, (ts - lastTs) / 1000 || 0.016); lastTs = ts;
      if (!theme || !cx || cv.hidden) return;
      pulse = Math.max(0, pulse - dt * 1.6);
      if (reduce) { if (!dirty) return; dirty = false; theme.draw(cx, 12, 0); return; }
      if (ts - lastDraw < 30) return;       // about 30 frames a second is plenty for a backdrop
      var step = (ts - lastDraw) / 1000; lastDraw = ts; T += Math.min(0.1, step);
      theme.draw(cx, T, Math.min(0.1, step));
    }
  };
  root.Bg = API;
})(typeof window !== 'undefined' ? window : globalThis);
