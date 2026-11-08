'use strict';
const E = require('../web/engine.js');
const AI = require('../web/ai.js');
let fails = 0, passes = 0;
function t(name, ok, extra) { if (ok) passes++; else { fails++; console.log('FAIL', name, extra === undefined ? '' : extra); } }
function eng(seed) { return new E({ seed: seed == null ? 1 : seed }); }
function clearBoard(e) { e.board = e.board.map(() => new Array(E.COLS).fill(0)); }
function put(e, piece, rot, x, y) { e.setPiece(piece); e.rot = rot; e.px = x; e.py = y; e.lastRot = false; e.lowest = y; e.lockTimer = 0; e.resets = 0; }
function fillRow(e, y, holes) { for (let x = 0; x < E.COLS; x++) e.board[y][x] = holes.includes(x) ? 0 : 1; }
const B = E.H - 1; // bottom row index

// --- shapes: 4 distinct cells inside the 4x4 box for every piece and rotation
for (let p = 0; p < 7; p++) for (let r = 0; r < 4; r++) {
  const c = E.SHAPES[p][r]; const s = new Set(c.map(a => a.join(',')));
  t(`shape ${p}/${r} valid`, s.size === 4 && c.every(a => a[0] >= 0 && a[0] < 4 && a[1] >= 0 && a[1] < 4));
}
// SRS orientation spot checks (y down): I rotated once is a vertical bar in column 2; T rotated once points right.
t('I rot R vertical col 2', E.SHAPES[0][1].every(c => c[0] === 2));
t('T rot R nub at (2,1)', E.SHAPES[2][1].some(c => c[0] === 2 && c[1] === 1) && !E.SHAPES[2][1].some(c => c[0] === 0));

// --- 7-bag: every 7 consecutive pieces from the stream are distinct
{
  const e = eng(7), seq = [e.piece].concat(e.queue); for (let i = 0; i < 20; i++) { e.hardDrop(); if (e.over) break; }
  const e2 = eng(7); const all = [e2.piece]; for (let i = 0; i < 28; i++) { all.push(e2.queue[0]); e2.spawn(); }
  let ok = true; for (let b = 0; b < 4; b++) if (new Set(all.slice(b * 7, b * 7 + 7)).size !== 7) ok = false;
  t('7-bag windows distinct', ok, all.join(''));
}
// --- seeded determinism
{ const a = eng(42), b = eng(42); t('same seed same pieces', a.piece === b.piece && a.queue.join() === b.queue.join()); }

// --- movement and walls
{ const e = eng(2); for (let i = 0; i < 12; i++) e.move(-1); t('left wall stops', !e.move(-1)); }

