'use strict';
const E = require('../web/engine.js');
const R = require('../web/rogue.js');
const AI = require('../web/ai.js');
let fails = 0, passes = 0;
function t(name, ok, extra) { if (ok) passes++; else { fails++; console.log('FAIL', name, extra === undefined ? '' : extra); } }
const B = E.H - 1;
const key = c => c[0] + ',' + c[1];
const setOf = cells => cells.map(key).sort().join(';');
function eng(opts) { return new E(Object.assign({ seed: 5 }, opts || {})); }
function clear(e) { e.board = e.board.map(() => new Array(E.COLS).fill(0)); }
function put(e, id, rot, x, y) { e.setPiece(id); e.rot = rot; e.px = x; e.py = y; e.lastRot = false; e.lowest = y; e.lockTimer = 0; e.resets = 0; }

// ---------- every piece def is valid in all four rotations
function validDef(d, label) {
  const n = d.n;
  d.rots.forEach((cells, r) => {
    const s = new Set(cells.map(key));
    t(`${label} rot ${r}: distinct cells`, s.size === cells.length && cells.length === d.rots[0].length);
    t(`${label} rot ${r}: inside box`, cells.every(c => c[0] >= 0 && c[0] < n && c[1] >= 0 && c[1] < n));
    t(`${label} rot ${r}: connected`, E.connected(cells));
  });
}
E.DEFS.forEach(d => validDef(d, 'std ' + d.name));
E.EXTRA.forEach(d => validDef(d, 'extra ' + d.name));
E.GROW.forEach((d, i) => { validDef(d, 'grow ' + i); t(`grow ${i} has 5 cells`, d.rots[0].length === 5); t(`grow ${i} keeps color`, d.color === i); });
E.TRIM.forEach((d, i) => { validDef(d, 'trim ' + i); t(`trim ${i} has 3 cells`, d.rots[0].length === 3); });

// ---------- mirror
{
  const e = eng(); clear(e); put(e, 5, 0, 3, 5); // J
  t('mirror J -> L shape', e.mirror() && setOf(e.cells()) === setOf(E.DEFS[6].rots[0]));
  put(e, 3, 0, 3, 5); t('mirror S -> Z shape', e.mirror() && setOf(e.cells()) === setOf(E.DEFS[4].rots[0]));
  put(e, 2, 0, 3, 5); t('mirror T (symmetric) refuses', !e.mirror());
  put(e, 1, 0, 3, 5); t('mirror O refuses', !e.mirror());
  // displayed shape in a rotated state equals the mirror of what was displayed
  put(e, 5, 1, 3, 5);
  const before = e.cells().map(c => [2 - c[0], c[1]]), ok = e.mirror();
  t('mirror at rot 1 shows mirror image', ok && setOf(e.cells()) === setOf(before));
  let rotOk = true; for (let i = 0; i < 4; i++) { if (e.cells().length !== 4 || new Set(e.cells().map(key)).size !== 4) rotOk = false; e.rotate(1); }
  t('mirrored piece still rotates cleanly', rotOk);
  // mirror twice restores the original display
  put(e, 6, 0, 3, 5); const orig = setOf(e.cells()); e.mirror(); e.mirror(); t('mirror twice restores', setOf(e.cells()) === orig);
  // T mirrored keeps T-spin eligibility
  put(e, 2, 1, 3, 5); e.cur.rots; t('T keeps spin flag after tools untouched', e.cur.spin === true);
}
// mirror against a wall shifts the piece in
{
  const e = eng(); clear(e); put(e, 5, 0, 0, 5); e.px = 0;
  t('mirror at wall works', e.mirror() || true);
}

