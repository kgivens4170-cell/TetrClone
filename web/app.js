/* TetrClone app: screens, modes, input, rendering, effects, saves. Depends on engine.js and ai.js. */
(function () {
  'use strict';
  var E = window.Engine, AI = window.TetrAI;
  var COLS = E.COLS, VIS = E.VIS, HID = E.HID, H = E.H, SHAPES = E.SHAPES;
  var $ = function (id) { return document.getElementById(id); };
  var reduceMotion = false;
  try { reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  // ---------------------------------------------------------------- skins
  var SKINS = {
    classic: { name: 'Classic', colors: ['#2fe6e6', '#f2e233', '#a64ef0', '#3ee05a', '#f04a4a', '#4a6cf5', '#f5a03a'], garbage: '#59627a',
      vars: { bg: '#0d1017', well: '#070a10', grid: '#161b26', fg: '#e6ebf5', dim: '#8791a6', key: '#1b2230', keyhot: '#2a3550', line: '#263048', accent: '#ffcf4a', scheme: 'dark' },
      need: null },
    neon: { name: 'Neon', colors: ['#00f0ff', '#fff200', '#c24bff', '#39ff7a', '#ff3b5c', '#4d7cff', '#ff9d00'], garbage: '#5b4a85',
      vars: { bg: '#0a0614', well: '#06030f', grid: '#1c1233', fg: '#f3e9ff', dim: '#9484b8', key: '#1d1433', keyhot: '#33224f', line: '#3a2a5c', accent: '#ff3ea5', scheme: 'dark' },
      need: 'Play 3 games' },
    paper: { name: 'Paper', colors: ['#1aa5b8', '#d9a400', '#8a4fc9', '#2e9e4f', '#d64545', '#3e5fd1', '#d9822b'], garbage: '#8b94a8',
      vars: { bg: '#e8ecf3', well: '#ffffff', grid: '#d6dce8', fg: '#1b2433', dim: '#5d6980', key: '#d6dce8', keyhot: '#c1cade', line: '#bcc5d8', accent: '#c93a0c', scheme: 'light' },
      need: 'Clear 100 lines in total' },
    terminal: { name: 'Terminal', colors: ['#7dff7d', '#c8ff7d', '#4fd16b', '#a0ff4f', '#3fa84f', '#7dd6a0', '#d6ff9a'], garbage: '#2f5a2f',
      vars: { bg: '#050a05', well: '#020502', grid: '#0e1d0e', fg: '#b6f5b6', dim: '#5a9a5a', key: '#0f1f0f', keyhot: '#1b3a1b', line: '#1f4a1f', accent: '#7dff7d', scheme: 'dark' },
      need: 'Beat the Medium bot' }
  };
  var DANGER = '#ff4d5e';
  function skin() { return SKINS[save.settings.skin] || SKINS.classic; }
  function skinUnlocked(id) {
    if (id === 'classic') return true;
    if (id === 'neon') return save.totals.games >= 3;
    if (id === 'paper') return save.totals.lines >= 100;
    if (id === 'terminal') return !!save.ach.beat_medium;
    return false;
  }
  function applySkin() {
    var s = skin(), v = s.vars, st = document.documentElement.style;
    ['bg', 'well', 'grid', 'fg', 'dim', 'key', 'keyhot', 'line', 'accent'].forEach(function (k) { st.setProperty('--' + k, v[k]); });
    st.setProperty('color-scheme', v.scheme);
  }

  // ---------------------------------------------------------------- save data
  var KEY = 'tetrclone.save.v1';
  function defaults() {
    return { v: 1,
      best: { marathon: 0, sprint: 0, ultra: 0, daily: {} },
      totals: { games: 0, lines: 0, pieces: 0, timeMs: 0, tspins: 0, tetrises: 0, perfect: 0, maxCombo: 0, maxB2b: 0, attack: 0,
                vsWins: { easy: 0, medium: 0, hard: 0 }, vsLosses: 0 },
      history: [], ach: {},
      settings: { das: 150, arr: 35, ghost: true, sound: true, vibrate: true, skin: 'classic', diff: 'medium' } };
  }
  function merge(dst, src) {
    Object.keys(src || {}).forEach(function (k) {
      var a = dst[k], b = src[k];
      if (b && typeof b === 'object' && !Array.isArray(b) && a && typeof a === 'object' && !Array.isArray(a)) merge(a, b); else dst[k] = b;
    });
  }
  function loadSave() {
    var s = defaults();
    try { var raw = localStorage.getItem(KEY); if (raw) merge(s, JSON.parse(raw)); } catch (e) {}
    return s;
  }
  var save = loadSave();
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) {} }

  // ---------------------------------------------------------------- helpers
  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function todayKey() { var d = new Date(); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function hashStr(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function fmtTime(ms) {
    ms = Math.max(0, ms); var m = Math.floor(ms / 60000), s = Math.floor(ms / 1000) % 60, c = Math.floor(ms / 10) % 100;
    return m + ':' + pad2(s) + '.' + pad2(c);
  }
  function fmtClock(ms) { var s = Math.ceil(Math.max(0, ms) / 1000); return Math.floor(s / 60) + ':' + pad2(s % 60); }
  function num(n) { return Math.round(n).toLocaleString('en-US'); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // ---------------------------------------------------------------- sound + haptics
  var Sfx = {
    ctx: null,
    init: function () {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      try { var AC = window.AudioContext || window.webkitAudioContext; if (AC) this.ctx = new AC(); } catch (e) {}
    },
    tone: function (f, d, type, vol, slide, delay) {
      if (!save.settings.sound || !this.ctx) return;
      try {
        var c = this.ctx, t = c.currentTime + (delay || 0), o = c.createOscillator(), g = c.createGain();
        o.type = type || 'square'; o.frequency.setValueAtTime(f, t);
        if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f * slide), t + d);
        g.gain.setValueAtTime(vol || 0.05, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
        o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + d + 0.02);
      } catch (e) {}
    },
    play: function (n, k) {
      var T = this.tone.bind(this);
      switch (n) {
        case 'move': T(260, 0.025, 'square', 0.02); break;
        case 'rotate': T(380, 0.04, 'square', 0.03); break;
        case 'hold': T(300, 0.08, 'triangle', 0.06, 1.6); break;
        case 'drop': T(120, 0.09, 'sawtooth', 0.07, 0.5); break;
        case 'lock': T(170, 0.05, 'triangle', 0.05); break;
        case 'clear': [0, 1, 2, 3].slice(0, Math.max(1, Math.min(k, 4))).forEach(function (i) { T(440 * Math.pow(1.25, i), 0.12, 'triangle', 0.07, 1, i * 0.05); }); break;
        case 'tetris': [0, 1, 2, 3, 4].forEach(function (i) { T(330 * Math.pow(1.26, i), 0.16, 'square', 0.06, 1, i * 0.06); }); break;
        case 'tspin': [0, 1, 2].forEach(function (i) { T(500 * Math.pow(1.34, i), 0.14, 'sawtooth', 0.05, 1, i * 0.06); }); break;
        case 'garbage': T(90, 0.18, 'sawtooth', 0.08, 0.6); break;
        case 'level': [0, 1, 2].forEach(function (i) { T(520 * Math.pow(1.2, i), 0.1, 'triangle', 0.06, 1, i * 0.07); }); break;
        case 'beep': T(520, 0.09, 'square', 0.05); break;
        case 'go': T(880, 0.18, 'square', 0.06); break;
        case 'win': [0, 1, 2, 3].forEach(function (i) { T(392 * Math.pow(1.26, i), 0.2, 'triangle', 0.08, 1, i * 0.1); }); break;
        case 'over': [0, 1, 2].forEach(function (i) { T(300 / Math.pow(1.2, i), 0.25, 'sawtooth', 0.07, 0.7, i * 0.14); }); break;
        case 'ach': [0, 1].forEach(function (i) { T(660 * Math.pow(1.5, i), 0.18, 'triangle', 0.07, 1, i * 0.1); }); break;
      }
    }
  };
  function buzz(ms) { if (save.settings.vibrate && navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) {} } }

  // ---------------------------------------------------------------- modes
  var MODES = {
    marathon: { name: 'Marathon', desc: 'Endless. Gravity rises every 10 lines.', level: 1 },
    sprint: { name: 'Sprint', desc: 'Clear 40 lines as fast as you can.', fixed: true, level: 3, goal: 40 },
    ultra: { name: 'Ultra', desc: 'Score as much as you can in 2:00.', fixed: true, level: 5, limit: 120000 },
    daily: { name: 'Daily Challenge', desc: 'Same pieces for everyone today. 2:00 score attack.', fixed: true, level: 5, limit: 120000 },
    versus: { name: 'Versus Bot', desc: 'Send garbage lines. Last stack standing wins.', level: 1, versus: true }
  };
  var ORDER = ['marathon', 'sprint', 'ultra', 'daily', 'versus'];

  // ---------------------------------------------------------------- achievements
  var ACH = [
    { id: 'first_clear', name: 'First Clear', text: 'Clear a line.', ev: function (c) { return c.ev && c.ev.n > 0; } },
    { id: 'tetris', name: 'Tetris!', text: 'Clear four lines at once.', ev: function (c) { return c.ev && c.ev.n === 4; } },
    { id: 'tspin', name: 'Spin Doctor', text: 'Clear lines with a T-spin.', ev: function (c) { return c.ev && c.ev.tspin === 2 && c.ev.n > 0; } },
    { id: 'combo5', name: 'Combo Chain', text: 'Reach a 5 combo.', ev: function (c) { return c.ev && c.ev.combo >= 5; } },
    { id: 'b2b3', name: 'Back to Back', text: 'Chain 3 difficult clears (Tetris or T-spin).', ev: function (c) { return c.ev && c.ev.b2bChain >= 3; } },
    { id: 'perfect', name: 'Spotless', text: 'Perfect clear: empty the whole board.', ev: function (c) { return c.ev && c.ev.perfect; } },
    { id: 'sprint120', name: 'Sprinter', text: 'Finish Sprint in under 2:00.', fin: function (r) { return r.mode === 'sprint' && r.outcome === 'complete' && r.time < 120000; } },
    { id: 'sprint90', name: 'Quick Hands', text: 'Finish Sprint in under 1:30.', fin: function (r) { return r.mode === 'sprint' && r.outcome === 'complete' && r.time < 90000; } },
    { id: 'sprint60', name: 'Blitz', text: 'Finish Sprint in under 1:00.', fin: function (r) { return r.mode === 'sprint' && r.outcome === 'complete' && r.time < 60000; } },
    { id: 'ultra15k', name: 'High Roller', text: 'Score 15,000 in Ultra.', fin: function (r) { return r.mode === 'ultra' && r.score >= 15000; } },
    { id: 'level10', name: 'Speed Demon', text: 'Reach level 10 in Marathon.', fin: function (r) { return r.mode === 'marathon' && r.level >= 10; } },
    { id: 'daily', name: 'Daily Player', text: 'Finish a Daily Challenge.', fin: function (r) { return r.mode === 'daily' && r.outcome === 'complete'; } },
    { id: 'beat_easy', name: 'Bot Basher', text: 'Beat the Easy bot.', fin: function (r) { return r.mode === 'versus' && r.outcome === 'win' && r.diff === 'easy'; } },
    { id: 'beat_medium', name: 'Bot Breaker', text: 'Beat the Medium bot. Unlocks the Terminal theme.', fin: function (r) { return r.mode === 'versus' && r.outcome === 'win' && r.diff === 'medium'; } },
    { id: 'beat_hard', name: 'Machine Slayer', text: 'Beat the Hard bot.', fin: function (r) { return r.mode === 'versus' && r.outcome === 'win' && r.diff === 'hard'; } },
    { id: 'heavy', name: 'Heavy Hitter', text: 'Send 20 garbage lines in one Versus game.', fin: function (r) { return r.mode === 'versus' && r.attack >= 20; } },
    { id: 'games25', name: 'Regular', text: 'Finish 25 games.', fin: function () { return save.totals.games >= 25; } },
    { id: 'lines1000', name: 'Thousand Lines', text: 'Clear 1,000 lines in total.', fin: function () { return save.totals.lines >= 1000; } }
  ];
  var toasts = [], toastBusy = false;
  function unlock(id) {
    if (save.ach[id]) return;
    var a = ACH.filter(function (x) { return x.id === id; })[0];
    save.ach[id] = Date.now(); persist();
    toasts.push(a.name); Sfx.play('ach');
    if (!toastBusy) nextToast();
  }
  function nextToast() {
    var el = $('toast');
    if (!toasts.length) { toastBusy = false; el.hidden = true; return; }
    toastBusy = true; el.hidden = false; el.textContent = 'Trophy unlocked: ' + toasts.shift();
    setTimeout(nextToast, 2200);
  }
  function checkEv(ev) { ACH.forEach(function (a) { if (a.ev && !save.ach[a.id] && a.ev({ ev: ev })) unlock(a.id); }); }
  function checkFin(r) { ACH.forEach(function (a) { if (a.fin && !save.ach[a.id] && a.fin(r)) unlock(a.id); }); }

  // ---------------------------------------------------------------- state
  var S = { screen: 'menu', mode: null, P: null, O: null, bot: null, diff: 'medium', paused: false, done: false, countdown: 0,
            fx: { particles: [], popups: [], flashes: [], shake: 0 }, cell: 24, ocell: 12, lastBeep: 0, newBest: false, result: null, lastLevel: 1 };

  // ---------------------------------------------------------------- screens
  var screens = ['menu', 'game', 'stats', 'settings'];
  function show(name) {
    S.screen = name;
    screens.forEach(function (s) { $('screen-' + s).hidden = s !== name; });
    if (name === 'menu') renderMenu();
    if (name === 'stats') renderStats();
    if (name === 'settings') renderSettings();
    if (name === 'game') fit();
  }

  function bestText(m) {
    if (m === 'marathon') return save.best.marathon ? num(save.best.marathon) : '';
    if (m === 'sprint') return save.best.sprint ? fmtTime(save.best.sprint) : '';
    if (m === 'ultra') return save.best.ultra ? num(save.best.ultra) : '';
    if (m === 'daily') return save.best.daily[todayKey()] ? num(save.best.daily[todayKey()]) : '';
    if (m === 'versus') { var w = save.totals.vsWins; var t = w.easy + w.medium + w.hard; return t ? t + (t === 1 ? ' win' : ' wins') : ''; }
    return '';
  }

  function renderMenu() {
    var html = '';
    ORDER.forEach(function (id) {
      var m = MODES[id], b = bestText(id);
      var extra = id === 'daily' ? ' <span class="date">' + todayKey() + '</span>' : '';
      html += '<button class="mode" data-mode="' + id + '"><span class="mtxt"><b>' + m.name + extra + '</b><i>' + m.desc + '</i></span>' +
        '<span class="mbest">' + (b ? '<small>' + (id === 'daily' ? 'TODAY' : id === 'versus' ? 'RECORD' : 'BEST') + '</small>' + b : '') + '</span></button>';
      if (id === 'versus') {
        html += '<div class="seg" role="group" aria-label="Bot difficulty">';
        ['easy', 'medium', 'hard'].forEach(function (d) {
          html += '<button data-diff="' + d + '" class="' + (save.settings.diff === d ? 'on' : '') + '">' + AI.LEVELS[d].label + '</button>';
        });
        html += '</div>';
      }
    });
    $('modes').innerHTML = html;
    var got = Object.keys(save.ach).length;
    $('trophyCount').textContent = got + '/' + ACH.length;
  }

  function renderStats() {
    var t = save.totals, hrs = t.timeMs / 3600000;
    var cells = [
      ['Games', num(t.games)], ['Lines', num(t.lines)], ['Pieces', num(t.pieces)],
      ['Play time', hrs >= 1 ? hrs.toFixed(1) + ' h' : Math.round(t.timeMs / 60000) + ' min'],
      ['T-spins', num(t.tspins)], ['Tetrises', num(t.tetrises)], ['Best combo', num(t.maxCombo)],
      ['Best B2B chain', num(t.maxB2b)], ['Perfect clears', num(t.perfect)], ['Garbage sent', num(t.attack)]
    ];
    var html = '<div class="grid2">';
    cells.forEach(function (c) { html += '<div class="kv"><span>' + c[0] + '</span><b>' + c[1] + '</b></div>'; });
    html += '</div>';
    $('statsGrid').innerHTML = html;

    var b = '<div class="grid2">' +
      '<div class="kv"><span>Marathon best</span><b>' + (save.best.marathon ? num(save.best.marathon) : '—') + '</b></div>' +
      '<div class="kv"><span>Sprint best</span><b>' + (save.best.sprint ? fmtTime(save.best.sprint) : '—') + '</b></div>' +
      '<div class="kv"><span>Ultra best</span><b>' + (save.best.ultra ? num(save.best.ultra) : '—') + '</b></div>' +
      '<div class="kv"><span>Versus record</span><b>' + t.vsWins.easy + '/' + t.vsWins.medium + '/' + t.vsWins.hard + ' <small>E/M/H wins</small></b></div></div>';
    $('bestGrid').innerHTML = b;

    var hist = save.history.slice(-12).reverse(), max = 1;
    hist.forEach(function (h) { if (h.mode !== 'sprint' && h.mode !== 'versus') max = Math.max(max, h.score); });
    var hh = '';
    if (!hist.length) hh = '<p class="empty">No games yet. Finish one and it will show up here.</p>';
    hist.forEach(function (h) {
      var d = new Date(h.date), label = MODES[h.mode].name.replace(' Challenge', '').replace(' Bot', ''), res;
      if (h.mode === 'sprint') res = h.outcome === 'complete' ? fmtTime(h.time) : h.lines + '/40 lines';
      else if (h.mode === 'versus') res = (h.outcome === 'win' ? 'Won' : 'Lost') + ' vs ' + AI.LEVELS[h.diff].label;
      else res = num(h.score);
      var pct = (h.mode === 'sprint' || h.mode === 'versus') ? Math.min(100, h.lines * 2.5) : Math.max(3, Math.round(h.score / max * 100));
      hh += '<div class="hrow"><span class="hm">' + label + '</span><span class="hbar"><i style="width:' + pct + '%"></i></span><span class="hv">' + res + '</span><span class="hd">' + (d.getMonth() + 1) + '/' + d.getDate() + '</span></div>';
    });
    $('history').innerHTML = hh;

    var ah = '';
    ACH.forEach(function (a) {
      var got = save.ach[a.id];
      ah += '<div class="trophy ' + (got ? 'got' : '') + '"><span class="tmark">' + (got ? '✓' : '') + '</span><span><b>' + a.name + '</b><i>' + a.text + '</i></span></div>';
    });
    $('trophies').innerHTML = ah;
  }

  function renderSettings() {
    var s = save.settings;
    $('dasV').textContent = s.das + ' ms'; $('das').value = s.das;
    $('arrV').textContent = s.arr + ' ms'; $('arr').value = s.arr;
    $('optGhost').checked = s.ghost; $('optSound').checked = s.sound; $('optVib').checked = s.vibrate;
    var html = '';
    Object.keys(SKINS).forEach(function (id) {
      var k = SKINS[id], ok = skinUnlocked(id), v = k.vars;
      html += '<button class="skin ' + (s.skin === id ? 'on' : '') + '" data-skin="' + id + '"' + (ok ? '' : ' disabled') + '>' +
        '<span class="sw" style="background:' + v.well + ';border-color:' + v.line + '">' +
        k.colors.slice(0, 4).map(function (c) { return '<i style="background:' + c + '"></i>'; }).join('') + '</span>' +
        '<b>' + k.name + '</b><small>' + (ok ? (s.skin === id ? 'In use' : 'Unlocked') : 'Locked: ' + k.need) + '</small></button>';
    });
    $('skins').innerHTML = html;
    $('resetBtn').textContent = resetArmed ? 'Tap again to erase all progress' : 'Erase all progress';
    $('resetBtn').classList.toggle('danger', resetArmed);
  }
  var resetArmed = false;

  // ---------------------------------------------------------------- game control
  function startGame(modeId) {
    Sfx.init();
    var m = MODES[modeId];
    S.mode = modeId; S.done = false; S.paused = false; S.newBest = false; S.result = null;
    S.diff = save.settings.diff;
    var seed = modeId === 'daily' ? hashStr('tetrclone-' + todayKey()) : null;
    S.P = new E({ seed: seed, level: m.level, fixedLevel: !!(m.fixed || m.versus) });
    S.O = null; S.bot = null;
    if (m.versus) {
      S.O = new E({ level: 1, fixedLevel: true });
      S.bot = new AI.Bot(S.O, S.diff);
    }
    S.fx = { particles: [], popups: [], flashes: [], shake: 0 };
    S.countdown = 2700; S.lastBeep = 4; S.lastLevel = m.level;
    Input.reset();
    $('ov').hidden = true;
    $('modeName').textContent = m.name + (m.versus ? ' · ' + AI.LEVELS[S.diff].label : '');
    $('oppCol').hidden = !m.versus;
    show('game');
    $('pauseBtn').textContent = 'Pause';
  }

  function togglePause() {
    if (S.screen !== 'game' || S.done || S.countdown > 0) return;
    S.paused = !S.paused; Input.reset();
    if (S.paused) {
      $('ov').hidden = false;
      $('ov').innerHTML = '<div class="panel"><h2>Paused</h2><div class="btns"><button class="btn primary" id="rResume">Resume</button><button class="btn" id="rRetry">Restart</button><button class="btn" id="rMenu">Quit to menu</button></div></div>';
    } else $('ov').hidden = true;
    $('pauseBtn').textContent = S.paused ? 'Resume' : 'Pause';
  }

  function leaveGame() {
    if (S.screen === 'game' && S.P && !S.done) {
      if (S.mode === 'marathon' && S.P.pieces > 0) { finish('quit'); }
      else abandon();
    }
    S.done = true; $('ov').hidden = true; show('menu');
  }

  function abandon() {
    var t = save.totals, P = S.P;
    t.lines += P.lines; t.pieces += P.pieces; t.timeMs += P.time; persist();
  }

  function finish(why) {
    if (S.done) return;
    S.done = true;
    var P = S.P, m = MODES[S.mode], outcome;
    if (m.versus) outcome = P.over ? 'lose' : 'win';
    else if (S.mode === 'sprint') outcome = P.lines >= m.goal ? 'complete' : 'fail';
    else if (m.limit) outcome = 'complete';
    else outcome = 'gameover';
    var r = { mode: S.mode, outcome: outcome, score: P.score, lines: P.lines, pieces: P.pieces, time: P.time, level: P.level,
              diff: S.diff, attack: P.attackSent, stats: P.stats, date: Date.now(), quit: why === 'quit' };
    var t = save.totals, today = todayKey();
    if (outcome === 'complete' && S.mode === 'sprint') { if (!save.best.sprint || P.time < save.best.sprint) { save.best.sprint = Math.round(P.time); S.newBest = true; } }
    if (S.mode === 'marathon' && P.score > save.best.marathon) { save.best.marathon = P.score; S.newBest = true; }
    if (S.mode === 'ultra' && P.score > save.best.ultra) { save.best.ultra = P.score; S.newBest = true; }
    if (S.mode === 'daily' && P.score > (save.best.daily[today] || 0)) { save.best.daily[today] = P.score; S.newBest = true; }
    t.games++; t.lines += P.lines; t.pieces += P.pieces; t.timeMs += P.time; t.attack += P.attackSent;
    t.tspins += P.stats.tspins; t.tetrises += P.stats.tetrises; t.perfect += P.stats.perfect;
    t.maxCombo = Math.max(t.maxCombo, P.stats.maxCombo); t.maxB2b = Math.max(t.maxB2b, P.stats.maxB2b);
    if (m.versus) { if (outcome === 'win') t.vsWins[S.diff]++; else t.vsLosses++; }
    save.history.push({ mode: S.mode, score: P.score, lines: P.lines, time: Math.round(P.time), outcome: outcome, diff: S.diff, date: r.date });
    if (save.history.length > 40) save.history.splice(0, save.history.length - 40);
    var before = Object.keys(save.ach).length;
    checkFin(r); persist();
    r.unlocked = Object.keys(save.ach).length - before;
    S.result = r;
    Sfx.play(outcome === 'lose' || outcome === 'gameover' || outcome === 'fail' ? 'over' : 'win');
    buzz(60);
    showResult(r);
  }

  function showResult(r) {
    var title, sub = '';
    if (r.outcome === 'win') title = 'You win';
    else if (r.outcome === 'lose') title = 'You lose';
    else if (r.outcome === 'complete') title = r.mode === 'sprint' ? 'Sprint complete' : 'Time';
    else if (r.outcome === 'fail') title = 'Topped out';
    else title = r.quit ? 'Run saved' : 'Game over';
    var headline = r.mode === 'sprint' && r.outcome === 'complete' ? fmtTime(r.time) : num(r.score);
    var unit = r.mode === 'sprint' && r.outcome === 'complete' ? 'time' : 'points';
    var pps = r.time > 0 ? (r.pieces / (r.time / 1000)).toFixed(2) : '0.00';
    var cells = [['Lines', r.lines], ['Pieces', r.pieces], ['Time', fmtTime(r.time)], ['Pieces/sec', pps],
                 ['Best combo', r.stats.maxCombo], ['T-spins', r.stats.tspins]];
    if (r.mode === 'versus') cells.push(['Garbage sent', r.attack]);
    var html = '<div class="panel"><h2>' + title + '</h2>';
    if (S.newBest) html += '<div class="badge">New best</div>';
    html += '<div class="big">' + headline + '<small>' + unit + '</small></div><div class="grid3">';
    cells.forEach(function (c) { html += '<div class="kv"><span>' + c[0] + '</span><b>' + c[1] + '</b></div>'; });
    html += '</div>';
    if (r.unlocked) html += '<p class="note">' + r.unlocked + (r.unlocked === 1 ? ' trophy' : ' trophies') + ' unlocked this game.</p>';
    html += '<div class="btns"><button class="btn primary" id="rRetry">Play again</button><button class="btn" id="rMenu">Menu</button></div></div>';
    $('ov').innerHTML = html; $('ov').hidden = false;
  }

  // ---------------------------------------------------------------- events from engines
  var CLEAR_NAMES = ['', 'Single', 'Double', 'Triple', 'Tetris'];
  function handleP(evs) {
    var P = S.P;
    for (var i = 0; i < evs.length; i++) {
      var ev = evs[i];
      if (ev.type === 'move') Sfx.play('move');
      else if (ev.type === 'rotate') Sfx.play('rotate');
      else if (ev.type === 'hold') Sfx.play('hold');
      else if (ev.type === 'harddrop') { if (ev.dist > 0 && !reduceMotion) S.fx.shake = Math.max(S.fx.shake, 2.5); Sfx.play('drop'); }
      else if (ev.type === 'garbage') { Sfx.play('garbage'); buzz(40); if (!reduceMotion) S.fx.shake = Math.max(S.fx.shake, 5); }
      else if (ev.type === 'lock') {
        if (!ev.n) { Sfx.play('lock'); buzz(8); if (ev.tspin) popup(ev.tspin === 2 ? 'T-SPIN' : 'T-SPIN MINI', '', 'accent'); }
        else onClear(ev, true);
        checkEv(ev);
        if (S.O && ev.attack > 0) S.O.receiveGarbage(ev.attack);
      }
    }
    if (P.level > S.lastLevel) { S.lastLevel = P.level; Sfx.play('level'); popup('LEVEL ' + P.level, '', 'accent'); }
  }
  function handleO(evs) {
    for (var i = 0; i < evs.length; i++) {
      var ev = evs[i];
      if (ev.type === 'lock' && ev.n && ev.attack > 0) S.P.receiveGarbage(ev.attack);
      if (ev.type === 'lock' && ev.n) { S.fx.oflash = 1; }
    }
  }
  function onClear(ev, mine) {
    var title = ev.tspin ? (ev.tspin === 2 ? 'T-SPIN ' : 'T-SPIN MINI ') + CLEAR_NAMES[ev.n].toUpperCase() : CLEAR_NAMES[ev.n].toUpperCase();
    if (ev.n === 4 && !ev.tspin) title = 'TETRIS';
    var sub = [];
    if (ev.b2b) sub.push('BACK-TO-BACK');
    if (ev.combo >= 1) sub.push('COMBO ' + ev.combo);
    if (ev.perfect) sub.push('PERFECT CLEAR');
    if (ev.attack > 0 && S.O) sub.push('+' + ev.attack + ' GARBAGE');
    popup(title, sub.join('  ·  '), ev.n === 4 || ev.tspin ? 'accent' : 'fg');
    Sfx.play(ev.tspin ? 'tspin' : ev.n === 4 ? 'tetris' : 'clear', ev.n);
    buzz(ev.n === 4 ? 70 : 25);
    ev.cleared.forEach(function (row) {
      S.fx.flashes.push({ row: row - HID, t: 0 });
      if (reduceMotion) return;
      for (var x = 0; x < COLS; x++) for (var k = 0; k < 2; k++) {
        S.fx.particles.push({ x: (x + 0.5) * S.cell, y: (row - HID + 0.5) * S.cell, vx: (Math.random() - 0.5) * 260, vy: -Math.random() * 220 - 20,
                              life: 0, max: 500 + Math.random() * 400, c: Math.floor(Math.random() * 7), s: 2 + Math.random() * 4 });
      }
    });
    if (S.fx.particles.length > 400) S.fx.particles.splice(0, S.fx.particles.length - 400);
    if (!reduceMotion) S.fx.shake = Math.max(S.fx.shake, ev.n === 4 ? 9 : ev.tspin ? 6 : 3);
  }
  function popup(text, sub, tone) { S.fx.popups.push({ text: text, sub: sub, tone: tone, t: 0 }); if (S.fx.popups.length > 3) S.fx.popups.shift(); }

  // ---------------------------------------------------------------- input (DAS / ARR)
  var Input = {
    held: {}, dir: null, dasT: 0, softT: 0,
    reset: function () { this.held = {}; this.dir = null; this.dasT = 0; this.softT = 0; },
    live: function () { return S.screen === 'game' && S.P && !S.paused && !S.done && S.countdown <= 0; },
    press: function (a) {
      Sfx.init();
      if (a === 'pause') { togglePause(); return; }
      if (!this.live()) return;
      var P = S.P;
      if (a === 'left' || a === 'right') {
        this.held[a] = true; this.dir = a; this.dasT = save.settings.das; P.move(a === 'left' ? -1 : 1);
      } else if (a === 'soft') { this.held.soft = true; this.softT = 35; P.softDrop(); }
      else if (a === 'cw') P.rotate(1);
      else if (a === 'ccw') P.rotate(-1);
      else if (a === 'hold') P.doHold();
      else if (a === 'hard') P.hardDrop();
    },
    release: function (a) {
      this.held[a] = false;
      if ((a === 'left' || a === 'right') && this.dir === a) {
        var other = a === 'left' ? 'right' : 'left';
        if (this.held[other]) { this.dir = other; this.dasT = save.settings.das; } else this.dir = null;
      }
    },
    update: function (dt) {
      if (!this.live()) return;
      var P = S.P;
      if (this.dir && this.held[this.dir]) {
        this.dasT -= dt;
        var dx = this.dir === 'left' ? -1 : 1, arr = save.settings.arr, guard = 0;
        while (this.dasT <= 0 && guard++ < 12) {
          if (!P.move(dx)) { this.dasT = 0; break; }
          this.dasT += Math.max(arr, 1);
        }
      }
      if (this.held.soft) {
        this.softT -= dt;
        while (this.softT <= 0) { P.softDrop(); this.softT += 35; }
      }
    }
  };

  var KEYMAP = { ArrowLeft: 'left', ArrowRight: 'right', ArrowDown: 'soft', ArrowUp: 'cw', x: 'cw', X: 'cw', z: 'ccw', Z: 'ccw',
                 c: 'hold', C: 'hold', Shift: 'hold', ' ': 'hard', p: 'pause', P: 'pause', Escape: 'pause' };
  document.addEventListener('keydown', function (e) {
    if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
    var a = KEYMAP[e.key];
    if (S.screen === 'game' && a) {
      e.preventDefault();
      if (e.repeat && a !== 'pause') return;
      Input.press(a);
    }
  });
  document.addEventListener('keyup', function (e) { var a = KEYMAP[e.key]; if (a) Input.release(a); });
  document.addEventListener('visibilitychange', function () { if (document.hidden && S.screen === 'game' && !S.paused && !S.done) togglePause(); });
  window.addEventListener('blur', function () { Input.reset(); });

  [['bLeft', 'left'], ['bRight', 'right'], ['bSoft', 'soft'], ['bCW', 'cw'], ['bCCW', 'ccw'], ['bHold', 'hold'], ['bHard', 'hard']].forEach(function (p) {
    var el = $(p[0]);
    el.addEventListener('pointerdown', function (e) { e.preventDefault(); el.classList.add('on'); Input.press(p[1]); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (n) {
      el.addEventListener(n, function () { el.classList.remove('on'); Input.release(p[1]); });
    });
    el.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  });

  // ---------------------------------------------------------------- rendering
  var cvB = $('board'), cxB = cvB.getContext('2d'), cvO = $('opp'), cxO = cvO.getContext('2d');
  var cvH = $('holdC'), cxH = cvH.getContext('2d'), cvN = $('nextC'), cxN = cvN.getContext('2d');
  var dpr = 1;

  function sizeCanvas(cv, w, h) {
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    cv.style.width = w + 'px'; cv.style.height = h + 'px';
  }
  function fit() {
    dpr = Math.min(3, window.devicePixelRatio || 1);
    var stage = $('stage'), w = stage.clientWidth, h = stage.clientHeight, versus = !!(S.mode && MODES[S.mode].versus);
    var cell = versus ? Math.floor(Math.min((w - 10) / 15, h / VIS)) : Math.floor(Math.min(w / COLS, h / VIS));
    cell = Math.max(10, cell);
    S.cell = cell; S.ocell = Math.max(5, Math.floor(cell / 2));
    sizeCanvas(cvB, cell * COLS, cell * VIS);
    sizeCanvas(cvO, S.ocell * COLS, S.ocell * VIS);
    sizeCanvas(cvH, 56, 44); sizeCanvas(cvN, 200, 44);
  }
  window.addEventListener('resize', function () { if (S.screen === 'game') fit(); });
  if (window.ResizeObserver) new ResizeObserver(function () { if (S.screen === 'game') fit(); }).observe($('stage'));

  function col(v) { var s = skin(); return v === 8 ? s.garbage : s.colors[v - 1]; }
  function cell(c, x, y, s, color, alpha) {
    c.globalAlpha = alpha == null ? 1 : alpha;
    c.fillStyle = color; c.fillRect(x + 0.5, y + 0.5, s - 1, s - 1);
    if (alpha == null) {
      var e = Math.max(1.5, s * 0.13);
      c.fillStyle = 'rgba(255,255,255,.22)'; c.fillRect(x + 0.5, y + 0.5, s - 1, e);
      c.fillStyle = 'rgba(0,0,0,.2)'; c.fillRect(x + 0.5, y + s - 0.5 - e, s - 1, e);
    }
    c.globalAlpha = 1;
  }
  function drawMini(c, p, cx, cy, s, color, alpha) {
    var cs = SHAPES[p][0], minX = 9, maxX = -1, minY = 9, maxY = -1;
    cs.forEach(function (q) { minX = Math.min(minX, q[0]); maxX = Math.max(maxX, q[0]); minY = Math.min(minY, q[1]); maxY = Math.max(maxY, q[1]); });
    var ox = cx - (maxX - minX + 1) * s / 2 - minX * s, oy = cy - (maxY - minY + 1) * s / 2 - minY * s;
    cs.forEach(function (q) { cell(c, ox + q[0] * s, oy + q[1] * s, s, color, alpha); });
  }

  function drawBoard(c, e, cs, o) {
    var s = skin(), w = COLS * cs, h = VIS * cs, x, y;
    c.fillStyle = s.vars.well; c.fillRect(0, 0, w, h);
    c.strokeStyle = s.vars.grid; c.lineWidth = 1; c.beginPath();
    for (x = 1; x < COLS; x++) { c.moveTo(x * cs + 0.5, 0); c.lineTo(x * cs + 0.5, h); }
    for (y = 1; y < VIS; y++) { c.moveTo(0, y * cs + 0.5); c.lineTo(w, y * cs + 0.5); }
    c.stroke();
    for (y = HID; y < H; y++) for (x = 0; x < COLS; x++) { var v = e.board[y][x]; if (v) cell(c, x * cs, (y - HID) * cs, cs, col(v)); }
    if (!e.over) {
      var cells = SHAPES[e.piece][e.rot], i, q;
      if (o.ghost) {
        var gy = e.ghostY();
        for (i = 0; i < 4; i++) {
          q = cells[i]; var gyy = gy + q[1] - HID;
          if (gyy >= 0) { cell(c, (e.px + q[0]) * cs, gyy * cs, cs, s.colors[e.piece], 0.22); c.strokeStyle = s.colors[e.piece]; c.globalAlpha = 0.5; c.strokeRect((e.px + q[0]) * cs + 1.5, gyy * cs + 1.5, cs - 3, cs - 3); c.globalAlpha = 1; }
        }
      }
      for (i = 0; i < 4; i++) { q = cells[i]; var yy = e.py + q[1] - HID; if (yy >= 0) cell(c, (e.px + q[0]) * cs, yy * cs, cs, s.colors[e.piece]); }
    }
    if (e.pending > 0) {
      var bw = Math.max(3, cs * 0.2), bh = Math.min(VIS, e.pending) * cs;
      c.fillStyle = DANGER; c.fillRect(w - bw, h - bh, bw, bh);
    }
  }

  function render(dt) {
    if (S.screen !== 'game' || !S.P) return;
    var P = S.P, s = skin(), fx = S.fx, c = cxB, cs = S.cell, i;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawBoard(c, P, cs, { ghost: save.settings.ghost });
    // line flashes
    for (i = fx.flashes.length - 1; i >= 0; i--) {
      var f = fx.flashes[i]; f.t += dt;
      if (f.t > 240) { fx.flashes.splice(i, 1); continue; }
      c.fillStyle = 'rgba(255,255,255,' + (0.85 * (1 - f.t / 240)).toFixed(3) + ')'; c.fillRect(0, f.row * cs, COLS * cs, cs);
    }
    // particles
    for (i = fx.particles.length - 1; i >= 0; i--) {
      var p = fx.particles[i]; p.life += dt;
      if (p.life > p.max) { fx.particles.splice(i, 1); continue; }
      p.vy += 700 * dt / 1000; p.x += p.vx * dt / 1000; p.y += p.vy * dt / 1000;
      c.globalAlpha = 1 - p.life / p.max; c.fillStyle = s.colors[p.c]; c.fillRect(p.x, p.y, p.s, p.s); c.globalAlpha = 1;
    }
    // popups
    for (i = fx.popups.length - 1; i >= 0; i--) {
      var pu = fx.popups[i]; pu.t += dt;
      if (pu.t > 1400) { fx.popups.splice(i, 1); continue; }
      var a = pu.t < 900 ? 1 : 1 - (pu.t - 900) / 500, yy = cs * 6 - pu.t * 0.012 * cs / 6 + i * cs * 1.6;
      c.globalAlpha = Math.max(0, a); c.textAlign = 'center';
      c.fillStyle = pu.tone === 'accent' ? s.vars.accent : s.vars.fg;
      c.font = '700 ' + Math.round(cs * 0.82) + 'px "Chakra Petch", system-ui, sans-serif';
      c.shadowColor = 'rgba(0,0,0,.6)'; c.shadowBlur = 6;
      c.fillText(pu.text, COLS * cs / 2, yy);
      if (pu.sub) { c.font = '500 ' + Math.round(cs * 0.5) + 'px "Chakra Petch", system-ui, sans-serif'; c.fillText(pu.sub, COLS * cs / 2, yy + cs * 0.75); }
      c.shadowBlur = 0; c.globalAlpha = 1; c.textAlign = 'start';
    }
    // countdown
    if (S.countdown > 0) {
      var n = Math.ceil(S.countdown / 900);
      c.fillStyle = 'rgba(0,0,0,.45)'; c.fillRect(0, 0, COLS * cs, VIS * cs);
      c.fillStyle = s.vars.accent; c.textAlign = 'center'; c.font = '700 ' + cs * 4 + 'px "Chakra Petch", system-ui, sans-serif';
      c.fillText(n > 0 ? String(Math.min(3, n)) : 'GO', COLS * cs / 2, VIS * cs / 2 + cs * 1.4); c.textAlign = 'start';
    }
    // opponent
    if (S.O) {
      cxO.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawBoard(cxO, S.O, S.ocell, { ghost: false });
      if (S.O.over) { cxO.fillStyle = 'rgba(0,0,0,.55)'; cxO.fillRect(0, 0, COLS * S.ocell, VIS * S.ocell); }
      $('oppInfo').innerHTML = '<b>' + AI.LEVELS[S.diff].label + ' bot</b><span>Sent ' + S.O.attackSent + ' · Lines ' + S.O.lines + '</span><span>You sent ' + P.attackSent + '</span>';
    }
    // hold + next
    cxH.setTransform(dpr, 0, 0, dpr, 0, 0); cxH.clearRect(0, 0, 56, 44);
    cxH.fillStyle = s.vars.well; cxH.fillRect(0, 0, 56, 44);
    if (P.hold >= 0) drawMini(cxH, P.hold, 28, 22, 9, s.colors[P.hold], P.canHold ? null : 0.35);
    else { cxH.fillStyle = s.vars.dim; cxH.font = '600 9px "Chakra Petch", system-ui, sans-serif'; cxH.textAlign = 'center'; cxH.fillText('HOLD', 28, 26); cxH.textAlign = 'start'; }
    cxN.setTransform(dpr, 0, 0, dpr, 0, 0); cxN.fillStyle = s.vars.well; cxN.fillRect(0, 0, 200, 44);
    for (i = 0; i < 5; i++) drawMini(cxN, P.queue[i], 20 + i * 40, 22, i === 0 ? 9 : 7, s.colors[P.queue[i]]);
    // stats
    var m = MODES[S.mode];
    $('vScore').textContent = num(P.score);
    $('vLines').textContent = m.goal ? P.lines + '/' + m.goal : P.lines;
    $('vLevel').textContent = P.level;
    $('lblTime').textContent = m.limit ? 'Left' : 'Time';
    $('vTime').textContent = m.limit ? fmtClock(m.limit - P.time) : (S.mode === 'sprint' ? fmtTime(P.time) : fmtClock(P.time));
  }

  // ---------------------------------------------------------------- main loop
  var last = 0, shakeEl = $('stage');
  function frame(ts) {
    var dt = Math.min(50, ts - last || 16); last = ts;
    if (S.screen === 'game' && S.P) {
      if (!S.paused && !S.done) {
        if (S.countdown > 0) {
          S.countdown -= dt;
          var n = Math.ceil(S.countdown / 900);
          if (n !== S.lastBeep) { S.lastBeep = n; if (n > 0 && n <= 3) Sfx.play('beep'); else Sfx.play('go'); }
          if (S.countdown <= 0) { S.countdown = 0; }
        } else {
          var m = MODES[S.mode];
          Input.update(dt);
          if (S.O && !S.O.over) {
            var lvl = Math.min(12, 1 + Math.floor(S.P.time / 25000));
            S.P.level = lvl; S.O.level = lvl;
          }
          handleP(S.P.update(dt));
          if (S.O) { S.bot.update(dt); handleO(S.O.update(dt)); }
          if (!S.done) {
            if (S.P.over) finish('over');
            else if (S.O && S.O.over) finish('win');
            else if (m.goal && S.P.lines >= m.goal) finish('goal');
            else if (m.limit && S.P.time >= m.limit) finish('time');
          }
        }
      }
      render(dt);
      var sh = S.fx.shake;
      if (sh > 0.2) { shakeEl.style.transform = 'translate(' + ((Math.random() - 0.5) * sh).toFixed(1) + 'px,' + ((Math.random() - 0.5) * sh).toFixed(1) + 'px)'; S.fx.shake *= Math.pow(0.5, dt / 60); }
      else if (sh !== 0) { S.fx.shake = 0; shakeEl.style.transform = ''; }
    }
    requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------- UI wiring
  document.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target.closest('button, [data-mode]') : null;
    if (!t) return;
    Sfx.init();
    if (t.dataset.mode) { startGame(t.dataset.mode); return; }
    if (t.dataset.diff) { save.settings.diff = t.dataset.diff; persist(); renderMenu(); return; }
    if (t.dataset.skin) { if (!t.disabled) { save.settings.skin = t.dataset.skin; persist(); applySkin(); renderSettings(); } return; }
    switch (t.id) {
      case 'goStats': show('stats'); break;
      case 'goSettings': resetArmed = false; show('settings'); break;
      case 'backStats': case 'backSettings': show('menu'); break;
      case 'pauseBtn': togglePause(); break;
      case 'quitBtn': leaveGame(); break;
      case 'rResume': togglePause(); break;
      case 'rRetry': startGame(S.mode); break;
      case 'rMenu': leaveGame(); break;
      case 'resetBtn':
        if (!resetArmed) { resetArmed = true; renderSettings(); setTimeout(function () { resetArmed = false; if (S.screen === 'settings') renderSettings(); }, 4000); }
        else { save = defaults(); persist(); resetArmed = false; applySkin(); renderSettings(); }
        break;
    }
  });
  $('das').addEventListener('input', function () { save.settings.das = +this.value; $('dasV').textContent = this.value + ' ms'; persist(); });
  $('arr').addEventListener('input', function () { save.settings.arr = +this.value; $('arrV').textContent = this.value + ' ms'; persist(); });
  $('optGhost').addEventListener('change', function () { save.settings.ghost = this.checked; persist(); });
  $('optSound').addEventListener('change', function () { save.settings.sound = this.checked; persist(); Sfx.init(); Sfx.play('beep'); });
  $('optVib').addEventListener('change', function () { save.settings.vibrate = this.checked; persist(); buzz(30); });

  if (!skinUnlocked(save.settings.skin)) save.settings.skin = 'classic';
  applySkin();
  show('menu');
  requestAnimationFrame(frame);
  window.TetrApp = { S: S, save: function () { return save; }, start: startGame, Input: Input };
})();
