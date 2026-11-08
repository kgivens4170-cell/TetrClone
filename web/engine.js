/* TetrClone engine: pure game logic, no DOM. Works in browsers (window.Engine) and Node (module.exports). */
(function (root) {
  'use strict';

  var COLS = 10, VIS = 20, HID = 2, H = VIS + HID;
  var LOCK_MS = 500, MAX_RESETS = 15;
  // piece ids: 0 I, 1 O, 2 T, 3 S, 4 Z, 5 J, 6 L.  Board cell value = id + 1; 8 = garbage.
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
  // SHAPES[piece][rotation] = 4 cells (x,y) in a 4x4 box. Rotation 0,1(R),2,3(L), clockwise.
  var SHAPES = BASE.map(function (cells, p) {
    var n = p === 0 ? 4 : 3, out = [], cur = cells;
    for (var r = 0; r < 4; r++) {
      out.push(cur);
      cur = p === 1 ? cur : cur.map(function (c) { return [n - 1 - c[1], c[0]]; });
    }
    return out;
  });

  // Super Rotation System kick tables, as published (x right, y UP). Applied below with y flipped.
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

  var LINE_SCORE = [0, 100, 300, 500, 800];
  var TSPIN_SCORE = [400, 800, 1200, 1600];      // full T-spin, 0..3 lines
  var MINI_SCORE = [100, 200, 400];              // T-spin mini, 0..2 lines
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

  /** opts: seed, level, fixedLevel */
  function Engine(opts) {
    opts = opts || {};
    this.seed = opts.seed != null ? opts.seed : (Math.random() * 2147483647) | 0;
    this.rng = mulberry32(this.seed);
    this.grng = mulberry32((this.seed ^ 0x9e3779b9) | 0);
    this.startLevel = opts.level || 1;
    this.fixedLevel = !!opts.fixedLevel;
    this.board = [];
    for (var y = 0; y < H; y++) this.board.push(emptyRow());
    this.queue = []; this.bag = [];
    this.hold = -1; this.canHold = true;
    this.score = 0; this.lines = 0; this.level = this.startLevel; this.pieces = 0;
    this.combo = -1; this.b2b = 0;            // b2b = length of the current back-to-back chain
    this.pending = 0;                         // incoming garbage lines not yet applied
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
        this.bag = [0, 1, 2, 3, 4, 5, 6];
        for (var i = 6; i > 0; i--) {
          var j = Math.floor(this.rng() * (i + 1)), t = this.bag[i];
          this.bag[i] = this.bag[j]; this.bag[j] = t;
        }
      }
      this.queue.push(this.bag.pop());
    }
  };

  Engine.prototype.spawn = function (forced) {
    this.piece = forced != null ? forced : this.queue.shift();
    this.fillQueue();
    this.rot = 0; this.px = 3; this.py = 0;
    this.lastRot = false; this.lastKick = 0;
    this.lockTimer = 0; this.resets = 0; this.gravAcc = 0;
    this.serial++;
    if (this.hit(this.piece, 0, this.px, this.py)) { this.finish('topout'); return; }
    if (!this.hit(this.piece, 0, this.px, this.py + 1)) this.py++;
    this.lowest = this.py;
  };

  Engine.prototype.finish = function (reason) {
    if (this.over) return;
    this.over = true;
    this.events.push({ type: 'over', reason: reason });
  };

  Engine.prototype.hit = function (p, r, x, y) {
    var c = SHAPES[p][r];
    for (var i = 0; i < 4; i++) {
      var cx = x + c[i][0], cy = y + c[i][1];
      if (cx < 0 || cx >= COLS || cy < 0 || cy >= H) return true;
      if (this.board[cy][cx]) return true;
    }
    return false;
  };

  Engine.prototype.grounded = function () { return this.hit(this.piece, this.rot, this.px, this.py + 1); };

  Engine.prototype.touched = function () {
    // after a successful move or rotation: refresh lock delay while grounded
    if (this.grounded() && this.resets < MAX_RESETS) { this.lockTimer = 0; this.resets++; }
  };

  Engine.prototype.move = function (dx) {
    if (this.over || this.hit(this.piece, this.rot, this.px + dx, this.py)) return false;
    this.px += dx; this.lastRot = false; this.touched();
    this.events.push({ type: 'move' });
    return true;
  };

  /** dir: +1 clockwise, -1 counter-clockwise. */
  Engine.prototype.rotate = function (dir) {
    if (this.over) return false;
    if (this.piece === 1) { this.events.push({ type: 'rotate' }); return true; }
    var nr = (this.rot + dir + 4) % 4;
    var kicks = (this.piece === 0 ? K_I : K_JLSTZ)[this.rot + '>' + nr];
    for (var i = 0; i < kicks.length; i++) {
      var nx = this.px + kicks[i][0], ny = this.py - kicks[i][1];
      if (!this.hit(this.piece, nr, nx, ny)) {
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
    while (!this.hit(this.piece, this.rot, this.px, y + 1)) y++;
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
    if (this.over || !this.canHold) return false;
    var cur = this.piece;
    if (this.hold < 0) { this.hold = cur; this.spawn(); }
    else { var h = this.hold; this.hold = cur; this.spawn(h); }
    this.canHold = false; this.stats.holds++;
    this.events.push({ type: 'hold' });
    return true;
  };

  Engine.prototype.gravityMs = function () {
    var l = Math.min(this.level, 20);
    return Math.max(1, Math.pow(0.8 - (l - 1) * 0.007, l - 1) * 1000);
  };

  Engine.prototype.update = function (dt) {
    if (!this.over) {
      this.time += dt;
      if (this.grounded()) {
        this.gravAcc = 0; this.lockTimer += dt;
        if (this.lockTimer >= LOCK_MS) this.lock();
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
    if (this.piece !== 2 || !this.lastRot) return 0;
    var self = this;
    function occ(dx, dy) {
      var x = self.px + dx, y = self.py + dy;
      return x < 0 || x >= COLS || y < 0 || y >= H || self.board[y][x] !== 0;
    }
    var n = occ(0, 0) + occ(2, 0) + occ(0, 2) + occ(2, 2);
    if (n < 3) return 0;
    var front = [[[0,0],[2,0]], [[2,0],[2,2]], [[0,2],[2,2]], [[0,0],[0,2]]][this.rot];
    var frontBoth = occ(front[0][0], front[0][1]) && occ(front[1][0], front[1][1]);
    return (frontBoth || this.lastKick === 4) ? 2 : 1;   // 2 full, 1 mini
  };

  Engine.prototype.lock = function () {
    var c = SHAPES[this.piece][this.rot], i, topHidden = true, cells = [];
    var ts = this.tspinKind();
    for (i = 0; i < 4; i++) {
      var cx = this.px + c[i][0], cy = this.py + c[i][1];
      this.board[cy][cx] = this.piece + 1;
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

    var ev = { type: 'lock', piece: this.piece, cells: cells, cleared: cleared, n: n, tspin: ts,
               score: 0, attack: 0, combo: -1, b2b: false, perfect: false, garbage: 0 };
    var lvl = this.level, gain = 0, attack = 0;
    if (n) {
      this.combo++;
      ev.combo = this.combo;
      var difficult = n === 4 || ts > 0;
      var base = ts === 2 ? TSPIN_SCORE[n] : ts === 1 ? MINI_SCORE[n] : LINE_SCORE[n];
      var a = ts === 2 ? ATTACK_TSPIN[n] : ts === 1 ? ATTACK_MINI[n] : ATTACK_LINES[n];
      if (difficult) {
        if (this.b2b > 0) { base = Math.floor(base * 1.5); a += 1; ev.b2b = true; }
        this.b2b++;
      } else this.b2b = 0;
      gain += base * lvl;
      if (this.combo > 0) gain += 50 * this.combo * lvl;
      a += COMBO_ATTACK[Math.min(this.combo, COMBO_ATTACK.length - 1)];
      attack = a;
      if (this.board.every(function (row) { return row.every(function (v) { return !v; }); })) {
        ev.perfect = true; gain += PC_SCORE[n - 1] * lvl; attack = PC_ATTACK; this.stats.perfect++;
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

    // outgoing attack first cancels incoming garbage
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
    this.canHold = true;
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
      var row = new Array(COLS).fill(8); row[this.garbHole] = 0;
      this.board.push(row);
    }
    this.events.push({ type: 'garbage', n: n });
  };

  Engine.SHAPES = SHAPES; Engine.COLS = COLS; Engine.VIS = VIS; Engine.HID = HID; Engine.H = H;
  Engine.NAMES = NAMES; Engine.mulberry32 = mulberry32; Engine.LOCK_MS = LOCK_MS;

  if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
  else root.Engine = Engine;
})(typeof window !== 'undefined' ? window : globalThis);