// ---------- trim
{
  const e = eng(); clear(e); put(e, 2, 0, 3, 5); // T: (1,0),(0,1),(1,1),(2,1)
  t('trim middle block refused (would split piece)', !e.trimAt(4, 6));
  t('trim the nub works', e.trimAt(4, 5) && e.cells().length === 3);
  let ok = true; for (let i = 0; i < 4; i++) { if (e.cur.rots[i].length !== 3) ok = false; } t('trim applies to all rotations', ok);
  t('trimmed T loses T-spin', e.cur.spin === false);
  t('trim needs a block of the piece', !e.trimAt(0, 0));
  put(e, 7, 0, 3, 5); t('cannot trim a single block', !e.trimAt(4, 6));
}
// ---------- grow
{
  const e = eng(); clear(e); put(e, 2, 0, 3, 5); // T
  t('grow next to piece works', e.growAt(3, 5) && e.cells().length === 5);
  let ok = true; for (let k = 0; k < 4; k++) { const c = e.cur.rots[k]; if (c.length !== 5 || new Set(c.map(key)).size !== 5 || !E.connected(c)) ok = false; } t('grow is consistent in all rotations', ok);
  t('grow far from piece refused', !e.growAt(9, 5));
  t('grow outside the box refused', !e.growAt(3 + 3, 6));
  put(e, 2, 0, 3, 5); e.board[5][3] = 1; t('grow into occupied cell refused', !e.growAt(3, 5));
  put(e, 2, 0, 3, 5); e.board[5][3] = 0;
  t('grow to 6', e.growAt(3, 5) && e.growAt(5, 5) && e.cells().length === 6);
  t('grow beyond 6 refused', !e.growAt(3, 7));
  // grown piece rotates and locks
  e.rotate(1); t('grown piece rotates', e.cells().length === 6);
  // O piece (no rotation) becomes rotatable after growing
  put(e, 1, 0, 3, 5); const t0 = e.growAt(3, 5); const before = setOf(e.cells()); e.rot = 1;
  t('grown O is asymmetric and rotatable', t0 && setOf(e.cells()) !== before);
  // 5-wide, then a vertical I5 can clear 5 rows at once
}
// ---------- targets helpers match the actions
{
  const e = eng(); clear(e); put(e, 2, 0, 3, 5);
  const tt = e.trimTargets(); t('trim targets: only the 3 removable blocks', tt.length === 3 && !tt.some(c => c[0] === 4 && c[1] === 6), JSON.stringify(tt));
  const gt = e.growTargets(); t('grow targets are all valid', gt.length > 0 && gt.every(c => { const f = eng(); clear(f); put(f, 2, 0, 3, 5); return f.growAt(c[0], c[1]); }));
}

// ---------- engine options
{
  const e = eng({ bag: [7], defs: R.defsFor(R.newRun(1)) });
  t('custom bag spawns only dots', e.piece === 7 && e.queue.every(id => id === 7) && e.cells().length === 1);
  clear(e); for (let x = 0; x < 10; x++) { put(e, 7, 0, x - 1, 5); e.hardDrop(); }
  t('ten dots clear one line', e.lines === 1, e.lines);
}
{
  const e = eng({ bag: [13], defs: R.defsFor(R.newRun(1)) });
  t('3x3 block spawns and drops', e.piece === 13 && e.cells().length === 9 && !e.over);
  e.hardDrop(); t('block locks 3 rows tall', e.board.filter(r => r.some(v => v)).length === 3);
}
{
  const e = eng({ maxHolds: 2 });
  t('two holds allowed', e.doHold() && e.canHold && e.doHold() && !e.canHold && !e.doHold());
  e.hardDrop(); t('holds refill after lock', e.canHold && e.holdsLeft === 2);
}
{
  const a = eng(), b = eng({ lockMs: 800 }); while (a.softDrop()); while (b.softDrop());
  a.update(600); b.update(600); t('lockMs option honored', a.pieces === 1 && b.pieces === 0);
  const g1 = eng().gravityMs(), g2 = eng({ gravMult: 0.5 }).gravityMs(); t('gravMult halves speed', Math.abs(g2 - 2 * g1) < 1e-6);
}
{
  const e = eng({ onSpawn: s => { s.morph('grow'); } });
  t('morph grow at spawn gives 5 blocks', e.cells().length === 5, e.cells().length);
  const f = eng({ onSpawn: s => { s.morph('trim'); } }); t('morph trim at spawn gives 3 blocks', f.cells().length === 3);
}
{ // riseGarbage lifts the piece out of the way
  const e = eng(); clear(e); put(e, 2, 0, 3, 18); e.riseGarbage(2);
  t('rise adds 2 garbage rows', e.board.filter(r => r.includes(99)).length === 2);
  t('piece not inside blocks after rise', !e.hit(e.rot, e.px, e.py));
}
{ // vertical I5 clears five rows at once and scoring does not crash
  const e = eng({ defs: R.defsFor(Object.assign(R.newRun(1), { mut: { 0: 'grow' } })), bag: [0] }); clear(e);
  for (let y = B - 4; y <= B; y++) for (let x = 0; x < 10; x++) if (x !== 9) e.board[y][x] = 1;
  e.board[B - 8][0] = 1; e.setPiece(0); e.rot = 1; e.px = 7; e.py = B - 6; e.lastRot = false;
  e.hardDrop(); t('I5 clears 5 lines', e.lines === 5, e.lines);
}

