/* TetrClone roguelike rules: stages, bosses, relics, coins, deck building, shop. Pure logic, no DOM. */
(function (root) {
  'use strict';
  var E = typeof module !== 'undefined' && module.exports ? require('./engine.js') : root.Engine;

  var TOOLS = ['mirror', 'trim', 'grow'];
  var TOOL_INFO = {
    mirror: { name: 'Mirror', text: 'Flip the falling piece left to right.' },
    trim: { name: 'Trim', text: 'Tap a block of the falling piece to cut it off.' },
    grow: { name: 'Grow', text: 'Tap a square next to the falling piece to add a block (6 max).' }
  };

  // goal: lines (clear n, optionally within `pieces`) or survive (ms).  mods: garbage {every, hard}, hideQueue, noGhost, chaos
  var STAGES = [
    { name: 'Warm-up', level: 1, goal: { type: 'lines', n: 8 } },
    { name: 'Tight Fit', level: 2, goal: { type: 'lines', n: 10, pieces: 34 } },
    { name: 'The Mason', boss: true, level: 2, goal: { type: 'lines', n: 12 }, mods: { garbage: { every: 11000, hard: true } },
      rule: 'A garbage row rises from below every 11 seconds.' },
    { name: 'Climb', level: 3, goal: { type: 'lines', n: 14 } },
    { name: 'Rising Tide', level: 3, goal: { type: 'survive', ms: 60000 }, mods: { garbage: { every: 7000, hard: false } },
      rule: 'Garbage keeps coming. Clear lines to hold it off.' },
    { name: 'The Fog', boss: true, level: 4, goal: { type: 'lines', n: 16 }, mods: { hideQueue: true, noGhost: true },
      rule: 'No ghost piece and no next-piece preview.' },
    { name: 'Efficiency', level: 5, goal: { type: 'lines', n: 18, pieces: 56 } },
    { name: 'Pressure', level: 6, goal: { type: 'lines', n: 20 }, mods: { garbage: { every: 15000, hard: false } },
      rule: 'Garbage arrives every 15 seconds.' },
    { name: 'The Architect', boss: true, level: 6, goal: { type: 'lines', n: 20 }, mods: { chaos: 0.4, garbage: { every: 14000, hard: true } },
      rule: 'Pieces arrive randomly grown or trimmed, and garbage rises every 14 seconds.' }
  ];

  var RELICS = [
    { id: 'gold_rush', name: 'Gold Rush', text: 'Every cleared line pays +1 coin.', rare: 0 },
    { id: 'combo_coin', name: 'Combo Coin', text: 'Combos pay coins equal to the combo count.', rare: 0 },
    { id: 'tetris_tax', name: 'Tetris Tax', text: 'A 4-line clear pays +6 coins.', rare: 0 },
    { id: 'spin_dealer', name: 'Spin Dealer', text: 'T-spin clears pay +4 coins.', rare: 0 },
    { id: 'slow_mo', name: 'Slow Motion', text: 'Gravity is 25% slower.', rare: 0 },
    { id: 'long_fuse', name: 'Long Fuse', text: 'Pieces wait 300 ms longer before locking.', rare: 0 },
    { id: 'reserve', name: 'Reserve', text: '+6 pieces in piece-limited stages.', rare: 0 },
    { id: 'mirror_plus', name: 'Hall of Mirrors', text: '+1 Mirror charge each stage.', rare: 0 },
    { id: 'trim_plus', name: 'Sharp Chisel', text: '+1 Trim charge each stage.', rare: 0 },
    { id: 'grow_plus', name: 'Green Thumb', text: '+1 Grow charge each stage.', rare: 0 },
    { id: 'tiny_tactics', name: 'Tiny Tactics', text: 'Locking a piece of 3 blocks or fewer pays 1 coin.', rare: 0 },
    { id: 'haggler', name: 'Haggler', text: 'Shop prices are 20% lower.', rare: 0 },
    { id: 'second_hold', name: 'Twin Holds', text: 'Hold twice per piece.', rare: 1 },
    { id: 'pent_pro', name: 'Pentomino Pro', text: 'Clears made with a 5+ block piece pay +2 coins per line.', rare: 1 },
    { id: 'banker', name: 'Banker', text: 'Interest cap rises from 5 to 10 coins.', rare: 1 },
    { id: 'clean_sweep', name: 'Clean Sweep', text: 'A perfect clear pays +25 coins.', rare: 1 },
    { id: 'danger_pay', name: 'Danger Pay', text: 'Clearing lines while the stack is 15+ high pays double.', rare: 1 },
    { id: 'insurance', name: 'Insurance', text: 'Gain 1 life right now.', rare: 1 }
  ];
  var RELIC_BY_ID = {}; RELICS.forEach(function (r) { RELIC_BY_ID[r.id] = r; });

  function hashStr(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rngFor(run, salt) { return E.mulberry32((run.seed ^ hashStr(salt)) | 0); }
  function has(run, id) { return run.relics.indexOf(id) >= 0; }

  function newRun(seed) {
    return { seed: (seed == null ? (Math.random() * 4294967296) : seed) >>> 0, stage: 0, attempt: 0, lives: 2, coins: 0, relics: [],
             deck: [0, 1, 2, 3, 4, 5, 6], mut: {}, toolMax: { mirror: 1, trim: 1, grow: 0 },
             phase: 'intro', draft: null, shop: null, cleared: 0, msg: '',
             stats: { lines: 0, earned: 0, pieces: 0, used: {}, bossesDown: 0 } };
  }

  function mods(run) {
    return {
      gravMult: has(run, 'slow_mo') ? 0.75 : 1,
      lockMs: E.LOCK_MS + (has(run, 'long_fuse') ? 300 : 0),
      maxHolds: has(run, 'second_hold') ? 2 : 1,
      extraPieces: has(run, 'reserve') ? 6 : 0,
      bankCap: has(run, 'banker') ? 10 : 5,
      priceMult: has(run, 'haggler') ? 0.8 : 1
    };
  }
  function toolCharges(run) {
    return { mirror: run.toolMax.mirror + (has(run, 'mirror_plus') ? 1 : 0),
             trim: run.toolMax.trim + (has(run, 'trim_plus') ? 1 : 0),
             grow: run.toolMax.grow + (has(run, 'grow_plus') ? 1 : 0) };
  }

  /** Piece definitions for this run, by id (0-6 standard with mutations, 7-13 extras). */
  function defsFor(run) {
    var defs = [];
    for (var id = 0; id < 14; id++) {
      var d = id < 7 ? E.DEFS[id] : E.EXTRA[id - 7], m = run.mut[id];
      if (id < 7 && m === 'grow') d = E.GROW[id]; else if (id < 7 && m === 'trim') d = E.TRIM[id];
      defs.push(d);
    }
    return defs;
  }
  function pieceSize(run, id) { return defsFor(run)[id].rots[0].length; }

  function stageInfo(run) { return STAGES[Math.min(run.stage, STAGES.length - 1)]; }
  function budget(run, st) { return st.goal.pieces ? st.goal.pieces + mods(run).extraPieces : 0; }

  /** Options for a new Engine for the current stage and attempt. */
  function engineOpts(run) {
    var st = stageInfo(run), m = mods(run);
    var seed = (run.seed ^ Math.imul(run.stage + 1, 2654435761) ^ Math.imul(run.attempt + 7, 40503)) >>> 0;
    return { seed: seed, level: st.level, fixedLevel: true, defs: defsFor(run), bag: run.deck, lockMs: m.lockMs, gravMult: m.gravMult, maxHolds: m.maxHolds };
  }

  var LINE_COINS = [0, 1, 2, 3, 5];
  /** Coins earned by one lock event. ctx: { height } = rows the stack reaches after the lock. */
  function coinsForLock(run, ev, ctx) {
    var c = 0, base = 0;
    if (ev.n > 0) {
      base = LINE_COINS[Math.min(ev.n, 4)] + Math.max(0, ev.n - 4);
      c += base;
      if (has(run, 'gold_rush')) c += ev.n;
      if (has(run, 'combo_coin') && ev.combo >= 1) c += ev.combo;
      if (has(run, 'tetris_tax') && ev.n >= 4) c += 6;
      if (has(run, 'spin_dealer') && ev.tspin === 2) c += 4;
      if (has(run, 'pent_pro') && ev.size >= 5) c += 2 * ev.n;
      if (has(run, 'danger_pay') && ctx && ctx.height >= 15) c += base;
      if (ev.perfect) c += 10 + (has(run, 'clean_sweep') ? 25 : 0);
    }
    if (has(run, 'tiny_tactics') && ev.size <= 3) c += 1;
    return c;
  }

  /** Payout for clearing the current stage. info: { piecesLeft } for piece-limited stages. */
  function clearReward(run, info) {
    var st = stageInfo(run), m = mods(run);
    var base = 5 + run.stage, boss = st.boss ? 10 : 0, left = st.goal.pieces ? Math.min(10, Math.max(0, (info && info.piecesLeft) || 0)) : 0;
    var interest = Math.min(m.bankCap, Math.floor(run.coins / 5));
    return { base: base, boss: boss, leftover: left, interest: interest, total: base + boss + left + interest };
  }

  function draftOptions(run, bossReward) {
    var rng = rngFor(run, 'draft' + run.stage + ':' + run.relics.length);
    var pool = RELICS.filter(function (r) { return !has(run, r.id) && (!bossReward || r.rare === 1); });
    if (pool.length < 3) pool = RELICS.filter(function (r) { return !has(run, r.id); });
    var out = [];
    while (out.length < 3 && pool.length) {
      var rareWeight = bossReward ? 1 : 0.3, wantRare = rng() < rareWeight;
      var sub = pool.filter(function (r) { return !!r.rare === wantRare; });
      if (!sub.length) sub = pool;
      var pick = sub[Math.floor(rng() * sub.length)];
      out.push(pick.id); pool = pool.filter(function (r) { return r.id !== pick.id; });
    }
    return out;
  }
  function addRelic(run, id) {
    if (has(run, id)) return;
    run.relics.push(id);
    if (id === 'insurance') run.lives = Math.min(5, run.lives + 1);
  }
  function pickRelic(run, id) {
    if (!run.draft || run.draft.indexOf(id) < 0) return false;
    addRelic(run, id); run.draft = null; run.phase = 'shop'; run.shop = shopStock(run, 0);
    return true;
  }

  var ADD_POOL = [0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
  var FIXED_BASE = { cull: 5, dupe: 7, grow: 9, trim: 6, life: 14 };
  var TOOL_BASE = { mirror: 8, trim: 8, grow: 10 };
  var MAX_DECK = 28, MIN_DECK = 5;

  function addCost(run, pid) { return 3 + pieceSize(run, pid); }

  function randomOffers(run, rng, rerolls) {
    var items = [], used = {};
    for (var i = 0; i < 2; i++) {
      var pid; do { pid = ADD_POOL[Math.floor(rng() * ADD_POOL.length)]; } while (used[pid]);
      used[pid] = 1; items.push({ kind: 'add', pid: pid, base: addCost(run, pid), sold: false });
    }
    var relics = RELICS.filter(function (r) { return !has(run, r.id); });
    if (relics.length) { var r = relics[Math.floor(rng() * relics.length)]; items.push({ kind: 'relic', id: r.id, base: r.rare ? 16 : 10, sold: false }); }
    var tool = TOOLS[Math.floor(rng() * 3)];
    items.push({ kind: 'tool', tool: tool, base: TOOL_BASE[tool], sold: false });
    return items;
  }

  function shopStock(run, rerolls) {
    var rng = rngFor(run, 'shop' + run.stage + ':' + rerolls);
    var items = randomOffers(run, rng, rerolls);
    ['cull', 'dupe', 'grow', 'trim'].forEach(function (k) { items.push({ kind: k, base: FIXED_BASE[k], sold: false }); });
    if (run.lives < 5) items.push({ kind: 'life', base: FIXED_BASE.life, sold: false });
    return { items: items, rerolls: rerolls };
  }
  function rerollCost(run) { return Math.max(1, Math.round((3 + run.shop.rerolls) * mods(run).priceMult)); }
  function reroll(run) {
    var cost = rerollCost(run);
    if (run.coins < cost) return { ok: false, msg: 'Not enough coins' };
    var keep = run.shop.items.filter(function (it) { return ['cull', 'dupe', 'grow', 'trim', 'life'].indexOf(it.kind) >= 0; });
    var fresh = shopStock(run, run.shop.rerolls + 1);
    var random = fresh.items.filter(function (it) { return ['add', 'relic', 'tool'].indexOf(it.kind) >= 0; });
    run.coins -= cost;
    run.shop = { items: random.concat(keep), rerolls: run.shop.rerolls + 1 };
    return { ok: true };
  }

  function price(run, it) { return Math.max(1, Math.round(it.base * mods(run).priceMult)); }

  function deckCounts(run) {
    var c = {}; run.deck.forEach(function (id) { c[id] = (c[id] || 0) + 1; });
    return c;
  }

  /** Choices for items that ask which piece to act on. Each: { key, def, count, disabled }. */
  function pickerOptions(run, it) {
    var counts = deckCounts(run), defs = defsFor(run), ids = Object.keys(counts).map(Number).sort(function (a, b) { return a - b; });
    var out = [];
    ids.forEach(function (id) {
      var o = { key: id, def: defs[id], count: counts[id], disabled: false };
      if (it.kind === 'cull') o.disabled = run.deck.length <= MIN_DECK;
      else if (it.kind === 'dupe') o.disabled = run.deck.length >= MAX_DECK;
      else if (it.kind === 'grow' || it.kind === 'trim') {
        if (id > 6 || run.mut[id]) return;
        o.def = (it.kind === 'grow' ? E.GROW : E.TRIM)[id];
      }
      out.push(o);
    });
    return out;
  }
  function needsPick(it) { return ['cull', 'dupe', 'grow', 'trim'].indexOf(it.kind) >= 0; }

  function buy(run, idx, choice) {
    var it = run.shop && run.shop.items[idx];
    if (!it || it.sold) return { ok: false, msg: 'Already bought' };
    var cost = price(run, it);
    if (run.coins < cost) return { ok: false, msg: 'Not enough coins' };
    switch (it.kind) {
      case 'add':
        if (run.deck.length >= MAX_DECK) return { ok: false, msg: 'Your bag is full' };
        run.deck.push(it.pid); break;
      case 'relic': addRelic(run, it.id); break;
      case 'tool': run.toolMax[it.tool]++; break;
      case 'life':
        if (run.lives >= 5) return { ok: false, msg: 'Lives are maxed' };
        run.lives++; break;
      case 'cull':
        if (run.deck.length <= MIN_DECK) return { ok: false, msg: 'Keep at least ' + MIN_DECK + ' pieces' };
        var at = run.deck.indexOf(choice); if (at < 0) return { ok: false, msg: 'Pick a piece' };
        run.deck.splice(at, 1); break;
      case 'dupe':
        if (run.deck.indexOf(choice) < 0) return { ok: false, msg: 'Pick a piece' };
        if (run.deck.length >= MAX_DECK) return { ok: false, msg: 'Your bag is full' };
        run.deck.push(choice); break;
      case 'grow': case 'trim':
        if (run.deck.indexOf(choice) < 0 || choice > 6 || run.mut[choice]) return { ok: false, msg: 'Pick a standard piece' };
        run.mut[choice] = it.kind; break;
      default: return { ok: false, msg: 'Unknown item' };
    }
    run.coins -= cost; it.sold = true;
    return { ok: true };
  }

  function goalText(st, run) {
    var g = st.goal;
    if (g.type === 'survive') return 'Survive ' + Math.round(g.ms / 1000) + ' seconds';
    var b = g.pieces ? g.pieces + (run ? mods(run).extraPieces : 0) : 0;
    return 'Clear ' + g.n + ' lines' + (b ? ' in ' + b + ' pieces' : '');
  }

  var API = { TOOLS: TOOLS, TOOL_INFO: TOOL_INFO, STAGES: STAGES, RELICS: RELICS, RELIC_BY_ID: RELIC_BY_ID, MAX_DECK: MAX_DECK, MIN_DECK: MIN_DECK,
              newRun: newRun, mods: mods, toolCharges: toolCharges, defsFor: defsFor, pieceSize: pieceSize, stageInfo: stageInfo, budget: budget,
              engineOpts: engineOpts, coinsForLock: coinsForLock, clearReward: clearReward, draftOptions: draftOptions, pickRelic: pickRelic,
              addRelic: addRelic, shopStock: shopStock, reroll: reroll, rerollCost: rerollCost, price: price, deckCounts: deckCounts,
              pickerOptions: pickerOptions, needsPick: needsPick, buy: buy, goalText: goalText, has: has };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.Rogue = API;
})(typeof window !== 'undefined' ? window : globalThis);
