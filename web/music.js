/* TetrClone music: original songs written as data and synthesized live with WebAudio (no audio files).
   The pure part (SONGS, resolve, stepEvents, render) has no audio and is unit tested; the second half plays it. */
(function (root) {
  'use strict';

  var MINOR = [0, 2, 3, 5, 7, 8, 10], DORIAN = [0, 2, 3, 5, 7, 9, 10], LYDIAN = [0, 2, 4, 6, 7, 9, 11], PHRYG = [0, 1, 3, 5, 7, 8, 10],
      MAJOR = [0, 2, 4, 5, 7, 9, 11], HARM = [0, 2, 3, 5, 7, 8, 11], WHOLE = [0, 2, 4, 6, 8, 10];

  /** '1..1..2.' -> [1,0,0,1,0,0,2,0] (digits are voice codes) */
  function pat(s) { return s.split('').map(function (ch) { return ch === '.' ? 0 : parseInt(ch, 10); }); }
  /** 'x...x...' -> [0,4] */
  function hits(s) { var o = []; for (var i = 0; i < s.length; i++) if (s[i] === 'x') o.push(i); return o; }
  function degMidi(scale, rootMidi, deg) {
    var n = scale.length, o = Math.floor(deg / n), i = ((deg % n) + n) % n;
    return rootMidi + scale[i] + 12 * o;
  }

  // ------------------------------------------------------------------------------------------------------------
  // A song: bpm, root (MIDI), scale, prog (8 bars of chord-root scale degrees), motif ([step, degree, steps] over 2 bars, degrees
  // relative to the bar's chord root, so melody notes follow the chords), and voices. boss overrides merge over the base song.
  var SONGS = {
    classic: { name: 'Late Shift', bpm: 84, root: 55, scale: DORIAN, prog: [0, 3, 0, 4, 0, 3, 5, 4],
      motif: [[0, 4, 4], [6, 2, 2], [8, 0, 4], [14, 2, 2], [16, 4, 3], [20, 2, 2], [22, 0, 2], [24, 1, 6]],
      voices: { lead: { wave: 'sine', vol: 0.13, oct: 1, vib: true }, arp: { wave: 'triangle', vol: 0.07, oct: 1, pat: pat('1.3.2.4.3.2.3.1.') },
                bass: { wave: 'sine', vol: 0.26, pat: pat('1.....2.1.......') }, pad: { wave: 'triangle', vol: 0.09, attack: 0.3 },
                drums: { kick: hits('x.......x.......'), kickVol: 0.4, hat: hits('..x...x...x...x.'), hatVol: 0.25 } },
      boss: { bpm: 100 } },

    nes: { name: 'Dome Lights', bpm: 150, root: 57, scale: MINOR, prog: [0, 0, 5, 5, 3, 3, 4, 0],
      motif: [[0, 4, 2], [2, 2, 1], [3, 4, 1], [4, 5, 2], [6, 4, 2], [8, 2, 2], [10, 0, 2], [12, 2, 2], [14, 4, 2],
              [16, 5, 2], [18, 4, 1], [19, 2, 1], [20, 4, 2], [22, 2, 2], [24, 0, 4], [28, -1, 2], [30, 0, 2]],
      voices: { lead: { wave: 'p25', vol: 0.15, oct: 1 }, arp: { wave: 'p125', vol: 0.07, oct: 1, pat: pat('1.2.3.2.1.2.3.4.') },
                bass: { wave: 'triangle', vol: 0.3, pat: pat('1.1.2.1.1.1.2.3.') },
                drums: { kick: hits('x.......x.......'), snare: hits('....x.......x...'), hat: hits('..x...x...x...x.'), kickVol: 0.7, snareVol: 0.35, hatVol: 0.3 } },
      boss: { bpm: 168, voices: { drums: { kick: hits('x...x...x...x...'), hat: hits('x.x.x.x.x.x.x.x.') } } } },

    snes: { name: 'Dusk Rider', bpm: 98, root: 52, scale: DORIAN, prog: [0, 3, 5, 4, 0, 3, 6, 4], echo: true,
      motif: [[0, 2, 3], [3, 4, 3], [6, 5, 2], [8, 4, 4], [12, 2, 2], [14, 1, 2], [16, 0, 4], [20, 2, 2], [22, 4, 2], [24, 6, 4], [28, 4, 4]],
      voices: { lead: { wave: 'triangle', vol: 0.17, oct: 1, vib: true }, arp: { wave: 'sine', vol: 0.09, oct: 1, pluck: true, decay: 0.45, pat: pat('1.2.3.4.3.2.3.4.'), send: true },
                bass: { wave: 'triangle', vol: 0.28, pat: pat('1..1..2.1..1..3.') }, pad: { wave: 'sine', vol: 0.09, attack: 0.25 },
                sparkle: { p: 0.05, wave: 'sine', vol: 0.05, oct: 2, decay: 0.9, set: [0, 2, 4, 6] },
                drums: { kick: hits('x.......x.......'), snare: hits('....x.......x...'), hat: hits('..x...x...x...x.'), kickVol: 0.55, snareVol: 0.25, hatVol: 0.2 } },
      boss: { bpm: 112 } },

    gb: { name: 'Pocket Hop', bpm: 136, root: 60, scale: MAJOR, prog: [0, 4, 5, 3, 0, 4, 3, 0],
      motif: [[0, 2, 1], [1, 4, 1], [2, 2, 1], [4, 0, 2], [6, 2, 1], [7, 4, 1], [8, 5, 2], [10, 4, 2], [12, 2, 2], [14, 0, 2],
              [16, 4, 2], [18, 2, 1], [19, 0, 1], [20, 2, 2], [22, 4, 2], [24, 5, 2], [26, 6, 2], [28, 4, 4]],
      voices: { lead: { wave: 'p50', vol: 0.14, oct: 1 }, arp: { wave: 'p25', vol: 0.07, oct: 1, pat: pat('1.2.3.2.1.2.3.4.') },
                bass: { wave: 'triangle', vol: 0.3, oct: -2, pat: pat('1.1.2.1.1.1.2.1.') },
                drums: { kick: hits('x.......x.......'), snare: hits('....x.......x...'), hat: hits('x.x.x.x.x.x.x.x.'), kickVol: 0.5, snareVol: 0.25, hatVol: 0.16 } },
      boss: { bpm: 150 } },

    outrun: { name: 'Neon Drive', bpm: 108, root: 45, scale: MINOR, prog: [0, 5, 2, 4, 0, 5, 3, 4], echo: true,
      motif: [[0, 4, 4], [4, 2, 2], [6, 4, 2], [8, 5, 4], [12, 4, 2], [14, 2, 2], [16, 0, 4], [20, 2, 2], [22, 4, 2], [24, 6, 6], [30, 4, 2]],
      voices: { lead: { wave: 'sawtooth', vol: 0.11, oct: 2, unison: true, send: true }, arp: { wave: 'square', vol: 0.07, oct: 1, pat: pat('1.3.4.3.1.3.4.3.'), send: true },
                bass: { wave: 'sawtooth', vol: 0.2, pat: pat('1131113111311131') }, pad: { wave: 'sawtooth', vol: 0.045, attack: 0.35, oct: 1 },
                drums: { kick: hits('x...x...x...x...'), snare: hits('....x.......x...'), clap: true, hat: hits('..x...x...x...x.'), kickVol: 0.75, snareVol: 0.4, hatVol: 0.22 } },
      boss: { bpm: 120 } },

    neon: { name: 'Pink Static', bpm: 126, root: 50, scale: MINOR, prog: [0, 3, 4, 0, 0, 3, 4, 6], echo: true,
      motif: [[0, 2, 2], [2, 4, 2], [4, 5, 2], [6, 4, 2], [8, 2, 4], [12, 0, 4], [16, 4, 2], [18, 5, 2], [20, 6, 2], [22, 5, 2], [24, 4, 6], [30, 2, 2]],
      voices: { lead: { wave: 'p25', vol: 0.12, oct: 2, send: true }, arp: { wave: 'sawtooth', vol: 0.06, oct: 1, pat: pat('1.2.3.4.3.2.3.1.'), send: true },
                bass: { wave: 'sawtooth', vol: 0.2, pat: pat('1.1.1.1.2.2.2.3.') },
                drums: { kick: hits('x...x...x...x...'), snare: hits('....x.......x...'), clap: true, hat: hits('x.x.x.x.x.x.x.x.'), kickVol: 0.7, snareVol: 0.38, hatVol: 0.14 } },
      boss: { bpm: 140 } },

    paper: { name: 'Quiet Ink', bpm: 88, root: 60, scale: MAJOR, prog: [0, 5, 3, 4, 0, 5, 3, 4],
      motif: [[0, 4, 3], [4, 2, 2], [6, 0, 2], [8, 2, 4], [12, 4, 2], [14, 5, 2], [16, 4, 4], [20, 2, 4], [24, 1, 4], [28, 0, 4]],
      voices: { lead: { wave: 'triangle', vol: 0.14, oct: 1, pluck: true, decay: 0.5 }, arp: { wave: 'triangle', vol: 0.07, oct: 1, pluck: true, decay: 0.3, pat: pat('1.3.2.3.1.4.2.3.') },
                bass: { wave: 'sine', vol: 0.26, oct: -2, pat: pat('1.......2.......') }, pad: { wave: 'sine', vol: 0.06, attack: 0.3 } },
      boss: { bpm: 100 } },

    terminal: { name: 'Green Phosphor', bpm: 118, root: 52, scale: MINOR, prog: [0, 0, 5, 5, 3, 3, 4, 4],
      motif: [[0, 4, 1], [2, 4, 1], [4, 2, 2], [8, 4, 1], [10, 5, 1], [12, 4, 2], [16, 2, 1], [18, 2, 1], [20, 0, 2], [24, 2, 4], [28, 1, 2], [30, 0, 2]],
      voices: { lead: { wave: 'p125', vol: 0.1, oct: 1 }, arp: { wave: 'p125', vol: 0.07, oct: 1, pat: pat('1.3.1.4.1.3.1.4.') },
                bass: { wave: 'square', vol: 0.16, pat: pat('1.1.1.1.2.2.1.1.') },
                drums: { kick: hits('x...x...x...x...'), hat: hits('..x...x...x...x.'), kickVol: 0.6, hatVol: 0.2 } },
      boss: { bpm: 134 } },

    // ---- the Roguelike worlds
    catacombs: { name: 'Bone Hall', bpm: 70, root: 50, scale: PHRYG, prog: [0, 0, 1, 0, 5, 5, 1, 0],
      motif: [[0, 0, 6], [8, 2, 4], [12, 1, 4], [16, 0, 6], [24, -1, 4], [28, 0, 4]],
      voices: { lead: { wave: 'sine', vol: 0.15, oct: 1, vib: true }, bass: { wave: 'triangle', vol: 0.3, pats: [pat('1.......1.......'), pat('1.......2.......')] },
                pad: { wave: 'triangle', vol: 0.11, attack: 0.5 }, arp: { wave: 'triangle', vol: 0.05, oct: 1, pluck: true, decay: 0.4, pat: pat('..1.....3.......') },
                sparkle: { p: 0.1, wave: 'sine', vol: 0.06, oct: 3, decay: 0.5, set: [0, 2, 4, 6] },
                drums: { kick: hits('x.......x.......'), kickVol: 0.5 } },
      boss: { bpm: 96, voices: { lead: { wave: 'sawtooth', vol: 0.09, oct: 1 }, bass: { wave: 'sawtooth', vol: 0.2, pats: [pat('1.1.1.1.2.2.1.1.')] },
              drums: { kick: hits('x...x...x...x...'), snare: hits('....x.......x...'), anvil: hits('..x.......x.....'), hat: hits('x.x.x.x.x.x.x.x.'), snareVol: 0.45, hatVol: 0.12 } } } },

    crystal: { name: 'Glass Halls', bpm: 88, root: 57, scale: LYDIAN, prog: [0, 4, 1, 4, 0, 5, 1, 4], echo: true,
      motif: [[0, 4, 4], [6, 6, 2], [8, 4, 4], [14, 2, 2], [16, 0, 4], [22, 2, 2], [24, 4, 6]],
      voices: { lead: { wave: 'sine', vol: 0.11, oct: 2, pluck: true, decay: 0.9, send: true }, arp: { wave: 'sine', vol: 0.09, oct: 1, pluck: true, decay: 0.55, pat: pat('1.3.4.3.2.4.3.4.'), send: true },
                bass: { wave: 'sine', vol: 0.24, pat: pat('1.......2.......') }, pad: { wave: 'sine', vol: 0.11, attack: 0.4 },
                sparkle: { p: 0.14, wave: 'sine', vol: 0.06, oct: 2, decay: 1.2, set: [0, 1, 4, 5], send: true },
                drums: { hat: hits('x.x.x.x.x.x.x.x.'), hatVol: 0.07 } },
      boss: { bpm: 78, scale: WHOLE, voices: { arp: { pat: pat('1.3.1.3.2.3.1.3.'), oct: 0 }, bass: { wave: 'triangle', vol: 0.3, pat: pat('1.1.....1.......') },
              sparkle: { p: 0.1, oct: 2, set: [0, 3, 5] }, lead: { wave: 'triangle', vol: 0.12, oct: 1, pluck: false, vib: true } } } },

    forge: { name: 'Anvil Chorus', bpm: 112, root: 40, scale: PHRYG, prog: [0, 0, 1, 0, 5, 4, 1, 0],
      motif: [[0, 0, 2], [2, 1, 2], [4, 0, 2], [6, 2, 2], [8, 4, 4], [12, 3, 2], [14, 1, 2], [16, 0, 2], [18, 1, 2], [20, 2, 2], [22, 3, 2], [24, 4, 2], [26, 3, 2], [28, 1, 2], [30, 0, 2]],
      voices: { lead: { wave: 'p25', vol: 0.13, oct: 2 }, arp: { wave: 'p125', vol: 0.06, oct: 2, pat: pat('1.3.1.4.1.3.2.4.') },
                bass: { wave: 'sawtooth', vol: 0.24, pat: pat('1.1.1.1.2.2.1.1.') },
                drums: { kick: hits('x...x...x...x...'), snare: hits('....x.......x...'), anvil: hits('..x.......x.....'), hat: hits('..x...x...x...x.'), kickVol: 0.8, snareVol: 0.4, hatVol: 0.2 } },
      boss: { bpm: 132, scale: HARM, voices: { arp: { pat: pat('1342134213421342'), oct: 2 }, lead: { wave: 'sawtooth', vol: 0.1, oct: 2 },
              drums: { hat: hits('xxxxxxxxxxxxxxxx'), hatVol: 0.1 } } } }
  };
  var IDS = Object.keys(SONGS);

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function merge(t, s) {
    Object.keys(s).forEach(function (k) {
      if (s[k] && typeof s[k] === 'object' && !Array.isArray(s[k]) && t[k] && typeof t[k] === 'object' && !Array.isArray(t[k])) merge(t[k], s[k]);
      else t[k] = s[k];
    });
    return t;
  }

  /** mode: 'game' | 'boss' | 'calm' | 'camp'.  depth 0-2 nudges the tempo (deeper is faster). */
  function resolve(id, mode, depth) {
    var base = SONGS[id] || SONGS.classic, cfg = clone(base); cfg.id = id; cfg.mode = mode || 'game';
    var boss = cfg.boss; delete cfg.boss;
    if (mode === 'boss' && boss) merge(cfg, boss);
    if (mode === 'calm' || mode === 'camp') {
      cfg.bpm *= mode === 'camp' ? 0.62 : 0.8;
      cfg.voices.lead = null; cfg.voices.drums = null;
      if (!cfg.voices.pad) cfg.voices.pad = { wave: 'triangle', vol: 0.1, attack: 0.3 };
      if (!cfg.voices.sparkle) cfg.voices.sparkle = { p: 0.05, wave: 'sine', vol: 0.045, oct: 2, decay: 0.8, set: [0, 2, 4] };
      if (mode === 'camp') { cfg.voices.crackle = true; if (cfg.voices.arp) cfg.voices.arp.every = 2; }
    } else cfg.bpm *= [0.94, 1, 1.07][depth || 0] || 1;
    return cfg;
  }

  function noteSteps(p, s) { for (var j = 1; j <= 4; j++) if (p[(s + j) % 16]) return j; return 4; }
  function has(arr, s) { return arr && arr.indexOf(s) >= 0; }

  /** All notes and hits starting on one 16th-note step. Pure; rand supplies the random sparkles. */
  function stepEvents(cfg, step, rand, inten) {
    var ev = [], s = step % 16, bar = Math.floor(step / 16) % cfg.prog.length, croot = cfg.prog[bar], V = cfg.voices, chord = [croot, croot + 2, croot + 4, croot + 7];
    function M(deg, oct) { return degMidi(cfg.scale, cfg.root, deg) + 12 * oct; }
    if (V.pad && s === 0) for (var k = 0; k < 3; k++) ev.push({ v: 'pad', midi: M(chord[k], V.pad.oct || 0), dur: 16, wave: V.pad.wave, vol: V.pad.vol, attack: V.pad.attack || 0.2 });
    if (V.bass) {
      var bp = V.bass.pats ? V.bass.pats[bar % V.bass.pats.length] : V.bass.pat, code = bp[s];
      if (code) ev.push({ v: 'bass', midi: M(croot + (code === 2 ? 4 : 0), (V.bass.oct != null ? V.bass.oct : -1) + (code === 3 ? 1 : 0)), dur: noteSteps(bp, s), wave: V.bass.wave, vol: V.bass.vol });
    }
    if (V.arp) {
      var idx = V.arp.pat[s], skip = V.arp.every ? (s % (2 * V.arp.every)) !== 0 : false;
      if (idx && !skip) ev.push({ v: 'arp', midi: M(chord[idx - 1], V.arp.oct != null ? V.arp.oct : 1), dur: 1.5, wave: V.arp.wave, vol: V.arp.vol, pluck: V.arp.pluck, decay: V.arp.decay, send: V.arp.send });
    }
    if (V.lead) {
      var ms = (bar % 2) * 16 + s;
      cfg.motif.forEach(function (n) { if (n[0] === ms) ev.push({ v: 'lead', midi: M(croot + n[1], V.lead.oct != null ? V.lead.oct : 1), dur: n[2], wave: V.lead.wave, vol: V.lead.vol, vib: V.lead.vib, pluck: V.lead.pluck, decay: V.lead.decay, unison: V.lead.unison, send: V.lead.send }); });
    }
    if (V.drums) {
      var D = V.drums;
      if (has(D.kick, s)) ev.push({ v: 'kick', vol: D.kickVol || 0.7 });
      if (has(D.snare, s)) ev.push({ v: D.clap ? 'clap' : 'snare', vol: D.snareVol || 0.4 });
      if (has(D.hat, s)) ev.push({ v: 'hat', vol: D.hatVol || 0.2 });
      else if (inten > 0.55 && D.hat && s % 2 === 1) ev.push({ v: 'hat', vol: (D.hatVol || 0.2) * 0.6 });
      if (has(D.anvil, s)) ev.push({ v: 'anvil', vol: 0.5 });
      if (bar === cfg.prog.length - 1 && s >= 12 && D.snare) ev.push({ v: D.clap ? 'clap' : 'snare', vol: 0.3 });
    }
    if (V.sparkle && rand() < V.sparkle.p) {
      var set = V.sparkle.set;
      ev.push({ v: 'sparkle', midi: M(croot + set[Math.floor(rand() * set.length)], V.sparkle.oct != null ? V.sparkle.oct : 2), dur: 6, wave: V.sparkle.wave, vol: V.sparkle.vol, pluck: true, decay: V.sparkle.decay || 0.8, send: V.sparkle.send });
    }
    if (V.crackle && rand() < 0.3) ev.push({ v: 'tick', vol: 0.015 + rand() * 0.02 });
    return ev;
  }
  /** Every event for the first `steps` steps, tagged with the step number (used by tests and offline rendering). */
  function render(cfg, steps, rand, inten) {
    var out = [];
    for (var st = 0; st < steps; st++) stepEvents(cfg, st, rand, inten || 0).forEach(function (e) { e.step = st; out.push(e); });
    return out;
  }
  function stepSeconds(cfg, inten) { return 60 / (cfg.bpm * (1 + 0.12 * (inten || 0))) / 4; }

  var Score = { SONGS: SONGS, IDS: IDS, resolve: resolve, stepEvents: stepEvents, render: render, stepSeconds: stepSeconds, degMidi: degMidi, scales: { MINOR: MINOR, DORIAN: DORIAN, LYDIAN: LYDIAN, PHRYG: PHRYG, MAJOR: MAJOR, HARM: HARM, WHOLE: WHOLE } };

  // ------------------------------------------------------------------------------------------------------------
  // Audio: the sequencer and synth voices. Browser only.
  var MASTER = 0.5;
  var ctx = null, bus = null, inst = null, timer = null, vol = 0.6, ducked = false, pending = null, inten = 0, enabled = true;

  function waves(c) { return c._tcw || (c._tcw = {}); }
  function waveFor(c, name) {
    if (name === 'p125' || name === 'p25') {
      var d = name === 'p125' ? 0.125 : 0.25, W = waves(c);
      if (!W[name]) {
        var N = 48, re = new Float32Array(N), im = new Float32Array(N);
        for (var n = 1; n < N; n++) { re[n] = Math.sin(2 * Math.PI * n * d) / (n * Math.PI); im[n] = (1 - Math.cos(2 * Math.PI * n * d)) / (n * Math.PI); }
        W[name] = c.createPeriodicWave(re, im);
      }
      return W[name];
    }
    return name === 'p50' ? 'square' : name;
  }
  function noiseBuf(c) {
    if (!c._tcn) { var b = c.createBuffer(1, c.sampleRate, c.sampleRate), d = b.getChannelData(0); for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; c._tcn = b; }
    return c._tcn;
  }
  function osc(c, dest, echoIn, ev, t, sec, detune) {
    var o = c.createOscillator(), g = c.createGain(), w = waveFor(c, ev.wave);
    if (typeof w === 'string') o.type = w; else o.setPeriodicWave(w);
    o.frequency.value = 440 * Math.pow(2, (ev.midi - 69) / 12); if (detune) o.detune.value = detune;
    var a = ev.attack || 0.006, end;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(ev.vol, t + a);
    if (ev.pluck) { var dec = ev.decay || 0.35; g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); end = t + a + dec + 0.03; }
    else { var rel = Math.min(0.25, sec * 0.5); g.gain.setValueAtTime(ev.vol, t + Math.max(a, sec * 0.85)); g.gain.exponentialRampToValueAtTime(0.0001, t + sec + rel); end = t + sec + rel + 0.03; }
    o.connect(g); g.connect(dest); if (ev.send && echoIn) g.connect(echoIn);
    if (ev.vib && sec > 0.25) { var l = c.createOscillator(), lg = c.createGain(); l.frequency.value = 5.5; lg.gain.value = 7; l.connect(lg); lg.connect(o.detune); l.start(t); l.stop(end); }
    o.start(t); o.stop(end);
  }
  function noise(c, dest, t, type, freq, q, dur, v) {
    var src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = noiseBuf(c); f.type = type; f.frequency.value = freq; f.Q.value = q || 1;
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(dest); src.start(t, Math.random() * 0.4); src.stop(t + dur + 0.03);
  }
  function play(c, inst0, ev, t, secStep) {
    var d = inst0.gain, e = inst0.echoIn;
    switch (ev.v) {
      case 'kick': { var o = c.createOscillator(), g = c.createGain(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.11);
        g.gain.setValueAtTime(ev.vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22); o.connect(g); g.connect(d); o.start(t); o.stop(t + 0.25); break; }
      case 'snare': noise(c, d, t, 'bandpass', 1900, 0.8, 0.14, ev.vol * 0.7); { var s = c.createOscillator(), sg = c.createGain(); s.type = 'triangle'; s.frequency.value = 190; sg.gain.setValueAtTime(ev.vol * 0.4, t); sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.08); s.connect(sg); sg.connect(d); s.start(t); s.stop(t + 0.1); } break;
      case 'clap': for (var k = 0; k < 3; k++) noise(c, d, t + k * 0.011, 'bandpass', 1500, 0.9, 0.09, ev.vol * 0.6); break;
      case 'hat': noise(c, d, t, 'highpass', 7500, 0.7, 0.04, ev.vol * 0.5); break;
      case 'anvil': noise(c, d, t, 'bandpass', 2800, 2, 0.09, ev.vol * 0.4);
        [1240, 1873].forEach(function (f) { var a = c.createOscillator(), ag = c.createGain(); a.frequency.value = f; ag.gain.setValueAtTime(ev.vol * 0.07, t); ag.gain.exponentialRampToValueAtTime(0.0001, t + 0.45); a.connect(ag); ag.connect(d); a.start(t); a.stop(t + 0.5); }); break;
      case 'tick': noise(c, d, t + Math.random() * secStep, 'highpass', 4000, 0.7, 0.012, ev.vol); break;
      default: osc(c, d, e, ev, t, Math.max(0.05, ev.dur * secStep));
        if (ev.unison) { osc(c, d, e, ev, t, Math.max(0.05, ev.dur * secStep), -9); osc(c, d, e, ev, t, Math.max(0.05, ev.dur * secStep), 9); }
    }
  }
  function build(c, out, cfg) {
    var g = c.createGain(); g.connect(out);
    var i = { cfg: cfg, step: 0, gain: g, echoIn: null, rng: Math.random };
    if (cfg.echo) {
      var din = c.createGain(), dl = c.createDelay(1), fb = c.createGain(), wet = c.createGain();
      dl.delayTime.value = Math.min(0.9, stepSeconds(cfg, 0) * 3); fb.gain.value = 0.34; wet.gain.value = 0.42;
      din.connect(dl); dl.connect(fb); fb.connect(dl); dl.connect(wet); wet.connect(g); i.echoIn = din;
    }
    return i;
  }
  function schedule(c, i, t) {
    var cfg = i.cfg, sec = stepSeconds(cfg, inten);
    stepEvents(cfg, i.step, i.rng, inten).forEach(function (ev) { play(c, i, ev, t, sec); });
    i.step++; return sec;
  }
  function tick() {
    if (!ctx || !inst) return;
    var guard = 0;
    while (inst.next < ctx.currentTime + 0.14 && guard++ < 8) inst.next += schedule(ctx, inst, inst.next);
  }
  function chain(c) {
    var b = c.createGain(), comp = c.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = 0.005; comp.release.value = 0.15;
    b.connect(comp); comp.connect(c.destination); return b;
  }
  function applyVolume() { if (bus) bus.gain.setTargetAtTime(vol * MASTER * (ducked ? 0.25 : 1), ctx.currentTime, 0.08); }

  var Music = {
    attach: function (c) {
      if (ctx === c) return; ctx = c; bus = chain(c); bus.gain.value = vol * MASTER * (ducked ? 0.25 : 1);
      if (pending) { var p = pending; pending = null; this.play(p.id, p.mode, p.depth); }
    },
    play: function (id, mode, depth) {
      var key = id + '|' + mode + '|' + (depth || 0);
      if (!enabled) return;
      if (inst && inst.key === key) return;
      pending = { id: id, mode: mode, depth: depth };
      if (!ctx) return;
      var now = ctx.currentTime, old = inst, cfg = resolve(id, mode, depth);
      if (old) { old.gain.gain.cancelScheduledValues(now); old.gain.gain.setValueAtTime(old.gain.gain.value, now); old.gain.gain.linearRampToValueAtTime(0, now + 0.35); setTimeout(function () { try { old.gain.disconnect(); } catch (e) {} }, 700); }
      inst = build(ctx, bus, cfg); inst.key = key; inst.next = now + 0.12;
      inst.gain.gain.setValueAtTime(0, now); inst.gain.gain.linearRampToValueAtTime(1, now + (old ? 0.5 : 0.8));
      if (!timer) timer = setInterval(tick, 30);
      pending = null;
    },
    stop: function () {
      pending = null;
      if (!inst || !ctx) { inst = null; return; }
      var old = inst, now = ctx.currentTime; inst = null;
      old.gain.gain.cancelScheduledValues(now); old.gain.gain.setValueAtTime(old.gain.gain.value, now); old.gain.gain.linearRampToValueAtTime(0, now + 0.4);
      setTimeout(function () { try { old.gain.disconnect(); } catch (e) {} }, 800);
    },
    duck: function (on) { ducked = !!on; if (bus) applyVolume(); },
    intensity: function (x) { inten = Math.max(0, Math.min(1, x || 0)); },
    setVolume: function (v) { vol = Math.max(0, Math.min(1, v)); if (bus) applyVolume(); },
    setEnabled: function (on) { enabled = !!on; if (!enabled) this.stop(); },
    current: function () { return inst ? inst.key : null; },
    /** Render seconds of a song to an AudioBuffer without playing it (used by tests). */
    renderOffline: function (id, mode, seconds, depth, intensity) {
      var OC = root.OfflineAudioContext || root.webkitOfflineAudioContext, c = new OC(2, Math.ceil(seconds * 44100), 44100), out = chain(c);
      out.gain.value = MASTER * 0.6; var cfg = resolve(id, mode, depth), i = build(c, out, cfg), t = 0, saved = inten; inten = intensity || 0;
      i.rng = Score.seeded(1234);
      while (t < seconds) t += schedule(c, i, t);
      inten = saved; return c.startRendering();
    }
  };
  Score.seeded = function (a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };

  Music.Score = Score;
  if (typeof module !== 'undefined' && module.exports) module.exports = Score; else root.Music = Music;
})(typeof window !== 'undefined' ? window : globalThis);
