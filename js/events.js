// Events: historical and everyday events that ask a nation to choose.
//
// EVENT_DEFS (js/events-data.js) is a list of plain objects:
//   id       unique string
//   era      era id or list of era ids ('ww2-1936', 'modern-2026', 'greatwar-1917', 'napoleonic-1805', 'medieval-1200', 'rome-117', 'greece-431bc'); omit for every era
//   title    short headline;  text: one to three sentences. Placeholders: {name} {capital} {coin} {food} {metal} {fuel} {strategic} {luxuries} {arms}
//   tag      who receives it: a tag or a list of tags (each alive one gets it once). Omit for an everyday event any nation can get.
//   date     [y, m, d] earliest date (historical events); until: [y, m, d] after which it lapses
//   mtth     mean days until it fires once allowed (everyday events: default 720; historical: fires on its date when omitted)
//   repeat   days before an everyday event can come back for the same nation (default 1500)
//   cond     conditions, all must hold (see check())
//   news     true: other nations hear about it (a line in the log)
//   options  [{ text, ai: weight (default 1), fx: { effects } }]  (1 to 3 options)
//
// Conditions: war, peace (bool); warWith, notWarWith, exists, notExists, sameFaction (tag); faction (bool);
//   gov (name or list: matches the government or its bloc); stabBelow, stabAbove, wsBelow, wsAbove, ppAbove, goldBelow, goldAbove (numbers);
//   short (good key: stock and supply below need); coastal (bool: has a port); minProvs, maxProvs; owns, notOwns (province name or list);
//   relAbove, relBelow ({ tag, v }); flag, notFlag (a flag this nation set); player (bool); losing (bool: war score below -25 in some war).
// Effects: pp, stab, ws (0..1 fractions), manpower, gold, arms, goods ({ food: 30, ... } stock days), rel ({ TAG: +20 }), relNeighbours,
//   mod ({ name, days, fx: [{ mod, value, ... }] } a timed modifier using the tech vocabulary), provs ({ names: [...], to: TAG|'self' }),
//   annex (tag), puppet (tag), war ({ on: TAG, name }), peace (tag), yieldTo (tag: a separate peace on its terms; it keeps what it holds), join (tag: join that nation's faction), leave (true), pact ({ with: TAG, years }),
//   army ({ divs, where: 'capital' }), gov (government name), flag (id), event ({ id, days } follow-up for the same nation).
'use strict';
const Events = (function () {
  const G = () => Sim.G, MAP = () => Sim.MAP;
  const DAY = 24;
  const hooks = { show: null };
  const eraId = () => typeof Eras === 'undefined' || Eras.isBase() ? 'ww2-1936' : Eras.info().id;
  let listEra = null, list = [], byId = {};
  function defs() {
    const e = eraId();
    if (listEra !== e) {
      listEra = e;
      list = (typeof EVENT_DEFS === 'undefined' ? [] : EVENT_DEFS).filter(d => !d.era || [].concat(d.era).includes(e));
      byId = Object.fromEntries(list.map(d => [d.id, d]));
    }
    return list;
  }
  const def = id => { defs(); return byId[id] || null; };
  function dateMs(ymd) { const d = new Date(Date.UTC(2000, ymd[1] - 1, ymd[2] || 1)); d.setUTCFullYear(ymd[0]); return d.getTime(); }

  function setup() {
    G().ev = { fired: {}, cd: {}, open: [], hist: [], queue: [], next: 1 };
  }
  const provByName = name => { const n = String(name).toLowerCase(); return MAP().provs.find(p => p.name.toLowerCase() === n) || null; };
  const alive = t => !!(G().countries[t] && G().countries[t].alive);

  // ---------- conditions ----------
  function check(c, cond) {
    if (!cond) return true;
    const g = G(), t = c.tag;
    const bloc = typeof Eras !== 'undefined' ? Eras.govClass(c.gov) : c.gov;
    const provsOwned = () => g.owner.reduce((n, o) => n + (o === t), 0);
    for (const k in cond) {
      const v = cond[k];
      switch (k) {
        case 'war': if (Sim.isAtWar(t) !== v) return false; break;
        case 'peace': if (Sim.isAtWar(t) === v) return false; break;
        case 'warWith': if (!alive(v) || !Sim.atWar(t, v)) return false; break;
        case 'notWarWith': if (alive(v) && Sim.atWar(t, v)) return false; break;
        case 'exists': if (!alive(v)) return false; break;
        case 'notExists': if (alive(v)) return false; break;
        case 'sameFaction': { const f = Sim.factionOf(t); if (!f || !f.members.includes(v)) return false; break; }
        case 'faction': if (!!Sim.factionOf(t) !== v) return false; break;
        case 'gov': if (![].concat(v).some(x => x === c.gov || x === bloc)) return false; break;
        case 'stabBelow': if (!(c.stab < v)) return false; break;
        case 'stabAbove': if (!(c.stab > v)) return false; break;
        case 'wsBelow': if (!(c.ws < v)) return false; break;
        case 'wsAbove': if (!(c.ws > v)) return false; break;
        case 'ppAbove': if (!(c.pp > v)) return false; break;
        case 'goldBelow': if (!(c.eco && c.eco.gold < v)) return false; break;
        case 'goldAbove': if (!(c.eco && c.eco.gold > v)) return false; break;
        case 'short': { const e = c.eco; if (!e || !e.sat || !(e.sat[v] < 0.9)) return false; break; }
        case 'coastal': if (typeof Economy === 'undefined' || !MAP().provs.some(p => g.owner[p.id] === t && Economy.infra(p.id, 'port')) === v) return false; break;
        case 'minProvs': if (provsOwned() < v) return false; break;
        case 'maxProvs': if (provsOwned() > v) return false; break;
        case 'owns': for (const n of [].concat(v)) { const p = provByName(n); if (!p || g.owner[p.id] !== t) return false; } break;
        case 'notOwns': for (const n of [].concat(v)) { const p = provByName(n); if (p && g.owner[p.id] === t) return false; } break;
        case 'relAbove': if (!alive(v.tag) || Diplo.rel(t, v.tag) <= v.v) return false; break;
        case 'relBelow': if (!alive(v.tag) || Diplo.rel(t, v.tag) >= v.v) return false; break;
        case 'flag': if (!(c.flags && c.flags[v] !== undefined)) return false; break;
        case 'notFlag': if (c.flags && c.flags[v] !== undefined) return false; break;
        case 'player': if (Sim.isHuman(t) !== v) return false; break;
        case 'losing': { const bad = g.wars.some(w => { const s = Sim.sideOf(w, t); if (!s) return false; const e = s === 'att' ? w.leaderD : w.leaderA; return alive(e) && Diplo.warScore(t, e) < -25; }); if (bad !== v) return false; break; }
      }
    }
    return true;
  }

  // ---------- text ----------
  function fill(s, tag) {
    const c = G().countries[tag];
    const cap = c && c.capital >= 0 ? MAP().provs[c.capital].name : '';
    const ECO = typeof Economy !== 'undefined';
    return String(s || '').replace(/\{(\w+)\}/g, (m, k) => {
      if (k === 'name') return c ? c.name : '';
      if (k === 'capital') return cap;
      if (k === 'coin') return ECO ? Economy.coin() : 'gold';
      if (ECO && (Economy.GOODS.includes(k) || k === 'arms')) return Economy.goodName(k).toLowerCase();
      if (G().countries[k]) return G().countries[k].name;
      return m;
    });
  }
  const pctS = v => (v > 0 ? '+' : '−') + Math.round(Math.abs(v) * 100) + '%';
  const numS = v => (v > 0 ? '+' : '−') + Math.abs(Math.round(v)).toLocaleString('en-US');
  const nm = t => G().countries[t] ? G().countries[t].name : t;
  // short plain lines saying what an option does
  function describe(fx, tag) {
    const out = [], ECO = typeof Economy !== 'undefined';
    const target = t => t === 'self' ? tag : t;
    for (const k in fx || {}) {
      const v = fx[k];
      switch (k) {
        case 'pp': out.push(numS(v) + ' political power'); break;
        case 'stab': out.push(pctS(v) + ' stability'); break;
        case 'ws': out.push(pctS(v) + ' war support'); break;
        case 'manpower': out.push(numS(v) + ' manpower'); break;
        case 'gold': out.push(numS(v) + ' ' + (ECO ? Economy.coin() : 'gold')); break;
        case 'arms': out.push(numS(v) + ' ' + (ECO ? Economy.goodName('arms').toLowerCase() : 'equipment')); break;
        case 'goods': for (const gk in v) out.push(numS(v[gk]) + ' days of ' + (ECO ? Economy.goodName(gk).toLowerCase() : gk)); break;
        case 'rel': for (const t in v) if (alive(t)) out.push((v[t] > 0 ? 'Better' : 'Worse') + ' relations with ' + nm(t) + ' (' + numS(v[t]) + ')'); break;
        case 'relNeighbours': out.push((v > 0 ? 'Better' : 'Worse') + ' relations with neighbours (' + numS(v) + ')'); break;
        case 'mod': out.push(v.name + ' for ' + (v.days >= 365 ? Math.round(v.days / 365 * 10) / 10 + ' years' : v.days + ' days') + ': ' + (typeof Politics !== 'undefined' ? Politics.fxText(v.fx) : '')); break;
        case 'provs': { const names = v.names.filter(n => provByName(n)); if (names.length) out.push(nm(target(v.to)) + ' gains ' + names.join(', ')); break; }
        case 'annex': if (alive(v)) out.push('Annex ' + nm(v)); break;
        case 'puppet': if (alive(v)) out.push(nm(v) + ' becomes a subject of ' + nm(tag)); break;
        case 'war': if (alive(v.on)) out.push('War with ' + nm(v.on)); break;
        case 'peace': if (alive(v)) out.push('Peace with ' + nm(v)); break;
        case 'yieldTo': if (alive(v)) out.push('Peace with ' + nm(v) + ', who keeps the land it holds'); break;
        case 'join': if (alive(v)) { const f = Sim.factionOf(v); out.push(f ? 'Join the ' + f.name : 'Closer ties with ' + nm(v)); } break;
        case 'leave': out.push('Leave your alliance'); break;
        case 'pact': if (alive(v.with)) out.push('Non-aggression pact with ' + nm(v.with)); break;
        case 'army': out.push('A new army of ' + v.divs + ' divisions'); break;
        case 'gov': out.push('Government becomes ' + v); break;
      }
    }
    return out.length ? out : ['No immediate effect'];
  }

  // ---------- effects ----------
  function apply(fx, tag) {
    const g = G(), c = g.countries[tag];
    if (!c || !c.alive) return;
    const target = t => t === 'self' ? tag : t;
    for (const k in fx || {}) {
      const v = fx[k];
      switch (k) {
        case 'pp': c.pp = Math.max(0, c.pp + v); break;
        case 'stab': c.stab = Math.max(0, Math.min(1, c.stab + v)); break;
        case 'ws': c.ws = Math.max(0, Math.min(1, c.ws + v)); break;
        case 'manpower': c.manpower = Math.max(0, c.manpower + v); break;
        case 'gold': if (c.eco) c.eco.gold += v; break;
        case 'arms': c.equipment = Math.max(0, c.equipment + v); break;
        case 'goods': if (c.eco && c.eco.stock) for (const gk in v) if (gk in c.eco.stock) c.eco.stock[gk] = Math.max(0, c.eco.stock[gk] + v[gk] * Math.max(1, c.eco.need[gk] || 1)); break;
        case 'rel': for (const t in v) if (alive(t)) Diplo.addRel(tag, t, v[t]); break;
        case 'relNeighbours': for (const t of Object.keys(g.countries)) if (t !== tag && g.countries[t].alive && Diplo.borders(tag, t)) Diplo.addRel(tag, t, v); break;
        case 'mod': if (typeof Politics !== 'undefined') Politics.addMod(tag, Object.assign({ id: 'ev:' + v.name }, v)); break;
        case 'provs': {
          const to = target(v.to);
          if (!alive(to)) break;
          for (const n of v.names) { const p = provByName(n); if (p && g.owner[p.id] !== to && !Sim.atWar(g.owner[p.id], to)) { g.owner[p.id] = to; } }
          g.ownVer++; Diplo.evacuate();
          break;
        }
        case 'annex': if (alive(v) && v !== tag) annex(v, tag); break;
        case 'puppet': if (alive(v) && v !== tag && !Sim.atWar(v, tag)) { const f = Sim.factionOf(v); if (f) Diplo.leaveFaction(v); g.countries[v].overlord = tag; Sim.relDirty(); } break;
        case 'war': if (alive(v.on) && !Sim.atWar(tag, v.on)) { const w = Sim.declareWar(tag, v.on, false, { breakPact: true }); if (w && v.name) w.name = v.name; } break;
        case 'peace': if (alive(v) && Sim.atWar(tag, v)) Diplo.makePeace(tag, v, false); break;
        // a separate peace on the other side's terms: it keeps what it occupies (Brest-Litovsk, the 1918 armistices)
        case 'yieldTo': if (alive(v) && Sim.atWar(tag, v)) Diplo.makePeace(v, tag, true); break;
        case 'join': if (alive(v) && !Sim.atWar(tag, v)) { const f = Sim.factionOf(v); if (f) Diplo.joinFactionWars(tag, f); else Diplo.addRel(tag, v, 30); } break;
        case 'leave': if (Sim.factionOf(tag)) Diplo.leaveFaction(tag); break;
        case 'pact': if (alive(v.with) && !Sim.atWar(tag, v.with)) g.dip.pacts[Sim.pairKey(Sim.root(tag), Sim.root(v.with))] = g.hour + (v.years || 2) * 365 * DAY; break;
        case 'army': spawnArmy(tag, v.divs || 2, v.at); break;
        case 'gov': if (GOV_BASE[v]) c.gov = v; break;
        case 'flag': (c.flags || (c.flags = {}))[v] = g.hour; break;
        case 'event': g.ev.queue.push({ id: v.id, tag, at: g.hour + (v.days || 1) * DAY }); break;
      }
    }
  }
  // a nation joins another whole: land, armies and all
  function annex(tag, by) {
    const g = G();
    for (const w of g.wars.slice()) if (Sim.sideOf(w, tag)) {
      w.attackers = w.attackers.filter(t => t !== tag); w.defenders = w.defenders.filter(t => t !== tag);
      if (!w.attackers.length || !w.defenders.length) g.wars = g.wars.filter(x => x !== w);
    }
    for (const p of MAP().provs) if (g.owner[p.id] === tag) g.owner[p.id] = by;
    for (const a of g.armies) if (a.owner === tag) { a.owner = by; if (a.battle) Sim.endBattle(g.battles.find(b => b.id === a.battle) || { attackers: [], defenders: [] }); }
    if (g.fleets) for (const f of g.fleets) if (f.owner === tag) f.owner = by;
    if (g.wings) for (const w of g.wings) if (w.owner === tag) w.owner = by;
    const c = g.countries[tag];
    g.countries[by].equipment += c.equipment; g.countries[by].manpower += c.manpower;
    c.alive = false; c.queue = [];
    for (const o of Object.values(g.countries)) if (o.overlord === tag) o.overlord = by; Sim.relDirty();
    Sim.dropNation(tag);
    g.ownVer++; Diplo.evacuate();
  }
  // at: [lon, lat] lands the army on the nearest own or allied province to that point (an expeditionary force)
  function spawnArmy(tag, divs, at) {
    const g = G(), c = g.countries[tag];
    let prov = c.capital >= 0 && g.owner[c.capital] === tag ? c.capital : MAP().provs.findIndex(p => g.owner[p.id] === tag);
    if (at) {
      let bd = 1500;
      for (const p of MAP().provs) {
        const o = g.owner[p.id];
        if (o !== tag && !Sim.allied(tag, o)) continue;
        const d = Eras.haversineKm(at[0], at[1], p.lon, p.lat);
        if (d < bd) { bd = d; prov = p.id; }
      }
    }
    if (prov < 0) return;
    const types = (typeof Eras !== 'undefined' ? Eras.unitsFor(tag) : Object.keys(UNIT_TYPES)).filter(t => !UNIT_TYPES[t].locked && !UNIT_TYPES[t].navy);
    const type = types.find(t => UNIT_TYPES[t].symbol === 'inf') || types[0];
    if (!type) return;
    const units = []; for (let i = 0; i < divs; i++) units.push({ type, str: 1, org: 1 });
    Sim.newArmy(tag, prov, units);
  }

  // ---------- firing ----------
  function fire(d, tag) {
    const g = G(), ev = g.ev;
    const key = d.id + '|' + tag;
    ev.fired[key] = g.hour;
    if (!d.tag) ev.cd[key] = g.hour + (d.repeat || 1500) * DAY;
    if (Sim.isHuman(tag)) {
      ev.open.push({ n: ev.next++, id: d.id, tag, hour: g.hour });
      // big historical events stop the clock; everyday ones wait at the side while the game runs on
      if (holds({ id: d.id }) && !g.paused) { g.paused = true; Sim.hooks.pause(); }
      if (hooks.show) hooks.show();
      return;
    }
    const opts = d.options || [];
    let pick = 0;
    if (opts.length > 1) {
      const w = opts.map(o => Math.max(0, o.ai === undefined ? 1 : o.ai));
      let r = Sim.rng() * w.reduce((s, x) => s + x, 0);
      for (pick = 0; pick < w.length - 1 && r >= w[pick]; pick++) r -= w[pick];
    }
    resolve(d, tag, pick);
  }
  function resolve(d, tag, pick) {
    const g = G(), o = (d.options || [])[pick];
    if (o) apply(o.fx, tag);
    g.ev.hist.unshift({ id: d.id, tag, hour: g.hour, pick });
    if (g.ev.hist.length > 60) g.ev.hist.pop();
    if (d.news && !Sim.isHuman(tag) && g.countries[tag]) {
      const c = g.countries[tag];
      Sim.notify(fill(d.title, tag) + (o && d.options.length > 1 ? ': ' + fill(o.text, tag) : '') + ' (' + c.name + ')', c.capital, 'info', false);
    }
  }
  // historical events (tied to a nation and a date) are the big ones; the rest are everyday events
  function isMajor(e) { const d = def(e.id); return !!(d && d.tag); }
  function holds(e) { const st = G().settings; return isMajor(e) ? st.pauseEvent !== false : !!st.pauseMinor; }
  // does an open event hold the clock?
  function holding() { const g = G(); return !!(g && g.ev && g.ev.open.some(holds)); }
  const DECIDE_DAYS = 30;
  // the most likely answer, for an everyday event left unanswered too long
  function aiPick(d) { const w = (d.options || []).map(o => o.ai === undefined ? 1 : o.ai); let best = 0; w.forEach((x, i) => { if (x > w[best]) best = i; }); return best; }
  // the player picks an option of an open event
  function choose(n, pick) {
    const g = G(), i = g.ev.open.findIndex(e => e.n === n);
    if (i < 0) return false;
    const e = g.ev.open[i];
    if (e.tag !== g.player) return false;   // each nation's leader answers its own events
    g.ev.open.splice(i, 1);
    const d = def(e.id);
    if (d) resolve(d, e.tag, Math.max(0, Math.min((d.options || []).length - 1, pick)));
    return true;
  }
  function daily() {
    const g = G(); if (!g.ev) setup();
    const ev = g.ev, day = Math.floor(g.hour / DAY), now = Sim.dateTime(g.hour);
    const L = defs();
    // everyday events nobody answered within a month: the ministers decide
    for (const e of ev.open.slice()) {
      if (isMajor(e) || g.hour - e.hour < DECIDE_DAYS * DAY) continue;
      const d = def(e.id), i = ev.open.indexOf(e);
      ev.open.splice(i, 1);
      if (!d) continue;
      const pick = aiPick(d);
      resolve(d, e.tag, pick);
      if (d.options && d.options[pick]) Sim.tell(e.tag, fill(d.title, e.tag) + ': no answer came, so your ministers chose "' + fill(d.options[pick].text, e.tag) + '".', g.countries[e.tag].capital, 'info', false);
    }
    // follow-ups that fall due
    for (const q of ev.queue.slice()) {
      if (q.at > g.hour) continue;
      ev.queue.splice(ev.queue.indexOf(q), 1);
      const d = def(q.id);
      if (d && alive(q.tag) && check(g.countries[q.tag], d.cond)) fire(d, q.tag);
    }
    for (const d of L) {
      if (!d.tag) continue;
      if (d.date && now < dateMs(d.date)) continue;
      if (d.until && now > dateMs(d.until)) continue;
      for (const t of [].concat(d.tag)) {
        if (!alive(t) || ev.fired[d.id + '|' + t] !== undefined) continue;
        if (!check(g.countries[t], d.cond)) continue;
        if (d.mtth && Sim.rng() > 1 / d.mtth) continue;
        fire(d, t);
      }
    }
    // everyday events: each nation is looked at once a week, at most one event a month
    const every = L.filter(d => !d.tag);
    if (!every.length) return;
    for (const c of Object.values(g.countries)) {
      if (!c.alive || (day + c.tag.charCodeAt(0) + c.tag.charCodeAt(1)) % 7) continue;
      if (c.lastEvent && g.hour - c.lastEvent < 30 * DAY) continue;
      const pool = every.filter(d => { const k = d.id + '|' + c.tag; return !(ev.cd[k] > g.hour) && check(c, d.cond); });
      for (const d of pool) {
        if (Sim.rng() < 7 / (d.mtth || 720)) { c.lastEvent = g.hour; fire(d, c.tag); break; }
      }
    }
  }
  // what the event card shows
  function view(e) {
    const d = def(e.id); if (!d) return null;
    return { n: e.n, title: fill(d.title, e.tag), text: fill(d.text, e.tag), date: Sim.dateStr(e.hour),
      options: (d.options || []).map((o, i) => ({ i, text: fill(o.text, e.tag), fx: describe(o.fx, e.tag) })) };
  }
  function open() { const g = G(); return g && g.ev ? g.ev.open.filter(e => e.tag === g.player) : []; }
  function openAll() { const g = G(); return g && g.ev ? g.ev.open : []; }
  function recent(n) { const g = G(); if (!g || !g.ev) return []; return g.ev.hist.slice(0, n || 12).map(h => { const d = def(h.id); return d ? { title: fill(d.title, h.tag), news: !!d.news, tag: h.tag, hour: h.hour, choice: d.options && d.options[h.pick] ? fill(d.options[h.pick].text, h.tag) : '' } : null; }).filter(Boolean); }
  return { hooks, setup, daily, choose, view, open, openAll, isMajor, holding, DECIDE_DAYS, recent, check, apply, describe, fill, fire: (id, tag) => { const d = def(id); if (d) fire(d, tag); return !!d; }, def, defs, annex };
})();
