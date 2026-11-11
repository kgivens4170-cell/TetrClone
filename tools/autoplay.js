// Plays Marathon through real taps, drags and flicks and reports misreads. Usage: node tools/autoplay.js [mouse|touch] [pieces] [fastPieces] [jitterPx]
// Needs Playwright. Not part of the game.
const { chromium } = require('playwright');
const mode = process.argv[2] || 'mouse', N1 = +(process.argv[3] || 60), N2 = +(process.argv[4] || 40), jit = +(process.argv[5] || 3);
const rnd = (a) => (Math.random() * 2 - 1) * a;
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 400, height: 800 }, deviceScaleFactor: 2, hasTouch: true });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + require('path').resolve(__dirname, '../web/index.html') + '');
  await p.click('[data-mode=marathon]'); await p.waitForTimeout(3100);
  const cdp = await ctx.newCDPSession(p);
  const geo = () => p.evaluate(() => { const c = document.getElementById('board'), r = c.getBoundingClientRect(); return { l: r.left + c.clientLeft, t: r.top + c.clientTop, w: c.clientWidth, h: c.clientHeight, cell: TetrApp.S.cell }; });
  const st = () => p.evaluate(() => { const P = TetrApp.S.P; return { px: P.px, py: P.py, rot: P.rot, pieces: P.pieces, hold: P.hold, over: P.over, lines: P.lines, piece: P.piece, serial: P.serial }; });
  async function down(x, y) { if (mode === 'touch') await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] }); else { await p.mouse.move(x, y); await p.mouse.down(); } }
  async function move(x, y) { if (mode === 'touch') await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y, id: 1 }] }); else await p.mouse.move(x, y); }
  async function up() { if (mode === 'touch') await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); else await p.mouse.up(); }
  async function tap(x, y) { await down(x, y); await p.waitForTimeout(40 + Math.random() * 60); await up(); await p.waitForTimeout(25); }
  const stats = { pieces: 0, rotateWrongDir: 0, rotateMiss: 0, dragMiss: 0, dragOverUnder: [], accidentalDrop: 0, flickMiss: 0, landedWrong: 0, lines: 0, gameOver: false, ms: [] };
  async function playPiece(fast) {
    const g = await geo(); let s = await st(); if (s.over) { stats.gameOver = true; return false; }
    const plan = await p.evaluate(() => { const P = TetrApp.S.P, L = TetrAI.placements(P.board, P.piece); L.sort((a, b) => b.score - a.score); const t = L[0]; return t ? { r: t.r, x: t.x, board: t.board.map(r => r.map(v => v ? 1 : 0)) } : null; });
    if (!plan) return false;
    const t0 = Date.now(), serial = s.serial;
    // rotate: taps on the left half turn left, right half turn right
    const need = plan.r, ccw = need === 3, taps = ccw ? 1 : need;
    for (let i = 0; i < taps; i++) {
      const before = (await st()).rot;
      const x = g.l + g.w * (ccw ? 0.25 : 0.75) + rnd(jit * 4), y = g.t + g.h * (0.3 + Math.random() * 0.3);
      await tap(x, y);
      const after = (await st()).rot, want = (before + (ccw ? 3 : 1)) % 4;
      if (after !== want) { if (after === (before + (ccw ? 1 : 3)) % 4) stats.rotateWrongDir++; else stats.rotateMiss++; }
    }
    s = await st(); if (s.serial !== serial) { stats.landedWrong++; return true; }
    // drag horizontally to the target column
    const dx = plan.x - s.px;
    if (dx !== 0) {
      const sx = g.l + g.w / 2 + rnd(jit * 3), sy = g.t + g.h * 0.35, target = sx + dx * g.cell;
      await down(sx, sy); const steps = 6 + Math.abs(dx);
      for (let i = 1; i <= steps; i++) { await move(sx + (target - sx) * i / steps + rnd(jit * 0.5), sy + rnd(jit)); await p.waitForTimeout(14); }
      await up();
      const a = await st();
      if (a.serial === serial && a.px !== plan.x) { stats.dragMiss++; stats.dragOverUnder.push(a.px - plan.x); }
      if (a.serial !== serial) stats.accidentalDrop++;
    }
    // flick down to drop
    s = await st();
    if (s.serial === serial) {
      const sx = g.l + g.w / 2 + rnd(jit * 3), sy = g.t + g.h * 0.2, ey = sy + g.cell * 4.2;
      await down(sx, sy); for (let i = 1; i <= 4; i++) { await move(sx + rnd(jit), sy + (ey - sy) * i / 4); await p.waitForTimeout(10); } await up();
      await p.waitForTimeout(60);
      const f = await st(); if (f.serial === serial) { stats.flickMiss++; await p.keyboard.press('Space'); }
    }
    const board = await p.evaluate(() => TetrApp.S.P.board.map(r => r.map(v => v ? 1 : 0)));
    if (JSON.stringify(board) !== JSON.stringify(plan.board)) stats.landedWrong++;
    stats.pieces++; stats.ms.push(Date.now() - t0); return true;
  }
  for (let i = 0; i < N1; i++) if (!(await playPiece(false))) break;
  const mid = await st();
  await p.evaluate(() => { const P = TetrApp.S.P; P.fixedLevel = true; P.level = 12; });
  const before2 = { ...stats, ms: [] };
  for (let i = 0; i < N2; i++) if (!(await playPiece(true))) break;
  const fin = await st();
  stats.lines = fin.lines; stats.avgMs = Math.round(stats.ms.reduce((a, b) => a + b, 0) / Math.max(1, stats.ms.length)); delete stats.ms;
  console.log(JSON.stringify({ mode, jitter: jit, stats, finalLines: fin.lines, over: fin.over, errs }));
  await p.screenshot({ path: 'play-end.png' });
  await b.close();
})();