// --- hard drop and line clear scoring
{
  const e = eng(3); clearBoard(e); fillRow(e, B, [3, 4, 5, 6]); put(e, 0, 0, 3, B - 1);
  e.score = 0; e.hardDrop(); // I flat into the 4-wide gap: bottom row is y+1 of box
  t('I fills gap clears 1 line', e.lines === 1, e.lines);
  t('single scored 100 + drop', e.score >= 100);
}
{ // tetris
  const e = eng(4); clearBoard(e);
  for (let y = B - 3; y <= B; y++) fillRow(e, y, [9]);
  put(e, 0, 1, 7, B - 3 - 0); // vertical I in column 9 (box x=7 + 2)
  e.score = 0; e.hardDrop();
  t('tetris clears 4', e.lines === 4 && e.stats.tetrises === 1, e.lines);
  t('tetris score 800 at level 1', e.score >= 800, e.score);
}
// --- back-to-back bonus
{
  const e = eng(5); clearBoard(e); e.b2b = 1; e.board[B - 8][0] = 1; // stray block avoids a perfect clear
  for (let y = B - 3; y <= B; y++) fillRow(e, y, [9]);
  put(e, 0, 1, 7, B - 3); e.score = 0; e.hardDrop();
  t('b2b tetris x1.5 = 1200', e.score >= 1200 && e.score < 1300, e.score);
}
// --- combo
{
  const e = eng(6); clearBoard(e); fillRow(e, B, [3, 4, 5, 6]); put(e, 0, 0, 3, B - 1); e.hardDrop();
  t('combo counter 0 after first clear', e.combo === 0);
  clearBoard(e); fillRow(e, B, [3, 4, 5, 6]); put(e, 0, 0, 3, B - 1); e.hardDrop();
  t('combo counter 1 after second', e.combo === 1);
  e.hardDrop(); // no clear
  t('combo resets', e.combo === -1);
}
// --- perfect clear
{
  const e = eng(8); clearBoard(e); fillRow(e, B, [3, 4, 5, 6]); put(e, 0, 0, 3, B - 1); e.hardDrop();
  t('perfect clear flagged', e.stats.perfect === 1);
}
// --- T-spin: classic T-spin double setup ("TSD") via wall-kick
{
  const e = eng(9); clearBoard(e);
  // Slot: rows B-1 and B filled except a T-shaped notch at columns 3..5
  fillRow(e, B, [4]); fillRow(e, B - 1, [3, 4]);
  e.board[B - 2][3] = 1; e.board[B - 2][5] = 0; // overhang left of slot
  // T pointing down into the hole at col 4: rotation state 2, box x=3, y=B-2 -> cells (3..5,B-1) + (4,B)
  put(e, 2, 3, 3, B - 2); // start one rotation before (L) then rotate cw into state 0? Use state 2 directly with rot flag
  e.rot = 2; e.px = 3; e.py = B - 2; e.lastRot = true; e.lastKick = 0;
  // Check geometry only: corner test
  const kind = e.tspinKind();
  t('t-spin detected when 3 corners filled', kind >= 1, kind);
  e.stats.tspins = 0; e.hardDrop();
  t('t-spin clears lines', e.lines >= 1, e.lines);
}
{ // not a spin if last move was not a rotation
  const e = eng(10); clearBoard(e); e.board[B][3] = 1; e.board[B][5] = 1; e.board[B - 2][3] = 1;
  put(e, 2, 2, 3, B - 2); e.lastRot = false; t('no spin without rotation', e.tspinKind() === 0);
}
// --- hold
{
  const e = eng(11), first = e.piece, nextP = e.queue[0];
  t('hold swaps with queue', e.doHold() && e.hold === first && e.piece === nextP);
  t('cannot hold twice', !e.doHold());
  e.hardDrop(); t('hold available after lock', e.canHold);
}
// --- lock delay: piece stays alive for 500 ms on the ground, then locks
{
  const e = eng(12); while (e.softDrop()) { }
  const p = e.pieces; e.update(300); t('still active at 300ms', e.pieces === p);
  e.update(300); t('locked after 500ms', e.pieces === p + 1);
}
// --- lock delay reset cap (infinity limit): 15 resets then lock
{
  const e = eng(13); while (e.softDrop()) { }
  const p = e.pieces; let wiggles = 0;
  for (let i = 0; i < 60 && e.pieces === p; i++) { e.update(400); if (e.pieces !== p) break; if (!e.move(i % 2 ? 1 : -1)) e.move(i % 2 ? -1 : 1); wiggles++; }
  t('infinite spin is capped', e.pieces === p + 1 && wiggles <= 20, wiggles);
}
// --- gravity gets faster with level
{ const e = eng(14); const g1 = e.gravityMs(); e.level = 10; t('gravity speeds up', e.gravityMs() < g1 / 5, g1 + ' ' + e.gravityMs()); }
// --- level up each 10 lines
{
  const e = eng(15); for (let i = 0; i < 10; i++) { clearBoard(e); fillRow(e, B, [3, 4, 5, 6]); put(e, 0, 0, 3, B - 1); e.hardDrop(); }
  t('level 2 after 10 lines', e.lines === 10 && e.level === 2, e.level);
}
// --- garbage: cancel, then arrive when a piece locks with no clear
{
  const e = eng(16); clearBoard(e); e.receiveGarbage(3);
  e.hardDrop(); // no clear -> 3 garbage rows rise
  let g = 0; for (let y = 0; y < E.H; y++) if (e.board[y].includes(99)) g++;
  t('3 garbage rows added', g === 3, g);
  t('garbage rows have exactly one hole', e.board.filter(r => r.includes(99)).every(r => r.filter(v => v === 0).length === 1));
  const f = eng(17); clearBoard(f); f.board[B - 8][0] = 1; f.receiveGarbage(2);
  for (let y = B - 3; y <= B; y++) fillRow(f, y, [9]);
  put(f, 0, 1, 7, B - 3); f.hardDrop();   // tetris = 4 attack: cancels 2 incoming, sends 2
  t('attack cancels incoming garbage', f.pending === 0 && f.attackSent === 2, f.pending + '/' + f.attackSent);
}
// --- top out
{ const e = eng(18); for (let i = 0; i < 60 && !e.over; i++) e.hardDrop(); t('stacking ends the game', e.over); }

// --- AI: places sensible pieces; hard bot survives and clears lines
function simulate(level, seed, pieces) {
  const e = new E({ seed, fixedLevel: true }); const rng = E.mulberry32(seed + 1);
  const bot = new AI.Bot(e, level, rng); let t = 0;
  while (!e.over && e.pieces < pieces && t < 3600000) { bot.update(16); e.update(16); t += 16; }
  return e;
}
{
  const hard = simulate('hard', 1, 300);
  t('hard bot survives 300 pieces', !hard.over, 'over after ' + hard.pieces);
  t('hard bot clears lines', hard.lines > 90, hard.lines);
  const med = simulate('medium', 2, 200);
  t('medium bot survives 200 pieces', !med.over, 'over after ' + med.pieces);
  const easy = simulate('easy', 3, 100);
  t('easy bot plays and clears some lines', easy.lines > 15, easy.lines + ' over=' + easy.over);
  console.log(`bots: hard ${hard.lines} lines, medium ${med.lines}, easy ${easy.lines} (${easy.pieces} pieces, over=${easy.over})`);
}

console.log(`${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
