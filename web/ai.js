/* TetrClone AI: evaluates every placement and plays through the normal Engine API. */
(function (root) {
  'use strict';
  var E = typeof module !== 'undefined' && module.exports ? require('./engine.js') : root.Engine;
  var COLS = E.COLS, H = E.H, SHAPES = E.SHAPES;

  // actionMs = delay between key presses, thinkMs = pause after a new piece appears,
  // noise = chance of picking a worse move, look = plan with the next piece, hold = may use hold
  var LEVELS = {
    easy:   { label: 'Easy',   actionMs: 190, thinkMs: 420, noise: 0.22, look: false, hold: false },
    medium: { label: 'Medium', actionMs: 95,  thinkMs: 180, noise: 0.06, look: false, hold: true },
    hard:   { label: 'Hard',   actionMs: 45,  thinkMs: 60,  noise: 0,    look: true,  hold: true }
  };

  function fits(board, p, r, x, y) {
    var c = SHAPES[p][r];
    for (var i = 0; i < 4; i++) {
      var cx = x + c[i][0], cy = y + c[i][1];
      if (cx < 0 || cx >= COLS || cy < 0 || cy >= H || board[cy][cx]) return false;
    }
    return true;
  }

  /** Returns {heights, holes, bump, cleared, rowsBoard} for a board after placing and clearing. */
  function applyPlacement(board, p, r, x, y) {
    var b = board.map(function (row) { return row.slice(); });
    var c = SHAPES[p][r];
    for (var i = 0; i < 4; i++) b[y + c[i][1]][x + c[i][0]] = 1;
    var cleared = 0, out = [];
    for (var yy = 0; yy < H; yy++) {
      if (b[yy].every(function (v) { return v; })) cleared++; else out.push(b[yy]);
    }
    while (out.length < H) out.unshift(new Array(COLS).fill(0));
    return { board: out, cleared: cleared };
  }

  function evaluate(b, cleared) {
    var heights = [], holes = 0, x, y;
    for (x = 0; x < COLS; x++) {
      var h = 0, seen = false;
      for (y = 0; y < H; y++) {
        if (b[y][x]) { if (!seen) { h = H - y; seen = true; } }
        else if (seen) holes++;
      }
      heights.push(h);
    }
    var agg = 0, bump = 0, maxH = 0;
    for (x = 0; x < COLS; x++) {
      agg += heights[x]; maxH = Math.max(maxH, heights[x]);
      if (x) bump += Math.abs(heights[x] - heights[x - 1]);
    }
    var score = -0.51 * agg + 0.76 * cleared - 0.36 * holes - 0.18 * bump;
    if (cleared === 4) score += 1.2;
    if (maxH > 14) score -= (maxH - 14) * 0.8;      // stay alive
    return score;
  }

  /** All reachable-at-spawn landings for a piece. */
  function placements(board, p) {
    var res = [], seen = {};
    for (var r = 0; r < 4; r++) {
      var key = SHAPES[p][r].map(function (c) { return c.join(','); }).sort().join(';');
      if (seen[key]) continue;   // identical orientation (O, and 180-degree twins of I, S, Z)
      seen[key] = true;
      for (var x = -2; x < COLS; x++) {
        if (!fits(board, p, r, x, 0)) continue;
        var y = 0;
        while (fits(board, p, r, x, y + 1)) y++;
        var a = applyPlacement(board, p, r, x, y);
        res.push({ r: r, x: x, y: y, board: a.board, cleared: a.cleared, score: evaluate(a.board, a.cleared) });
      }
    }
    return res;
  }

  function best(board, p, nextPiece, cfg) {
    var list = placements(board, p);
    if (!list.length) return null;
    if (cfg.look && nextPiece != null) {
      list.sort(function (a, b) { return b.score - a.score; });
      list.slice(0, 8).forEach(function (pl) {
        var nl = placements(pl.board, nextPiece), top = -1e9;
        for (var i = 0; i < nl.length; i++) top = Math.max(top, nl[i].score);
        pl.total = nl.length ? pl.score * 0.4 + top : -1e6;
      });
      list.forEach(function (pl) { if (pl.total === undefined) pl.total = -1e7 + pl.score; });
    } else list.forEach(function (pl) { pl.total = pl.score; });
    list.sort(function (a, b) { return b.total - a.total; });
    return list;
  }

  function Bot(engine, level, rand) {
    this.e = engine; this.cfg = LEVELS[level] || LEVELS.medium;
    this.rand = rand || Math.random;
    this.plan = null; this.planSerial = -1; this.wait = this.cfg.thinkMs; this.steps = 0;
  }

  Bot.prototype.think = function () {
    var e = this.e, cfg = this.cfg;
    var list = best(e.board, e.piece, e.queue[0], cfg), useHold = false;
    if (cfg.hold && e.canHold) {
      var alt = e.hold >= 0 ? e.hold : e.queue[0];
      var altNext = e.hold >= 0 ? e.queue[0] : e.queue[1];
      var l2 = best(e.board, alt, altNext, cfg);
      if (l2 && (!list || l2[0].total > list[0].total + 0.35)) { useHold = true; }
    }
    if (useHold) return { hold: true };
    if (!list) return { drop: true };
    var pick = list[0];
    if (cfg.noise && this.rand() < cfg.noise) pick = list[Math.min(list.length - 1, 1 + Math.floor(this.rand() * 3))];
    return { r: pick.r, x: pick.x };
  };

  Bot.prototype.update = function (dt) {
    var e = this.e;
    if (e.over) return;
    if (this.planSerial !== e.serial) {
      this.plan = null; this.planSerial = e.serial; this.wait = this.cfg.thinkMs; this.steps = 0;
    }
    this.wait -= dt;
    var guard = 0;
    while (this.wait <= 0 && !e.over && guard++ < 6) {
      this.wait += this.cfg.actionMs;
      if (!this.plan) this.plan = this.think();
      var p = this.plan;
      if (p.hold) { e.doHold(); return; }
      if (p.drop || ++this.steps > 24) { e.hardDrop(); return; }
      if (e.rot !== p.r) {
        var diff = (p.r - e.rot + 4) % 4;
        if (!e.rotate(diff === 3 ? -1 : 1)) { e.hardDrop(); return; }
      } else if (e.px !== p.x) {
        if (!e.move(e.px < p.x ? 1 : -1)) { e.hardDrop(); return; }
      } else { e.hardDrop(); return; }
    }
  };

  var API = { Bot: Bot, LEVELS: LEVELS, placements: placements, evaluate: evaluate };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.TetrAI = API;
})(typeof window !== 'undefined' ? window : globalThis);