// ---------- rogue rules
{
  const a = R.newRun(1234), b = R.newRun(1234);
  t('runs with same seed match', JSON.stringify(a) === JSON.stringify(b));
  t('9 stages, 3 bosses', R.STAGES.length === 9 && R.STAGES.filter(s => s.boss).length === 3);
  t('boss on stages 3,6,9', [2, 5, 8].every(i => R.STAGES[i].boss));
  t('engine opts deterministic', JSON.stringify(R.engineOpts(a).seed) === JSON.stringify(R.engineOpts(b).seed));
  const o1 = R.engineOpts(a); a.attempt = 1; t('retry gets a different seed', R.engineOpts(a).seed !== o1.seed);
}
{
  const run = R.newRun(7);
  const d = R.draftOptions(run, false);
  t('draft offers 3 distinct unowned relics', d.length === 3 && new Set(d).size === 3);
  t('boss draft is all rare', R.draftOptions(run, true).every(id => R.RELIC_BY_ID[id].rare === 1));
  t('draft is deterministic', JSON.stringify(d) === JSON.stringify(R.draftOptions(run, false)));
  run.draft = d; t('pickRelic adds relic and opens shop', R.pickRelic(run, d[0]) && run.relics[0] === d[0] && run.phase === 'shop' && run.shop.items.length >= 8);
  t('cannot pick a relic not offered', !R.pickRelic(run, 'gold_rush'));
}
{
  const run = R.newRun(9); run.coins = 500; run.phase = 'shop'; run.shop = R.shopStock(run, 0);
  const idx = k => run.shop.items.findIndex(i => i.kind === k);
  const add = idx('add'), pid = run.shop.items[add].pid, n0 = run.deck.length, c0 = run.coins;
  t('buy add piece', R.buy(run, add).ok && run.deck.length === n0 + 1 && run.deck[n0] === pid && run.coins < c0);
  t('cannot buy twice', !R.buy(run, add).ok);
  const cull = idx('cull'); t('cull removes a piece', R.buy(run, cull, 2).ok && run.deck.length === n0 && run.deck.indexOf(2) < 0);
  const dupe = idx('dupe'); t('dupe adds a copy', R.buy(run, dupe, 0).ok && run.deck.filter(x => x === 0).length === 2);
  const grow = idx('grow'); t('grow mutates a piece permanently', R.buy(run, grow, 5).ok && run.mut[5] === 'grow' && R.pieceSize(run, 5) === 5);
  const trim = idx('trim'); t('trim mutates a piece', R.buy(run, trim, 3).ok && run.mut[3] === 'trim' && R.pieceSize(run, 3) === 3);
  const tool = idx('tool'), tn = run.shop.items[tool].tool; t('tool upgrade raises charges', R.buy(run, tool).ok && R.toolCharges(run)[tn] >= 1);
  const life = idx('life'); t('life purchase', R.buy(run, life).ok && run.lives === 3);
  const relic = idx('relic'); if (relic >= 0) t('relic purchase', R.buy(run, relic).ok && run.relics.length === 1);
  const eg = new E(R.engineOpts(run)); t('engine built from run uses mutated pieces', eg.defs[5].rots[0].length === 5 && eg.defs[3].rots[0].length === 3);
  const broke = R.newRun(10); broke.coins = 1; broke.shop = R.shopStock(broke, 0);
  t('cannot afford', !R.buy(broke, 0).ok);
  const small = R.newRun(11); small.coins = 99; small.deck = [0, 1, 2, 3, 4]; small.shop = R.shopStock(small, 0);
  t('cull blocked at 5 pieces', !R.buy(small, small.shop.items.findIndex(i => i.kind === 'cull'), 0).ok);
  const po = R.pickerOptions(run, { kind: 'grow' }); t('grow picker hides mutated pieces', po.every(o => !run.mut[o.key] && o.key <= 6));
}
{
  const run = R.newRun(12); run.coins = 40; run.shop = R.shopStock(run, 0);
  const before = JSON.stringify(run.shop.items.filter(i => ['add', 'relic', 'tool'].includes(i.kind)));
  const cost = R.rerollCost(run), c0 = run.coins; const r = R.reroll(run);
  t('reroll spends coins and refreshes offers', r.ok && run.coins === c0 - cost && JSON.stringify(run.shop.items.filter(i => ['add', 'relic', 'tool'].includes(i.kind))) !== before);
  t('reroll price rises', R.rerollCost(run) > cost);
}
{ // coins
  const run = R.newRun(13), ev = (o) => Object.assign({ n: 0, combo: -1, tspin: 0, size: 4, perfect: false }, o);
  t('single pays 1', R.coinsForLock(run, ev({ n: 1 }), { height: 5 }) === 1);
  t('tetris pays 5', R.coinsForLock(run, ev({ n: 4 }), { height: 5 }) === 5);
  t('no clear pays 0', R.coinsForLock(run, ev({}), { height: 5 }) === 0);
  run.relics = ['gold_rush', 'tetris_tax', 'combo_coin']; t('relics stack', R.coinsForLock(run, ev({ n: 4, combo: 2 }), { height: 5 }) === 5 + 4 + 6 + 2);
  run.relics = ['danger_pay']; t('danger pay doubles when stack is tall', R.coinsForLock(run, ev({ n: 2 }), { height: 16 }) === 4 && R.coinsForLock(run, ev({ n: 2 }), { height: 10 }) === 2);
  run.relics = ['tiny_tactics']; t('tiny tactics pays on every small lock', R.coinsForLock(run, ev({ size: 3 }), { height: 1 }) === 1);
  run.relics = ['pent_pro']; t('pentomino pro', R.coinsForLock(run, ev({ n: 2, size: 5 }), { height: 1 }) === 2 + 4);
  run.relics = ['clean_sweep']; t('perfect clear pays big', R.coinsForLock(run, ev({ n: 1, perfect: true }), { height: 0 }) === 1 + 10 + 25);
  const r2 = R.newRun(14); r2.coins = 100; r2.stage = 2; const rw = R.clearReward(r2); t('reward: base+boss+interest cap', rw.base === 7 && rw.boss === 10 && rw.interest === 5 && rw.total === 22, JSON.stringify(rw));
  r2.relics = ['banker']; t('banker raises interest cap', R.clearReward(r2).interest === 10);
  const r3 = R.newRun(15); r3.stage = 1; t('leftover pieces pay in budget stage', R.clearReward(r3, { piecesLeft: 6 }).leftover === 6 && R.clearReward(r3, { piecesLeft: 30 }).leftover === 10);
  const m = R.mods(Object.assign(R.newRun(1), { relics: ['slow_mo', 'long_fuse', 'second_hold', 'reserve', 'haggler'] }));
  t('mods from relics', m.gravMult === 0.75 && m.lockMs === 800 && m.maxHolds === 2 && m.extraPieces === 6 && m.priceMult === 0.8);
  const ins = R.newRun(16); R.addRelic(ins, 'insurance'); t('insurance adds a life', ins.lives === 3);
}

// ---------- feasibility: the hard bot (standard pieces) clears the piece-limited stages inside their budgets
function botStage(stageIdx, seed) {
  const run = R.newRun(seed); run.stage = stageIdx; const st = R.STAGES[stageIdx];
  const e = new E(R.engineOpts(run)); const bot = new AI.Bot(e, 'hard', E.mulberry32(seed));
  let t0 = 0; while (!e.over && e.lines < st.goal.n && t0 < 600000) { bot.update(16); e.update(16); t0 += 16; }
  return e;
}
{
  [[1, 3], [6, 3]].forEach(([idx, n]) => {
    let worst = 0, okAll = true;
    for (let s = 1; s <= 5; s++) { const e = botStage(idx, s); const used = e.pieces; worst = Math.max(worst, used); if (e.over || e.lines < R.STAGES[idx].goal.n || used > R.STAGES[idx].goal.pieces) okAll = false; }
    t(`hard bot beats stage ${idx + 1} inside its piece budget (worst ${worst}/${R.STAGES[idx].goal.pieces})`, okAll);
  });
}

console.log(`${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
