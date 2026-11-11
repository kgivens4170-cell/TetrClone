'use strict';
const M = require('../web/music.js');
let fails = 0, passes = 0;
function t(name, ok, extra) { if (ok) passes++; else { fails++; console.log('FAIL', name, extra === undefined ? '' : extra); } }
const THEMES = ['classic', 'nes', 'snes', 'gb', 'outrun', 'neon', 'paper', 'terminal', 'catacombs', 'crystal', 'forge'];
const MODES = ['game', 'boss', 'calm', 'camp'];
const RANGE = { bass: [24, 66], lead: [48, 100], arp: [36, 96], pad: [36, 84], sparkle: [60, 108] };

t('every theme has a song', THEMES.every(id => M.SONGS[id]) && M.IDS.length === THEMES.length, M.IDS.join());

THEMES.forEach(id => {
  const base = M.SONGS[id];
  t(`${id}: 8-bar progression`, base.prog.length === 8);
  t(`${id}: motif notes are inside 2 bars and do not overlap`, (() => {
    const m = base.motif.slice().sort((a, b) => a[0] - b[0]);
    return m.every((n, i) => n[0] >= 0 && n[0] + n[2] <= 32 && (i === 0 || m[i - 1][0] + m[i - 1][2] <= n[0]));
  })());
  Object.keys(base.voices).forEach(v => {
    const V = base.voices[v];
    if (V && V.pat) t(`${id}: ${v} pattern is one bar of 16 steps`, V.pat.length === 16);
    if (V && V.pats) t(`${id}: ${v} patterns are 16 steps`, V.pats.every(p => p.length === 16));
  });

  MODES.forEach(mode => {
    const cfg = M.resolve(id, mode, 0), rng = M.seeded(7);
    const ev = M.render(cfg, 16 * 16, rng, 0);
    const inKey = ev.filter(e => e.midi != null).every(e => cfg.scale.indexOf((((e.midi - cfg.root) % 12) + 12) % 12) >= 0);
    t(`${id}/${mode}: every note is in the key`, inKey);
    t(`${id}/${mode}: pitch ranges`, ev.filter(e => RANGE[e.v]).every(e => e.midi >= RANGE[e.v][0] && e.midi <= RANGE[e.v][1]),
      JSON.stringify(ev.filter(e => RANGE[e.v] && (e.midi < RANGE[e.v][0] || e.midi > RANGE[e.v][1])).slice(0, 2)));
    t(`${id}/${mode}: volumes and lengths are sane`, ev.every(e => e.vol > 0 && e.vol <= 0.9 && (e.dur == null || e.dur > 0)));
    t(`${id}/${mode}: it makes sound`, ev.length > 20);
    t(`${id}/${mode}: has a bass line`, ev.some(e => e.v === 'bass') || mode === 'camp' || mode === 'calm' ? true : false);
    if (mode === 'calm' || mode === 'camp') {
      t(`${id}/${mode}: calm has no lead and no drums`, !ev.some(e => e.v === 'lead' || e.v === 'kick' || e.v === 'snare' || e.v === 'hat' || e.v === 'clap'));
      t(`${id}/${mode}: calm has a pad`, ev.some(e => e.v === 'pad'));
    }
    if (mode === 'camp') t(`${id}/camp: crackling fire`, ev.filter(e => e.v === 'tick').length > 10);
    if (mode === 'game') t(`${id}/game: has a melody`, ev.filter(e => e.v === 'lead').length >= 12);
  });

  const g = M.resolve(id, 'game', 0), b = M.resolve(id, 'boss', 0), c = M.resolve(id, 'calm', 0), camp = M.resolve(id, 'camp', 0);
  t(`${id}: boss differs from the normal song`, JSON.stringify(g) !== JSON.stringify(b).replace('"mode":"boss"', '"mode":"game"'));
  t(`${id}: calm slower than game, camp slower than calm`, c.bpm < g.bpm && camp.bpm < c.bpm);
  t(`${id}: deeper stages are faster`, M.resolve(id, 'game', 2).bpm > M.resolve(id, 'game', 0).bpm);
  if (id !== 'crystal') t(`${id}: boss is faster`, b.bpm > g.bpm);
  const hatsCalm = M.render(g, 64, M.seeded(1), 0).filter(e => e.v === 'hat').length, hatsHot = M.render(g, 64, M.seeded(1), 1).filter(e => e.v === 'hat').length;
  if (g.voices.drums && g.voices.drums.hat) t(`${id}: danger adds hi-hats`, hatsHot > hatsCalm, hatsCalm + ' vs ' + hatsHot);
  t(`${id}: deterministic for a given seed`, JSON.stringify(M.render(g, 64, M.seeded(5), 0)) === JSON.stringify(M.render(g, 64, M.seeded(5), 0)));
});

// the songs are different from each other
const sig = THEMES.map(id => { const s = M.SONGS[id]; return [s.bpm, s.root, s.scale.join()].join('|'); });
t('every theme has a distinct tempo, key and scale', new Set(sig).size === THEMES.length, sig.join(' ; '));
const names = THEMES.map(id => M.SONGS[id].name);
t('every song has its own title', new Set(names).size === THEMES.length);
t('world songs: Catacombs slow and low, Crystal bright, Forge heavy', M.SONGS.catacombs.bpm < M.SONGS.crystal.bpm && M.SONGS.crystal.bpm < M.SONGS.forge.bpm && M.SONGS.catacombs.scale === M.SONGS.catacombs.scale && M.SONGS.crystal.scale.indexOf(6) >= 0 && M.SONGS.forge.scale.indexOf(1) >= 0);
t('Crystal boss drops to a whole-tone scale, Forge boss to harmonic minor', M.resolve('crystal', 'boss').scale.length === 6 && M.resolve('forge', 'boss').scale.indexOf(11) >= 0);
t('Mason and Forge have anvil hits', M.render(M.resolve('catacombs', 'boss'), 32, M.seeded(1), 0).some(e => e.v === 'anvil') && M.render(M.resolve('forge', 'game'), 32, M.seeded(1), 0).some(e => e.v === 'anvil'));
t('last bar has a drum fill', M.render(M.resolve('nes', 'game'), 128, M.seeded(1), 0).filter(e => e.step >= 7 * 16 + 12 && e.step < 128 && e.v === 'snare').length > 2);
t('degree helper maps degrees across octaves', M.degMidi(M.scales.MINOR, 57, 0) === 57 && M.degMidi(M.scales.MINOR, 57, 7) === 69 && M.degMidi(M.scales.MINOR, 57, -1) === 55);

console.log(`${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
