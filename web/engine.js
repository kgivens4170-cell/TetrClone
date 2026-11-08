/* TetrClone engine: pure game logic, no DOM. Works in browsers (window.Engine) and Node (module.exports).
   Pieces are data (defs), so runs can add, mutate, mirror, trim and grow shapes. */
(function (root) {
  'use strict';

  var COLS = 10, VIS = 20, HID = 2, H = VIS + HID;
  var LOCK_MS = 500, MAX_RESETS = 15, GARBAGE = 99;
  var NAMES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
  var BASE = [
    [[0,1],[1,1],[2,1],[3,1]],
    [[1,0],[2,0],[1,1],[2,1]],
    [[1,0],[0,1],[1,1],[2,1]],
    [[1,0],[2,0],[0,1],[1,1]],
    [[0,0],[1,0],[1,1],[2,1]],
    [[0,0],[0,1],[1,1],[2,1]],
    [[2,0],[0,1],[1,1],[2,1]]
  ];

  function rotCW(c, n) { return [n - 1 - c[1], c[0]]; }
  /** 4 clockwise rotation states of a cell list inside an n x n box. Cell order is preserved across states. */
  function genRots(cells, n, noRot) {
    var out = [], cur = cells;
    for (var r = 0; r < 4; r++) {
      out.push(cur);
      cur = noRot ? cur : cur.map(function (c) { return rotCW(c, n); });
    }
    return out;
  }
  // kick: 'I' | 'JLSTZ' | 'gen' | 'none'.  spin: eligible for T-spin scoring.  color: palette index.
  function def(id, name, cells, n, o) {
    o = o || {};
    return { id: id, name: name, n: n, noRot: !!o.noRot, spin: !!o.spin,
             kick: o.kick || (n === 3 ? 'JLSTZ' : 'gen'), color: o.color != null ? o.color : id,
             rots: genRots(cells, n, o.noRot) };
  }

  var DEFS = [
    def(0, 'I', BASE[0], 4, { kick: 'I' }),
    def(1, 'O', BASE[1], 4, { noRot: true, kick: 'none' }),
    def(2, 'T', BASE[2], 3, { spin: true }),
    def(3, 'S', BASE[3], 3), def(4, 'Z', BASE[4], 3), def(5, 'J', BASE[5], 3), def(6, 'L', BASE[6], 3)
  ];
  var SHAPES = DEFS.map(function (d) { return d.rots; });

  // Extra piece types a run can add to its bag (ids 7+).
  var EXTRA = [
    def(7, 'Dot', [[1,1]], 3, { noRot: true }),
    def(8, 'Domino', [[1,1],[2,1]], 3),
    def(9, 'Tri-I', [[0,1],[1,1],[2,1]], 3),
    def(10, 'Tri-L', [[0,0],[0,1],[1,1]], 3),
    def(11, 'Plus', [[1,0],[0,1],[1,1],[2,1],[1,2]], 3),
    def(12, 'P', [[0,0],[1,0],[0,1],[1,1],[0,2]], 3),
    def(13, 'Block', [[0,0],[1,0],[2,0],[0,1],[1,1],[2,1],[0,2],[1,2],[2,2]], 3, { noRot: true })
  ];
  // What each standard piece becomes when grown by one cell, or trimmed to a tromino.
  var GROW = [
    def(0, 'I5', [[0,2],[1,2],[2,2],[3,2],[4,2]], 5),
    def(1, 'P5', [[0,0],[1,0],[0,1],[1,1],[0,2]], 3),
    def(2, 'Cross', [[1,0],[0,1],[1,1],[2,1],[1,2]], 3),
    def(3, 'W', [[1,0],[2,0],[0,1],[1,1],[0,2]], 3),
    def(4, 'W', [[0,0],[1,0],[1,1],[2,1],[2,2]], 3),
    def(5, 'Z5', [[0,0],[0,1],[1,1],[2,1],[2,2]], 3),
    def(6, 'S5', [[2,0],[0,1],[1,1],[2,1],[0,2]], 3)
  ];
  var TRIM = [
    def(0, 'I3', [[0,1],[1,1],[2,1]], 3),
    def(1, 'L3', [[0,0],[1,0],[0,1]], 3),
    def(2, 'I3', [[0,1],[1,1],[2,1]], 3),
    def(3, 'L3', [[0,0],[1,0],[0,1]], 3), def(4, 'L3', [[0,0],[1,0],[0,1]], 3),
    def(5, 'L3', [[0,0],[1,0],[0,1]], 3), def(6, 'L3', [[0,0],[1,0],[0,1]], 3)
  ];

  // Super Rotation System kick tables as published (x right, y UP); applied below with y flipped.
  var K_JLSTZ = {
    '0>1': [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]], '1>0': [[0,0],[1,0],[1,-1],[0,2],[1,2]],
    '1>2': [[0,0],[1,0],[1,-1],[0,2],[1,2]],     '2>1': [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
    '2>3': [[0,0],[1,0],[1,1],[0,-2],[1,-2]],    '3>2': [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
    '3>0': [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],  '0>3': [[0,0],[1,0],[1,1],[0,-2],[1,-2]]
  };
  var K_I = {
    '0>1': [[0,0],[-2,0],[1,0],[-2,-1],[1,2]],   '1>0': [[0,0],[2,0],[-1,0],[2,1],[-1,-2]],
    '1>2': [[0,0],[-1,0],[2,0],[-1,2],[2,-1]],   '2>1': [[0,0],[1,0],[-2,0],[1,-2],[-2,1]],
    '2>3': [[0,0],[2,0],[-1,0],[2,1],[-1,-2]],   '3>2': [[0,0],[-2,0],[1,0],[-2,-1],[1,2]],
    '3>0': [[0,0],[1,0],[-2,0],[1,-2],[-2,1]],   '0>3': [[0,0],[-1,0],[2,0],[-1,2],[2,-1]]
  };
  var K_GEN = [[0,0],[1,0],[-1,0],[0,1],[1,1],[-1,1],[2,0],[-2,0]];
  function kicksFor(cur, from, to) {
    if (cur.kick === 'I') return K_I[from + '>' + to];
    if (cur.kick === 'JLSTZ') return K_JLSTZ[from + '>' + to];
    if (cur.kick === 'none') return [[0, 0]];
    return K_GEN;
  }

  var LINE_SCORE = [0, 100, 300, 500, 800];
  var TSPIN_SCORE = [400, 800, 1200, 1600];
  var MINI_SCORE = [100, 200, 400];
  var ATTACK_LINES = [0, 0, 1, 2, 4];
  var ATTACK_TSPIN = [0, 2, 4, 6];
  var ATTACK_MINI = [0, 0, 1];
  var COMBO_ATTACK = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4, 5];
  var PC_SCORE = [800, 1200, 1800, 2000];
  var PC_ATTACK = 10;

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function emptyRow() { return new Array(COLS).fill(0); }
  function connected(cells) {
    if (!cells.length) return false;
    var seen = {}, stack = [cells[0]], key = function (c) { return c[0] + ',' + c[1]; };
    seen[key(cells[0])] = true;
    var have = {}; cells.forEach(function (c) { have[key(c)] = true; });
    var count = 1;
    while (stack.length) {
      var c = stack.pop();
      [[1,0],[-1,0],[0,1],[0,-1]].forEach(function (d) {
        var nb = [c[0] + d[0], c[1] + d[1]], k = key(nb);
        if (have[k] && !seen[k]) { seen[k] = true; count++; stack.push(nb); }
      });
    }
    return count === cells.length;
  }
  function sameSet(a, b) {
    if (a.length !== b.length) return false;
    var s = {}; a.forEach(function (c) { s[c[0] + ',' + c[1]] = 1; });
    return b.every(function (c) { return s[c[0] + ',' + c[1]]; });
  }

  /** opts: seed, level, fixedLevel, defs (piece defs by id), bag (ids in one bag), lockMs, gravMult, maxHolds, onSpawn */
  function Engine(opts) {
    opts = opts || {};
    this.seed = opts.seed != null ? opts.seed : (Math.random() * 2147483647) | 0;
    this.rng = mulberry32(this.seed);
    this.grng = mulberry32((this.seed ^ 0x9e3779b9) | 0);
    this.defs = opts.defs || DEFS.concat(EXTRA);   // standard pieces 0-6, extras 7-13
    this.bagIds = (opts.bag || [0, 1, 2, 3, 4, 5, 6]).slice();
    this.lockMs = opts.lockMs || LOCK_MS;
    this.gravMult = opts.gravMult || 1;
    this.maxHolds = opts.maxHolds || 1;
    this.onSpawn = opts.onSpawn || null;
    this.startLevel = opts.level || 1;
    this.fixedLevel = !!opts.fixedLevel;
    this.board = [];
    for (var y = 0; y < H; y++) this.board.push(emptyRow());
    this.queue = []; this.bag = [];
    this.hold = -1; this.holdsLeft = this.maxHolds; this.canHold = true;
    this.score = 0; this.lines = 0; this.level = this.startLevel; this.pieces = 0;
    this.combo = -1; this.b2b = 0;
    this.pending = 0;
    this.garbHole = Math.floor(this.grng() * COLS);
    this.time = 0; this.over = false; this.serial = 0;
    this.attackSent = 0;
    this.stats = { tspins: 0, tetrises: 0, maxCombo: 0, perfect: 0, maxB2b: 0, holds: 0 };
    this.events = [];
    this.fillQueue();
    this.spawn();
  }

  Engine.prototype.fillQueue = function () {
    while (this.queue.length < 8) {
      if (!this.bag.length) {
        this.bag = this.bagIds.slice();
        for (var i = this.bag.length - 1; i > 0; i--) {
          var j = Math.floor(this.rng() * (i + 1)), t = this.bag[i];
          this.bag[i] = this.bag[j]; this.bag[j] = t;
        }
      }
      this.queue.push(this.bag.pop());
    }
  };

  Engine.prototype.setPiece = function (id) {
    var d = this.defs[id];
    this.piece = id;
    this.cur = { id: id, n: d.n, kick: d.kick, spin: d.spin, noRot: d.noRot, color: d.color, rots: d.rots.slice(), modified: false };
  };
  Engine.prototype.cells = function () { return this.cur.rots[this.rot]; };

  Engine.prototype.spawn = function (forced) {
    this.setPiece(forced != null ? forced : this.queue.shift());
    this.fillQueue();
    this.rot = 0; this.px = Math.floor((COLS - this.cur.n) / 2); this.py = 0;
    this.lastRot = false; this.lastKick = 0;
    this.lockTimer = 0; this.resets = 0; this.gravAcc = 0;
    this.serial++;
    if (this.onSpawn) this.onSpawn(this);
    if (this.hit(0, this.px, this.py)) { this.finish('topout'); return; }
    if (!this.hit(0, this.px, this.py + 1)) this.py++;
    this.lowest = this.py;
  };

  Engine.prototype.finish = function (reason) {
    if (this.over) return;
    this.over = true;
    this.events.push({ type: 'over', reason: reason });
  };

  Engine.prototype.hitCells = function (cells, x, y) {
    for (var i = 0; i < cells.length; i++) {
      var cx = x + cells[i][0], cy = y + cells[i][1];
      if (cx < 0 || cx >= COLS || cy < 0 || cy >= H) return true;
      if (this.board[cy][cx]) return true;
    }
    return false;
  };
  Engine.prototype.hit = function (r, x, y) { return this.hitCells(this.cur.rots[r], x, y); };
  Engine.prototype.grounded = function () { return this.hit(this.rot, this.px, this.py + 1); };

  Engine.prototype.touched = function () {
    if (this.grounded() && this.resets < MAX_RESETS) { this.lockTimer = 0; this.resets++; }
  };

  Engine.prototype.move = function (dx) {
    if (this.over || this.hit(this.rot, this.px + dx, this.py)) return false;
    this.px += dx; this.lastRot = false; this.touched();
    this.events.push({ type: 'move' });
    return true;
  };

  /** dir: +1 clockwise, -1 counter-clockwise. */
  Engine.prototype.rotate = function (dir) {
    if (this.over) return false;
    if (this.cur.noRot) { this.events.push({ type: 'rotate' }); return true; }
    var nr = (this.rot + dir + 4) % 4;
    var kicks = kicksFor(this.cur, this.rot, nr);
    for (var i = 0; i < kicks.length; i++) {
      var nx = this.px + kicks[i][0], ny = this.py - kicks[i][1];
      if (!this.hit(nr, nx, ny)) {
        this.rot = nr; this.px = nx; this.py = ny;
        this.lastRot = true; this.lastKick = i;
        if (this.py > this.lowest) { this.lowest = this.py; this.resets = 0; }
        this.touched();
        this.events.push({ type: 'rotate' });
        return true;
      }
    }
    return false;
  };

  Engine.prototype.softDrop = function () {
    if (this.over || this.grounded()) return false;
    this.py++; this.score += 1; this.lastRot = false; this.gravAcc = 0;
    if (this.py > this.lowest) { this.lowest = this.py; this.resets = 0; }
    return true;
  };

  Engine.prototype.ghostY = function () {
    var y = this.py;
    while (!this.hit(this.rot, this.px, y + 1)) y++;
    return y;
  };

  Engine.prototype.hardDrop = function () {
    if (this.over) return;
    var dist = 0;
    while (!this.grounded()) { this.py++; dist++; }
    this.score += dist * 2;
    if (dist > 0) this.lastRot = false;
    this.events.push({ type: 'harddrop', dist: dist, x: this.px, y: this.py, piece: this.piece, rot: this.rot });
    this.lock();
  };

  Engine.prototype.doHold = function () {
    if (this.over || this.holdsLeft <= 0) return false;
    var cur = this.piece;
    if (this.hold < 0) { this.hold = cur; this.spawn(); }
    else { var h = this.hold; this.hold = cur; this.spawn(h); }
    this.holdsLeft--; this.canHold = this.holdsLeft > 0; this.stats.holds++;
    this.events.push({ type: 'hold' });
    return true;
  };

  // ------------------------------------------------------------ shape manipulation of the falling piece
  /** Flip the falling piece left-to-right. Returns false if it is symmetric or would not fit. */
  Engine.prototype.mirror = function () {
    if (this.over) return false;
    var cur = this.cur, n = cur.n, rots = [], k;
    for (k = 0; k < 4; k++) rots.push(cur.rots[(4 - k) % 4].map(function (c) { return [n - 1 - c[0], c[1]]; }));
    var nrot = (4 - this.rot) % 4;
    if (sameSet(rots[nrot], cur.rots[this.rot])) return false;
    var shifts = [0, -1, 1, -2, 2];
    for (var i = 0; i < shifts.length; i++) {
      if (!this.hitCells(rots[nrot], this.px + shifts[i], this.py)) {
        cur.rots = rots; this.rot = nrot; this.px += shifts[i]; this.lastRot = false;
        this.touched(); this.events.push({ type: 'tool', tool: 'mirror' });
        return true;
      }
    }
    return false;
  };

  /** Cut the block at board cell (cx, cy) off the falling piece. The rest must stay in one piece. */
  Engine.prototype.trimAt = function (cx, cy) {
    if (this.over) return false;
    var cells = this.cells(), idx = -1;
    for (var i = 0; i < cells.length; i++) if (this.px + cells[i][0] === cx && this.py + cells[i][1] === cy) idx = i;
    if (idx < 0 || cells.length <= 1) return false;
    if (!connected(cells.filter(function (c, j) { return j !== idx; }))) return false;
    this.cur.rots = this.cur.rots.map(function (r) { return r.filter(function (c, j) { return j !== idx; }); });
    this.cur.spin = false; this.cur.modified = true;
    this.touched(); this.events.push({ type: 'tool', tool: 'trim' });
    return true;
  };

  /** Add a block at the empty board cell (cx, cy), which must touch the falling piece and lie in its box. Max 6 blocks. */
  Engine.prototype.growAt = function (cx, cy) {
    if (this.over) return false;
    var cells = this.cells(), cur = this.cur, n = cur.n;
    if (cells.length >= 6) return false;
    var bx = cx - this.px, by = cy - this.py;
    if (bx < 0 || by < 0 || bx >= n || by >= n || cx < 0 || cx >= COLS || cy < 0 || cy >= H) return false;
    if (this.board[cy][cx]) return false;
    if (cells.some(function (c) { return c[0] === bx && c[1] === by; })) return false;
    if (!cells.some(function (c) { return Math.abs(c[0] - bx) + Math.abs(c[1] - by) === 1; })) return false;
    if (cur.noRot) {
      cur.rots = genRots(cells.concat([[bx, by]]), n, false); this.rot = 0; cur.noRot = false;
    } else {
      var rots = [], k, j, p;
      for (k = 0; k < 4; k++) {
        p = [bx, by];
        for (j = 0; j < (k - this.rot + 4) % 4; j++) p = rotCW(p, n);
        rots.push(cur.rots[k].concat([p]));
      }
      cur.rots = rots;
    }
    cur.spin = false; cur.modified = true;
    this.touched(); this.events.push({ type: 'tool', tool: 'grow' });
    return true;
  };

  /** Blocks of the falling piece that can be cut (rest stays connected). Board coordinates. */
  Engine.prototype.trimTargets = function () {
    var cells = this.cells(), out = [], self = this;
    if (cells.length <= 1) return out;
    cells.forEach(function (c, i) {
      if (connected(cells.filter(function (d, j) { return j !== i; }))) out.push([self.px + c[0], self.py + c[1]]);
    });
    return out;
  };
  /** Empty board cells where a block could be added. */
  Engine.prototype.growTargets = function () {
    var cells = this.cells(), out = [], n = this.cur.n;
    if (cells.length >= 6) return out;
    for (var by = 0; by < n; by++) for (var bx = 0; bx < n; bx++) {
      var cx = this.px + bx, cy = this.py + by;
      if (cx < 0 || cx >= COLS || cy < 0 || cy >= H || this.board[cy][cx]) continue;
      if (cells.some(function (c) { return c[0] === bx && c[1] === by; })) continue;
      if (cells.some(function (c) { return Math.abs(c[0] - bx) + Math.abs(c[1] - by) === 1; })) out.push([cx, cy]);
    }
    return out;
  };

  /** Turn a freshly spawned standard piece into its grown or trimmed form (used by boss rules). */
  Engine.prototype.morph = function (kind) {
    if (this.piece > 6 || this.cur.modified) return false;
    var d = (kind === 'grow' ? GROW : TRIM)[this.piece], old = this.cur;
    this.cur = { id: this.piece, n: d.n, kick: d.kick, spin: false, noRot: d.noRot, color: old.color, rots: d.rots.slice(), modified: true };
    if (this.hit(this.rot, this.px, this.py)) { this.cur = old; return false; }
    return true;
  };

  /** Push garbage straight into the board now, lifting the falling piece if it is in the way. */
  Engine.prototype.riseGarbage = function (n) {
    this.addGarbage(n);
    if (this.over) return;
    while (this.py > 0 && this.hit(this.rot, this.px, this.py)) this.py--;
    if (this.hit(this.rot, this.px, this.py)) this.finish('garbage');
  };

  // ------------------------------------------------------------ time, lock, scoring
  Engine.prototype.gravityMs = function () {
    var l = Math.min(this.level, 20);
    return Math.max(1, Math.pow(0.8 - (l - 1) * 0.007, l - 1) * 1000 / this.gravMult);
  };

  Engine.prototype.update = function (dt) {
    if (!this.over) {
      this.time += dt;
      if (this.grounded()) {
        this.gravAcc = 0; this.lockTimer += dt;
        if (this.lockTimer >= this.lockMs) this.lock();
      } else {
        this.lockTimer = 0; this.gravAcc += dt;
        var g = this.gravityMs(), n = 0;
        while (this.gravAcc >= g && n < H && !this.grounded()) { this.py++; this.gravAcc -= g; n++; this.lastRot = false; }
        if (this.py > this.lowest) { this.lowest = this.py; this.resets = 0; }
        if (this.grounded()) this.gravAcc = 0;
      }
    }
    var ev = this.events; this.events = []; return ev;
  };

  Engine.prototype.tspinKind = function () {
    if (!this.cur.spin || !this.lastRot) return 0;
    var self = this;
    function occ(dx, dy) {
      var x = self.px + dx, y = self.py + dy;
      return x < 0 || x >= COLS || y < 0 || y >= H || self.board[y][x] !== 0;
    }
    var n = occ(0, 0) + occ(2, 0) + occ(0, 2) + occ(2, 2);
    if (n < 3) return 0;
    var front = [[[0,0],[2,0]], [[2,0],[2,2]], [[0,2],[2,2]], [[0,0],[0,2]]][this.rot];
    var frontBoth = occ(front[0][0], front[0][1]) && occ(front[1][0], front[1][1]);
    return (frontBoth || this.lastKick === 4) ? 2 : 1;
  };

  Engine.prototype.lock = function () {
    var c = this.cells(), i, topHidden = true, cells = [];
    var ts = this.tspinKind();
    for (i = 0; i < c.length; i++) {
      var cx = this.px + c[i][0], cy = this.py + c[i][1];
      this.board[cy][cx] = this.cur.color + 1;
      cells.push([cx, cy]);
      if (cy >= HID) topHidden = false;
    }
    this.pieces++;
    var cleared = [];
    for (var y = 0; y < H; y++) {
      var full = true;
      for (var x = 0; x < COLS; x++) if (!this.board[y][x]) { full = false; break; }
      if (full) cleared.push(y);
    }
    var n = cleared.length;
    if (n) {
      var keep = this.board.filter(function (row, idx) { return cleared.indexOf(idx) < 0; });
      while (keep.length < H) keep.unshift(emptyRow());
      this.board = keep;
    }

    var ev = { type: 'lock', piece: this.piece, size: c.length, modified: this.cur.modified, cells: cells, cleared: cleared, n: n, tspin: ts,
               score: 0, attack: 0, combo: -1, b2b: false, perfect: false, garbage: 0 };
    var lvl = this.level, gain = 0, attack = 0;
    if (n) {
      this.combo++;
      ev.combo = this.combo;
      var difficult = n === 4 || ts > 0;
      var nn = Math.min(n, 4);
      var base = ts === 2 ? TSPIN_SCORE[Math.min(n, 3)] : ts === 1 ? MINI_SCORE[Math.min(n, 2)] : LINE_SCORE[nn];
      var a = ts === 2 ? ATTACK_TSPIN[Math.min(n, 3)] : ts === 1 ? ATTACK_MINI[Math.min(n, 2)] : ATTACK_LINES[nn];
      if (difficult) {
        if (this.b2b > 0) { base = Math.floor(base * 1.5); a += 1; ev.b2b = true; }
        this.b2b++;
      } else this.b2b = 0;
      gain += base * lvl;
      if (this.combo > 0) gain += 50 * this.combo * lvl;
      a += COMBO_ATTACK[Math.min(this.combo, COMBO_ATTACK.length - 1)];
      attack = a;
      if (this.board.every(function (row) { return row.every(function (v) { return !v; }); })) {
        ev.perfect = true; gain += PC_SCORE[nn - 1] * lvl; attack = PC_ATTACK; this.stats.perfect++;
      }
      this.lines += n;
      if (!this.fixedLevel) this.level = Math.min(20, this.startLevel + Math.floor(this.lines / 10));
      if (ts === 2) this.stats.tspins++;
      if (n === 4) this.stats.tetrises++;
      this.stats.maxCombo = Math.max(this.stats.maxCombo, this.combo);
      this.stats.maxB2b = Math.max(this.stats.maxB2b, this.b2b);
    } else {
      this.combo = -1;
      if (ts) gain += (ts === 2 ? TSPIN_SCORE[0] : MINI_SCORE[0]) * lvl;
    }
    this.score += gain; ev.score = gain;

    if (attack > 0 && this.pending > 0) {
      var cancel = Math.min(attack, this.pending);
      this.pending -= cancel; attack -= cancel;
    }
    ev.attack = attack; this.attackSent += attack;
    ev.b2bChain = this.b2b;
    this.events.push(ev);

    if (topHidden) { this.finish('lockout'); return; }
    if (!n && this.pending > 0) {
      var take = Math.min(this.pending, 8);
      this.pending -= take; ev.garbage = take;
      this.addGarbage(take);
      if (this.over) return;
    }
    this.holdsLeft = this.maxHolds; this.canHold = true;
    this.spawn();
  };

  Engine.prototype.receiveGarbage = function (n) {
    if (n > 0) { this.pending += n; this.events.push({ type: 'incoming', n: n }); }
  };

  Engine.prototype.addGarbage = function (n) {
    for (var i = 0; i < n; i++) {
      if (this.grng() > 0.7) this.garbHole = Math.floor(this.grng() * COLS);
      if (this.board[0].some(function (v) { return v; })) { this.finish('garbage'); return; }
      this.board.shift();
      var row = new Array(COLS).fill(GARBAGE); row[this.garbHole] = 0;
      this.board.push(row);
    }
    this.events.push({ type: 'garbage', n: n });
  };

  Engine.SHAPES = SHAPES; Engine.DEFS = DEFS; Engine.EXTRA = EXTRA; Engine.GROW = GROW; Engine.TRIM = TRIM;
  Engine.COLS = COLS; Engine.VIS = VIS; Engine.HID = HID; Engine.H = H; Engine.GARBAGE = GARBAGE;
  Engine.NAMES = NAMES; Engine.mulberry32 = mulberry32; Engine.LOCK_MS = LOCK_MS; Engine.connected = connected;

  if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
  else root.Engine = Engine;
})(typeof window !== 'undefined' ? window : globalThis);
