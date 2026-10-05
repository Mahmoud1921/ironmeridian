// Each era gives the player one main goal and a couple of side goals, with a date to reach them by.
// The targets grow out of the nation the player picked, so a small country is not asked to do a great
// power's work. Reaching the main goal wins the game; the date passing without it loses it. Either way the
// player may carry on afterwards, and the game says so.
const Goals = (() => {
  const G = () => Sim.G;
  const start = () => (G() && G().goals) || null;

  // ---------- what a goal can ask for ----------
  // Each kind reads the game and returns how far along the player is, as a number against a target.
  const KIND = {
    provinces: {
      now: () => G().owner.reduce((n, t) => n + (t === G().player), 0),
      text: t => 'Hold ' + t + ' provinces'
    },
    capitals: {
      now: () => {
        const g = G(), me = g.player; let n = 0;
        for (const tag in g.countries) { const c = g.countries[tag]; if (tag !== me && c.capital >= 0 && g.owner[c.capital] === me) n++; }
        return n;
      },
      text: t => 'Take ' + t + ' enemy capital' + (t === 1 ? '' : 's')
    },
    battles: { now: () => G().stats.battlesWon, text: t => 'Win ' + t + ' battles' },
    techs: { now: () => (G().countries[G().player].techs || []).length, text: (t, more) => more ? 'Research ' + t + ' more technologies' : 'Research ' + t + ' technologies' },
    allies: {
      now: () => { const g = G(); let n = 0; for (const tag in g.countries) if (tag !== g.player && g.countries[tag].alive && Sim.allied(tag, g.player)) n++; return n; },
      text: (t, more) => more ? 'Win over ' + t + ' new all' + (t === 1 ? 'y' : 'ies') : 'Stand with ' + t + ' all' + (t === 1 ? 'y' : 'ies')
    },
    gold: {
      now: () => { const e = G().countries[G().player].eco; return Math.max(0, Math.round(e ? e.gold : 0)); },
      text: (t, more) => more ? 'Put aside ' + t.toLocaleString() + ' gold more than you began with' : 'Put ' + t.toLocaleString() + ' gold in the treasury'
    },
    industry: {
      now: () => { const g = G(), me = g.player; let n = 0; for (let p = 0; p < g.owner.length; p++) { if (g.owner[p] !== me) continue; const I = g.ind[p]; if (I) for (const k of Economy.KIND_KEYS) n += I[k] || 0; } return n; },
      text: (t, more) => more ? 'Build ' + t + ' new works and factories' : 'Build ' + t + ' works and factories'
    }
  };

  // ---------- the eras ----------
  // grow: how much bigger the player's lands must become; plus: provinces on top of that.
  // A side goal with `of` scales with the starting size too, within its own floor and ceiling.
  const ERAS = {
    'greece-431bc': {
      until: -403, name: 'Hegemon of Greece',
      note: 'The long war between Athens and Sparta decides who leads the Greek world. Make it you.',
      main: { kind: 'provinces', grow: 2, plus: 2 },
      sides: [{ kind: 'capitals', n: 1, name: 'Humble a rival', note: 'Take the home city of another power.' },
              { kind: 'battles', n: 8, name: 'Proven in the phalanx', note: 'Win eight battles in the field.' }]
    },
    'rome-117': {
      until: 180, name: 'Guard the Eagles',
      note: 'Rome stands at its greatest reach. Hold what Trajan won, and push the frontier further.',
      main: { kind: 'provinces', grow: 1.35, plus: 4 },
      sides: [{ kind: 'techs', n: 6, name: 'Roads, law and engines', note: 'Finish six technologies.' },
              { kind: 'battles', n: 12, name: 'The legions hold', note: 'Win twelve battles.' }]
    },
    'medieval-1200': {
      until: 1300, name: 'Crown a Kingdom',
      note: 'Knights, castles and oaths. Gather enough land, and a crown follows.',
      main: { kind: 'provinces', grow: 2, plus: 3 },
      sides: [{ kind: 'capitals', n: 2, name: 'Two crowns broken', note: 'Hold the seats of two other rulers.' },
              { kind: 'gold', n: 4000, name: 'A full treasury', note: 'Gold buys both mercenaries and loyalty.' }]
    },
    'napoleonic-1805': {
      until: 1820, name: 'Master of Europe',
      note: 'The age of grand armies. Beat the coalitions, or be beaten by them.',
      main: { kind: 'provinces', grow: 2, plus: 4 },
      sides: [{ kind: 'capitals', n: 3, name: 'Three capitals entered', note: 'March into three enemy capitals.' },
              { kind: 'battles', n: 15, name: 'A soldier\'s reputation', note: 'Win fifteen battles.' }]
    },
    'greatwar-1917': {
      until: 1921, name: 'Win the Great War',
      note: 'The trenches have not moved in two years. Break them, and end the war on your terms.',
      main: { kind: 'provinces', grow: 1.4, plus: 6 },
      sides: [{ kind: 'battles', n: 18, name: 'Through the wire', note: 'Win eighteen battles.' },
              { kind: 'techs', n: 8, name: 'The new weapons', note: 'Finish eight technologies.' }]
    },
    'ww2-1936': {
      until: 1950, name: 'A New Order',
      note: 'The storm is gathering. Come out of it as the power the others answer to.',
      main: { kind: 'provinces', grow: 2.2, plus: 5 },
      sides: [{ kind: 'capitals', n: 3, name: 'Three capitals taken', note: 'Hold three enemy capitals.' },
              { kind: 'industry', n: 14, name: 'The arsenal', note: 'Build fourteen works and factories.' }]
    },
    'modern-2026': {
      until: 2040, name: 'Hold the Line',
      note: 'Drones, chips and alliances. Keep what is yours, and take back what is not.',
      main: { kind: 'provinces', grow: 1.25, plus: 5 },
      sides: [{ kind: 'allies', n: 3, name: 'Friends who answer', note: 'Keep three allies at your side.' },
              { kind: 'techs', n: 10, name: 'The edge in chips', note: 'Finish ten technologies.' }]
    }
  };
  const eraId = () => (typeof Eras !== 'undefined' && Eras.info() ? Eras.info().id : 'ww2-1936');
  const def = () => ERAS[eraId()] || ERAS['ww2-1936'];

  // the hour the deadline falls on, counted from the era's own start
  function deadlineHour(untilYear) {
    const d = new Date(Sim.dateTime());
    const start0 = Sim.dateTime() - G().hour * 3600e3;
    const end = Date.UTC(untilYear, 0, 1);
    return Math.max(24 * 365, Math.round((end - start0) / 3600e3));
  }

  // ---------- set up, once, when a game begins ----------
  // what the nation already has when it starts: those goals count only what the player adds
  const FROM_START = { industry: 1, techs: 1, gold: 1, allies: 1 };
  function begin() {
    const g = G(); if (!g || g.goals) return;
    const D = def(), own = g.owner.reduce((n, t) => n + (t === g.player), 0);
    const mainTarget = Math.max(own + 2, Math.round(own * D.main.grow) + (D.main.plus || 0));
    g.goals = {
      era: eraId(), name: D.name, note: D.note, until: D.until, deadline: deadlineHour(D.until),
      startProvs: own, won: false, lost: false, told: {},
      main: { kind: D.main.kind, target: mainTarget, name: D.name, note: D.note, main: true },
      sides: D.sides.map(s => ({ kind: s.kind, target: s.n, base: FROM_START[s.kind] ? KIND[s.kind].now() : 0, name: s.name, note: s.note }))
    };
  }
  // an older save gets its goals the same way, from where it stands now
  function restore() { const g = G(); if (g && !g.goals) begin(); }

  function all() { const s = start(); return s ? [s.main].concat(s.sides) : []; }
  function progress(goal) {
    const K = KIND[goal.kind];
    const now = Math.max(0, (K ? K.now() : 0) - (goal.base || 0));
    return { now, target: goal.target, done: now >= goal.target, text: K ? K.text(goal.target, !!goal.base) : goal.kind, share: Math.max(0, Math.min(1, now / goal.target)) };
  }
  function daysLeft() { const s = start(); return s ? Math.max(0, Math.round((s.deadline - G().hour) / 24)) : 0; }
  function deadlineText() { const s = start(); return s ? Sim.dateStr(s.deadline) : ''; }

  // ---------- checked once a day ----------
  // hooks.goal(kind, goal) lets the interface cheer, warn, or end the game.
  const hooks = { goal: () => {}, won: () => {}, lost: () => {} };
  function daily() {
    const g = G(), s = start(); if (!s || g.over) return;
    for (const goal of all()) {
      const p = progress(goal);
      const key = goal.name;
      if (p.done && !s.told[key]) { s.told[key] = true; if (!goal.main) hooks.goal('side', goal, p); }
      else if (!p.done && s.told[key] && !goal.main) s.told[key] = false;   // an ally lost, a capital retaken
    }
    const m = progress(s.main);
    if (m.done && !s.won) { s.won = true; hooks.won(s, m); return; }
    const left = s.deadline - g.hour;
    if (!s.won && !s.lost) {
      for (const [d, k] of [[365, 'y1'], [90, 'd90']]) if (left <= d * 24 && left > 0 && !s.told[k]) { s.told[k] = true; hooks.goal('time', s.main, m, d); }
      if (left <= 0) { s.lost = true; hooks.lost(s, m); }
    }
  }
  return { begin, restore, daily, all, progress, daysLeft, deadlineText, hooks, info: start, KIND, ERAS };
})();
