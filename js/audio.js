// Sound and music, all synthesised in the browser with WebAudio: no recordings, nothing copied.
// Nothing runs until the player's first click or key press (browsers require that). The game only drops
// requests into small counters; a timer a few times a second turns them into sounds, so drawing never waits.
const Sound = (() => {
  let ac = null, master = null, musicBus = null, sfxBus = null, verb = null, noise = null;
  const prefs = () => (typeof Menu !== 'undefined' && Menu.prefs) ? Menu.prefs() : { soundOn: true, volMaster: 70, volMusic: 45, volSfx: 70 };
  const lvl = v => Math.pow(Math.max(0, Math.min(100, v)) / 100, 2);   // sliders feel even to the ear
  function apply() {
    if (!ac) return;
    const p = prefs(), t = ac.currentTime;
    master.gain.setTargetAtTime(p.soundOn === false ? 0 : lvl(p.volMaster) * 0.9, t, 0.05);
    musicBus.gain.setTargetAtTime(lvl(p.volMusic) * 1.3, t, 0.2);
    sfxBus.gain.setTargetAtTime(lvl(p.volSfx), t, 0.05);
  }
  // a sense of open space, made from two delays that feed back into each other through a soft filter.
  // A real convolution hall sounds better but costs far more than the game can spare on a weak machine.
  function makeVerb() {
    const inp = ac.createGain();
    const mix = ac.createGain();
    for (const [ms, g] of [[57, 0.42], [89, 0.36]]) {
      const d = ac.createDelay(0.5); d.delayTime.value = ms / 1000;
      const fb = ac.createGain(); fb.gain.value = g;
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
      inp.connect(d); d.connect(lp); lp.connect(fb); fb.connect(d); lp.connect(mix);
    }
    return { in: inp, out: mix };
  }
  function unlock() {
    if (ac) { if (ac.state === 'suspended' && !document.hidden) ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    try { ac = new AC({ latencyHint: 'playback' }); } catch (e) { return; }
    master = ac.createGain(); master.connect(ac.destination);
    const comp = ac.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.connect(master);
    musicBus = ac.createGain(); musicBus.connect(comp);
    sfxBus = ac.createGain(); sfxBus.connect(comp);
    const V = makeVerb(); verb = V.in; const vg = ac.createGain(); vg.gain.value = 0.5; V.out.connect(vg); vg.connect(comp);
    const n = ac.sampleRate * 2; noise = ac.createBuffer(1, n, ac.sampleRate);
    const d = noise.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    apply();
    timer = setInterval(tick, 180);
    document.addEventListener('visibilitychange', () => { if (!ac) return; if (document.hidden) ac.suspend(); else ac.resume(); });
  }

  // ---------- building blocks ----------
  function env(g, t, a, peak, dec) { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); }
  function out(node, pan, wet) {
    let o = node;
    if (pan && ac.createStereoPanner) { const p = ac.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); o.connect(p); o = p; }
    o.connect(sfxBus);
    if (wet) { const w = ac.createGain(); w.gain.value = wet; o.connect(w); w.connect(verb); }
  }
  function burst(t, { type = 'bandpass', f = 1000, q = 1, f1 = 0, a = 0.002, dec = 0.1, vol = 0.5, pan = 0, wet = 0.2 }) {
    const s = ac.createBufferSource(); s.buffer = noise; s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
    if (f1) fl.frequency.exponentialRampToValueAtTime(f1, t + a + dec);
    const g = ac.createGain(); env(g, t, a, vol, dec);
    s.connect(fl); fl.connect(g); out(g, pan, wet);
    s.start(t, Math.random() * 1.5); s.stop(t + a + dec + 0.05);
  }
  function tone(t, { wave = 'sine', f = 440, f1 = 0, a = 0.005, dec = 0.3, vol = 0.3, pan = 0, wet = 0.2, lp = 0, bus = null, det = 0 }) {
    const o = ac.createOscillator(); o.type = wave; o.frequency.setValueAtTime(f, t); if (det) o.detune.value = det;
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + a + dec);
    const g = ac.createGain(); env(g, t, a, vol, dec);
    let n = o; if (lp) { const fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = lp; o.connect(fl); n = fl; }
    n.connect(g);
    if (bus) { g.connect(bus); if (wet) { const w = ac.createGain(); w.gain.value = wet; g.connect(w); w.connect(verb); } } else out(g, pan, wet);
    o.start(t); o.stop(t + a + dec + 0.05);
  }

  // ---------- battle sounds, by weapon ----------
  const R = () => Math.random();
  const SFX = {
    rifle(t, p, v, era) {
      const n = era === 'modern-2026' ? 3 + Math.floor(R() * 4) : 1 + Math.floor(R() * 2);   // modern: short bursts
      for (let i = 0; i < n; i++) burst(t + i * (era === 'modern-2026' ? 0.07 : 0.18 + R() * 0.2), { f: 1400 + R() * 600, q: 0.8, dec: 0.07, vol: 0.32 * v, pan: p, wet: 0.35 });
    },
    musket(t, p, v) { for (let i = 0; i < 4; i++) burst(t + R() * 0.25, { f: 700 + R() * 400, q: 0.7, dec: 0.18, vol: 0.3 * v, pan: p + (R() - 0.5) * 0.3, wet: 0.5 }); },
    shell(t, p, v) {
      burst(t, { type: 'lowpass', f: 900, f1: 120, dec: 0.5, vol: 0.55 * v, pan: p, wet: 0.5 });
      tone(t, { f: 90, f1: 40, dec: 0.4, vol: 0.5 * v, pan: p, wet: 0.3 });
      burst(t + 0.35 + R() * 0.2, { type: 'lowpass', f: 1600, f1: 200, dec: 0.7, vol: 0.4 * v, pan: p * 1.2, wet: 0.6 });
    },
    cannon(t, p, v) {
      burst(t, { type: 'lowpass', f: 700, f1: 80, dec: 1.0, vol: 0.6 * v, pan: p, wet: 0.7 });
      tone(t, { f: 70, f1: 32, dec: 0.7, vol: 0.55 * v, pan: p, wet: 0.4 });
    },
    arrow(t, p, v) { for (let i = 0; i < 3; i++) burst(t + i * 0.06 + R() * 0.05, { f: 2400, f1: 900, q: 3, a: 0.12, dec: 0.25, vol: 0.12 * v, pan: p, wet: 0.3 }); },
    stone(t, p, v) { tone(t, { f: 160, f1: 60, dec: 0.25, vol: 0.4 * v, pan: p, wet: 0.4 }); burst(t, { type: 'lowpass', f: 500, dec: 0.25, vol: 0.3 * v, pan: p }); },
    melee(t, p, v) {
      // swords and spears: a ring of clashing metal over the din
      const base = 900 + R() * 900;
      for (const m of [1, 2.76, 5.4]) tone(t, { f: base * m, dec: 0.18 + R() * 0.2, vol: 0.06 * v / m, pan: p, wet: 0.4 });
      burst(t, { f: 3000, q: 1.5, dec: 0.04, vol: 0.2 * v, pan: p });
    },
    drone(t, p, v) {
      const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(190 + R() * 40, t);
      const lfo = ac.createOscillator(); lfo.frequency.value = 23; const lg = ac.createGain(); lg.gain.value = 12; lfo.connect(lg); lg.connect(o.frequency);
      const fl = ac.createBiquadFilter(); fl.type = 'bandpass'; fl.frequency.value = 900; fl.Q.value = 2;
      const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.09 * v, t + 0.4); g.gain.linearRampToValueAtTime(0.0001, t + 1.1);
      o.connect(fl); fl.connect(g); out(g, p, 0.3); o.start(t); lfo.start(t); o.stop(t + 1.2); lfo.stop(t + 1.2);
      burst(t + 1.1, { type: 'lowpass', f: 1400, f1: 150, dec: 0.5, vol: 0.45 * v, pan: p, wet: 0.5 });
    },
    rocket(t, p, v) {
      for (let i = 0; i < 4; i++) burst(t + i * 0.12, { f: 600, f1: 2600, q: 2, a: 0.05, dec: 0.5, vol: 0.12 * v, pan: p, wet: 0.3 });
      for (let i = 0; i < 4; i++) burst(t + 1.0 + i * 0.15 + R() * 0.1, { type: 'lowpass', f: 1200, f1: 120, dec: 0.6, vol: 0.35 * v, pan: p + (R() - 0.5) * 0.4, wet: 0.6 });
    }
  };
  const eraId = () => (typeof Eras !== 'undefined' && Eras.info() ? Eras.info().id : '');
  const want = new Map();   // style -> [count, summed pan]
  function fire(style, type, sx) {
    if (!ac || ac.state !== 'running') return;
    const u = typeof UNIT_TYPES !== 'undefined' && UNIT_TYPES[type];
    if (u && u.drone) style = 'drone'; else if (u && u.look === 'mlrs') style = 'rocket';
    else if (style === 'melee' && /greatwar|ww2|modern/.test(eraId())) style = u && (u.armor || u.look === 'spg') ? 'shell' : 'rifle';   // modern models fight with guns
    const w = want.get(style) || [0, 0];
    w[0]++; w[1] += sx; want.set(style, w);
  }
  const last = {};
  const GAP = { rifle: 0.25, musket: 0.9, shell: 1.1, cannon: 1.3, arrow: 0.8, stone: 1.2, melee: 0.22, drone: 2.5, rocket: 3 };
  function playBattle() {
    if (!want.size) return;
    const t = ac.currentTime, W = window.innerWidth || 1, era = typeof Eras !== 'undefined' && Eras.info() ? Eras.info().id : '';
    let played = 0;
    for (const [st, [n, ps]] of [...want.entries()].sort((a, b) => b[1][0] - a[1][0])) {
      if (played >= 2 || t - (last[st] || 0) < GAP[st] * (0.7 + R() * 0.6)) continue;
      last[st] = t; played++;
      const pan = (ps / n / W - 0.5) * 1.4, v = Math.min(1, 0.45 + Math.log2(1 + n) * 0.12);
      SFX[st](t + 0.02 + R() * 0.08, pan, v, era);
    }
    want.clear();
  }

  // ---------- interface sounds ----------
  function click() { if (!ac || ac.state !== 'running') return; const t = ac.currentTime; tone(t, { wave: 'triangle', f: 1500, f1: 900, dec: 0.05, vol: 0.12, wet: 0 }); }
  function alarm() {
    // lost land: a falling two-note horn, three times, in step with the banner
    if (!ac || ac.state !== 'running') return;
    const t = ac.currentTime + 0.02;
    for (let i = 0; i < 3; i++) for (const [k, f] of [[0, 523], [1, 392]]) {
      const s = t + i * 0.62 + k * 0.24;
      tone(s, { wave: 'sawtooth', f, a: 0.02, dec: 0.26, vol: 0.16, lp: 1700, wet: 0.3 });
      tone(s, { wave: 'square', f: f / 2, a: 0.02, dec: 0.26, vol: 0.06, lp: 900, wet: 0.2 });
    }
  }
  function notice(kind) {
    if (!ac || ac.state !== 'running') return;
    const t = ac.currentTime + 0.02;
    if (kind === 'win') [523, 659, 784].forEach((f, i) => tone(t + i * 0.09, { wave: 'triangle', f, dec: 0.35, vol: 0.1, wet: 0.4 }));
    else if (kind === 'loss') [392, 311].forEach((f, i) => tone(t + i * 0.16, { wave: 'triangle', f, dec: 0.4, vol: 0.1, wet: 0.4 }));
    else if (kind === 'war') { for (let i = 0; i < 6; i++) tone(t + i * 0.11, { f: 110, f1: 60, dec: 0.25, vol: 0.3 - i * 0.03, wet: 0.5 }); tone(t + 0.7, { wave: 'sawtooth', f: 147, a: 0.08, dec: 1.0, vol: 0.12, lp: 800, wet: 0.5 }); }
  }

  // ---------- music: a small composer per era, playing new phrases in the era's mode and instruments ----------
  const M = {
    menu:              { bpm: 62, root: 45, mode: [0, 2, 3, 5, 7, 8, 10], prog: [0, 5, 3, 4], lead: 'strings', bass: 'cello', drums: 'timpani', pad: 'strings' },
    'greece-431bc':    { bpm: 84, root: 52, mode: [0, 1, 3, 5, 7, 8, 10], prog: [0, 6, 0, 3], lead: 'lyre', bass: 'drone', drums: 'frame', pad: null },
    'rome-117':        { bpm: 92, root: 48, mode: [0, 2, 4, 5, 7, 9, 10], prog: [0, 6, 3, 4], lead: 'horn', bass: 'drone', drums: 'war', pad: 'choir' },
    'medieval-1200':   { bpm: 76, root: 50, mode: [0, 2, 3, 5, 7, 9, 10], prog: [0, 6, 3, 0], lead: 'recorder', bass: 'drone', drums: 'frame', pad: 'organ' },
    'napoleonic-1805': { bpm: 108, root: 53, mode: [0, 2, 4, 5, 7, 9, 11], prog: [0, 3, 4, 0], lead: 'fife', bass: 'pluck', drums: 'snare', pad: 'strings' },
    'greatwar-1917':   { bpm: 66, root: 46, mode: [0, 2, 3, 5, 7, 8, 10], prog: [0, 5, 2, 4], lead: 'strings', bass: 'cello', drums: 'timpani', pad: 'strings' },
    'ww2-1936':        { bpm: 88, root: 45, mode: [0, 2, 3, 5, 7, 8, 11], prog: [0, 3, 5, 4], lead: 'horn', bass: 'cello', drums: 'snare', pad: 'strings' },
    'modern-2026':     { bpm: 96, root: 43, mode: [0, 2, 3, 5, 7, 8, 10], prog: [0, 5, 6, 4], lead: 'synth', bass: 'pulse', drums: 'kit', pad: 'synth' }
  };
  const hz = m => 440 * Math.pow(2, (m - 69) / 12);
  const note = (S, deg, oct = 0) => S.root + 12 * (oct + Math.floor(deg / 7)) + S.mode[((deg % 7) + 7) % 7];
  function voice(kind, t, m, dur, vol) {
    const f = hz(m), b = musicBus;
    switch (kind) {
      case 'lyre': tone(t, { wave: 'triangle', f, dec: 1.2, vol: vol * 0.5, bus: b, wet: 0.5 }); tone(t, { f: f * 2, dec: 0.5, vol: vol * 0.15, bus: b, wet: 0.5 }); break;
      case 'horn': tone(t, { wave: 'sawtooth', f, a: 0.08, dec: dur * 1.1, vol: vol * 0.28, lp: 1100, bus: b, wet: 0.6 }); break;
      case 'recorder': tone(t, { wave: 'sine', f: f * 2, a: 0.05, dec: dur, vol: vol * 0.35, bus: b, wet: 0.6 }); tone(t, { wave: 'triangle', f: f * 2, a: 0.05, dec: dur, vol: vol * 0.08, bus: b, wet: 0.5, det: 6 }); break;
      case 'fife': tone(t, { wave: 'square', f: f * 2, a: 0.02, dec: dur * 0.8, vol: vol * 0.07, lp: 3200, bus: b, wet: 0.4 }); break;
      case 'strings': tone(t, { wave: 'sawtooth', f, a: Math.min(0.4, dur * 0.4), dec: dur * 1.2, vol: vol * 0.2, lp: 1400, det: -6, bus: b, wet: 0.8 }); break;
      case 'synth': tone(t, { wave: 'square', f, a: 0.01, dec: dur * 0.7, vol: vol * 0.1, lp: 1800, bus: b, wet: 0.5 }); tone(t + 0.375 * 60 / 96, { wave: 'square', f, a: 0.01, dec: dur * 0.5, vol: vol * 0.04, lp: 1500, bus: b, wet: 0.7 }); break;
      case 'drone': tone(t, { wave: 'sawtooth', f: f / 2, a: 1.0, dec: dur, vol: vol * 0.08, lp: 500, bus: b, wet: 0.6 }); break;
      case 'cello': tone(t, { wave: 'sawtooth', f: f / 2, a: 0.25, dec: dur * 1.1, vol: vol * 0.16, lp: 600, bus: b, wet: 0.6 }); break;
      case 'pluck': tone(t, { wave: 'triangle', f: f / 2, dec: 0.5, vol: vol * 0.35, bus: b, wet: 0.3 }); break;
      case 'pulse': for (let i = 0; i < 4; i++) tone(t + i * dur / 4, { wave: 'sawtooth', f: f / 2, dec: dur / 5, vol: vol * 0.12, lp: 420, bus: b, wet: 0.1 }); break;
      case 'choir': tone(t, { wave: 'triangle', f, a: 0.8, dec: dur, vol: vol * 0.18, det: -4, bus: b, wet: 0.9 }); break;
      case 'organ': tone(t, { wave: 'sine', f, a: 0.3, dec: dur, vol: vol * 0.12, bus: b, wet: 0.7 }); tone(t, { wave: 'sine', f: f * 1.5, a: 0.3, dec: dur, vol: vol * 0.05, bus: b, wet: 0.7 }); break;
    }
  }
  function hit(kind, t, vol) {
    const b = musicBus;
    const nz = (o) => { const s = ac.createBufferSource(); s.buffer = noise; const fl = ac.createBiquadFilter(); fl.type = o.type || 'bandpass'; fl.frequency.value = o.f; fl.Q.value = o.q || 1; const g = ac.createGain(); env(g, t, 0.002, o.vol, o.dec); s.connect(fl); fl.connect(g); g.connect(b); const w = ac.createGain(); w.gain.value = 0.3; g.connect(w); w.connect(verb); s.start(t, R()); s.stop(t + o.dec + 0.05); };
    if (kind === 'kick') tone(t, { f: 110, f1: 45, dec: 0.3, vol: vol * 0.6, bus: b });
    else if (kind === 'timpani') tone(t, { f: 82, f1: 70, dec: 1.2, vol: vol * 0.5, bus: b, wet: 0.6 });
    else if (kind === 'snare') nz({ f: 1800, q: 0.7, vol: vol * 0.22, dec: 0.12 });
    else if (kind === 'frame') { tone(t, { f: 140, f1: 90, dec: 0.25, vol: vol * 0.3, bus: b, wet: 0.4 }); nz({ f: 900, vol: vol * 0.06, dec: 0.08 }); }
    else if (kind === 'hat') nz({ type: 'highpass', f: 7000, vol: vol * 0.06, dec: 0.04 });
  }
  const DRUMS = {   // 16 steps per bar: [step, sound, volume]
    timpani: [[0, 'timpani', 0.7], [10, 'timpani', 0.35], [12, 'timpani', 0.45]],
    frame: [[0, 'frame', 0.8], [6, 'frame', 0.4], [8, 'frame', 0.6], [11, 'frame', 0.3], [14, 'frame', 0.4]],
    war: [[0, 'timpani', 0.8], [4, 'kick', 0.4], [8, 'timpani', 0.6], [12, 'kick', 0.4], [14, 'kick', 0.3]],
    snare: [[0, 'kick', 0.5], [4, 'snare', 0.6], [6, 'snare', 0.3], [7, 'snare', 0.3], [8, 'kick', 0.4], [12, 'snare', 0.6], [14, 'snare', 0.3], [15, 'snare', 0.4]],
    kit: [[0, 'kick', 0.8], [2, 'hat', 0.6], [4, 'snare', 0.5], [6, 'hat', 0.6], [7, 'kick', 0.4], [8, 'kick', 0.6], [10, 'hat', 0.6], [12, 'snare', 0.5], [14, 'hat', 0.6]]
  };
  const song = { key: '', S: null, next: 0, bar: 0, step: 0, deg: 0, rest: 0, fade: 1 };
  function themeKey() {
    if (typeof Menu !== 'undefined' && Menu.isOpen && Menu.isOpen()) return 'menu';
    const id = typeof Eras !== 'undefined' && Eras.info() && Eras.info().id;
    return M[id] ? id : 'ww2-1936';
  }
  function tense() {   // drums sound when the player is at war or fighting
    const G = typeof Sim !== 'undefined' && Sim.G;
    if (!G || !G.wars) return false;
    return G.wars.some(w => w.attackers.includes(G.player) || w.defenders.includes(G.player));
  }
  function music() {
    const k = themeKey(), t = ac.currentTime;
    if (k !== song.key) {
      // a new theme: let the old one ring out, start the new one after a short breath
      song.key = k; song.S = M[k]; song.bar = 0; song.step = 0; song.deg = 0; song.next = Math.max(t + 1.2, song.next);
      musicBus.gain.cancelScheduledValues(t); musicBus.gain.setTargetAtTime(0.0001, t, 0.3); musicBus.gain.setTargetAtTime(lvl(prefs().volMusic) * 1.3, t + 1.2, 0.5);
    }
    if (song.next < t) song.next = t + 0.05;
    const S = song.S, st = 60 / S.bpm / 4, drums = tense() || k === 'menu';
    while (song.next < t + 0.9) {
      const s = song.step, T = song.next, chord = S.prog[song.bar % S.prog.length];
      if (s === 0) {
        if (S.pad) [0, 4].forEach(i => voice(S.pad, T, note(S, chord + i), st * 16, 0.55));
        voice(S.bass, T, note(S, chord, -1), st * (S.bass === 'pulse' ? 4 : 16), 0.8);
        if (song.bar % 8 === 7) song.rest = 16;   // breathe every eighth bar
      }
      if (S.bass === 'pulse' && s % 4 === 0 && s) voice('pulse', T, note(S, chord, -1), st * 4, 0.8);
      if (S.bass === 'pluck' && s === 8) voice('pluck', T, note(S, chord + 4, -1), st * 4, 0.7);
      if (drums) for (const [ds, kind, v] of DRUMS[S.drums]) if (ds === s) hit(kind, T, v);
      // the tune: a wandering line that leans on the chord's notes
      if (song.rest > 0) song.rest--;
      else if (s % 2 === 0 && R() < (S.bpm > 100 ? 0.75 : 0.55)) {
        const toward = chord + [0, 2, 4][Math.floor(R() * 3)];
        song.deg += Math.sign(toward - song.deg) * (R() < 0.6 ? 1 : 0) + (R() < 0.2 ? (R() < 0.5 ? -1 : 1) : 0);
        song.deg = Math.max(-2, Math.min(9, song.deg));
        const len = R() < 0.35 ? 4 : R() < 0.6 ? 2 : 6;
        voice(S.lead, T, note(S, song.deg, 1), st * len, 0.55);
        song.rest = len - 1;
      }
      song.next += st; song.step = (s + 1) % 16; if (!song.step) song.bar++;
    }
  }

  let timer = 0, lastTick = 0, busy = 0;
  function tick() {
    if (!ac || ac.state !== 'running') return;
    // the game's own frames come first: when a frame is running late, this turn is skipped and the music
    // simply plays on from what was already scheduled (it is written half a second ahead)
    const t = performance.now(), late = lastTick ? t - lastTick - 180 : 0;
    lastTick = t;
    busy = late > 60 ? Math.min(3, busy + 1) : Math.max(0, busy - 1);
    try {
      if (busy < 2) playBattle(); else want.clear();
      if (prefs().volMusic > 0 && prefs().soundOn !== false) music(); else { song.next = 0; want.clear(); }
    } catch (e) { console.error(e); }
  }
  function init() {
    const go = () => unlock();
    window.addEventListener('pointerdown', go, true);
    window.addEventListener('keydown', go, true);
    // a soft tick for buttons and tabs
    document.addEventListener('click', e => { if (e.target.closest && e.target.closest('button, .row.click, [data-tab], label.check, a.lnk')) click(); }, true);
  }
  return { init, unlock, apply, fire, click, alarm, notice, get ctx() { return ac; }, get _out() { return master; }, _song: song };
})();
