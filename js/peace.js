// Peace conferences: when a nation capitulates, the victors share out the spoils with points.
'use strict';
const Peace = (function () {
  const G = () => Sim.G, MAP = () => Sim.MAP;
  const DAY = 24, YEAR = 365 * DAY;
  const hooks = { show: null };
  const alive = t => !!(G().countries[t] && G().countries[t].alive);
  const nm = t => G().countries[t] ? G().countries[t].name : t;
  const PUPPET = 40, REPAR = 15;

  // what a province is worth at the table
  function value(id) {
    const p = MAP().provs[id], g = G();
    const ind = g.ind && g.ind[id] ? Object.values(g.ind[id]).reduce((s, v) => s + (+v || 0), 0) : (p.civ || 0) + (p.mil || 0);
    return 3 + (p.city ? 4 : 0) + (p.capital ? 8 : 0) + (p.home ? 2 : 0) + Math.min(10, ind * 1.5);
  }
  function cost(conf, id, tag) { return Math.max(2, Math.round(value(id) * (G().owner[id] === tag ? 0.6 : 1))); }
  // a victor may take what it holds or what touches its land (including land it takes here)
  function reach(conf, id, tag) {
    const g = G();
    if (g.owner[id] === tag) return true;
    const own = n => g.owner[n] === tag && !(conf.taken[n] && conf.taken[n] !== tag) || conf.taken[n] === tag;
    return MAP().provs[id].nb.some(own);
  }
  // nations that died earlier and whose home land is on the table can be restored
  function restorable(conf) {
    const g = G(), by = {};
    for (const id of conf.provs) {
      const core = MAP().provs[id].core;
      if (!core || core === conf.loser || alive(core) || !g.countries[core] || conf.taken[id]) continue;
      (by[core] || (by[core] = [])).push(id);
    }
    return Object.keys(by).map(t => ({ tag: t, provs: by[t], cost: Math.max(10, Math.round(by[t].reduce((s, id) => s + value(id), 0) * 0.5)) }));
  }
  function winner(conf, tag) { return conf.winners.find(w => w.tag === tag); }
  const left = w => w.pts - w.spent;

  // ---------- opening ----------
  function open(loser, enemies, counts, warName, leaderList) {
    const g = G(), c = g.countries[loser];
    const provs = MAP().provs.filter(p => g.owner[p.id] === loser || (p.core === loser && enemies.includes(g.owner[p.id]))).map(p => p.id);
    // who sits at the table: those who took its land, and the leaders of the war against it
    const leaders = new Set(leaderList || []);
    const seats = enemies.filter(t => alive(t) && (counts[t] > 0 || leaders.has(t) || Diplo.borders(loser, t)));
    if (!seats.length) seats.push(...enemies.filter(alive).slice(0, 1));
    const weight = t => (counts[t] || 0) * 2 + (leaders.has(t) ? 4 : 0) + 1;
    const total = seats.reduce((s, t) => s + weight(t), 0) || 1;
    const conf = {
      id: g.hour, loser, war: warName || 'war', hour: g.hour, place: c.capital >= 0 ? MAP().provs[c.capital].name : c.name, cap: c.capital,
      winners: seats.map(t => ({ tag: t, pts: Math.max(5, Math.round(100 * weight(t) / total)), spent: 0, done: false })).sort((a, b) => b.pts - a.pts),
      provs, taken: {}, puppet: null, repar: [], restore: {}, turn: 0
    };
    // the loser's soldiers go home and its alliances dissolve while the victors talk
    for (const a of g.armies.filter(a => a.owner === loser)) Sim.removeArmy(a);
    c.queue = [];
    Sim.dropNation(loser);
    for (const o of Object.values(g.countries)) if (o.overlord === loser) o.overlord = null;
    if (winner(conf, g.player)) {
      g.peace = conf;
      aiTurns(conf);
      g.paused = true;
      if (hooks.show) hooks.show(conf);
    } else {
      aiTurns(conf);
      finish(conf);
    }
    return conf;
  }
  // AI victors pick in order until it is the player's turn
  function aiTurns(conf) {
    const g = G();
    while (conf.turn < conf.winners.length) {
      const w = conf.winners[conf.turn];
      if (w.tag === g.player && !w.done) return;
      if (!w.done) aiPick(conf, w);
      w.done = true; conf.turn++;
    }
  }
  function aiPick(conf, w) {
    const g = G(), lc = g.countries[conf.loser];
    const home = conf.provs.filter(id => MAP().provs[id].core === conf.loser && MAP().provs[id].home).length;
    if (!conf.puppet && left(w) >= 55 && home >= 6) demand(conf, w.tag, { kind: 'puppet' });
    for (const r of restorable(conf)) if (left(w) >= r.cost + 10 && Sim.allied(w.tag, r.tag) === false && Sim.rng() < 0.5) demand(conf, w.tag, { kind: 'restore', tag: r.tag });
    for (let guard = 0; guard < 80; guard++) {
      // a subject is left its capital and the heartland the victor does not hold
      const keep = id => conf.puppet && (id === conf.cap || (MAP().provs[id].home && MAP().provs[id].core === conf.loser && g.owner[id] !== w.tag));
      const opts = conf.provs.filter(id => !conf.taken[id] && !keep(id) && reach(conf, id, w.tag) && cost(conf, id, w.tag) <= left(w));
      if (!opts.length) break;
      opts.sort((a, b) => value(b) / cost(conf, b, w.tag) + (g.owner[b] === w.tag ? 1 : 0) - value(a) / cost(conf, a, w.tag) - (g.owner[a] === w.tag ? 1 : 0));
      demand(conf, w.tag, { kind: 'prov', id: opts[0] });
    }
    if (left(w) >= REPAR && lc) demand(conf, w.tag, { kind: 'repar' });
  }

  // ---------- demands ----------
  function canDemand(conf, tag, d) {
    const w = winner(conf, tag);
    if (!w) return { ok: false, why: 'Not at the table' };
    const need = d.kind === 'prov' ? cost(conf, d.id, tag) : d.kind === 'puppet' ? PUPPET : d.kind === 'repar' ? REPAR : d.kind === 'restore' ? (restorable(conf).find(r => r.tag === d.tag) || {}).cost : 0;
    if (d.kind === 'prov') {
      if (!conf.provs.includes(d.id)) return { ok: false, why: 'Not on the table' };
      if (conf.taken[d.id]) return { ok: false, why: 'Taken by ' + nm(conf.taken[d.id]) };
      if (!reach(conf, d.id, tag)) return { ok: false, why: 'Out of reach' };
    }
    if (d.kind === 'puppet' && conf.puppet) return { ok: false, why: 'Already a subject of ' + nm(conf.puppet) };
    if (d.kind === 'repar' && conf.repar.filter(r => r === tag).length >= 2) return { ok: false, why: 'At most twice' };
    if (d.kind === 'restore' && !need) return { ok: false, why: 'Nothing to restore' };
    if (left(w) < need) return { ok: false, why: 'Needs ' + need + ' points' };
    return { ok: true, cost: need };
  }
  function demand(conf, tag, d) {
    const chk = canDemand(conf, tag, d);
    if (!chk.ok) return chk;
    const w = winner(conf, tag);
    w.spent += chk.cost;
    if (d.kind === 'prov') conf.taken[d.id] = tag;
    else if (d.kind === 'puppet') conf.puppet = tag;
    else if (d.kind === 'repar') conf.repar.push(tag);
    else if (d.kind === 'restore') { const r = restorable(conf).find(x => x.tag === d.tag); conf.restore[d.tag] = tag; for (const id of r.provs) conf.taken[id] = '@' + d.tag; }
    return chk;
  }
  // the player takes back a demand made this turn
  function undo(conf, tag, d) {
    const w = winner(conf, tag); if (!w) return false;
    if (d.kind === 'prov' && conf.taken[d.id] === tag) { w.spent -= cost(conf, d.id, tag); delete conf.taken[d.id]; return true; }
    if (d.kind === 'puppet' && conf.puppet === tag) { w.spent -= PUPPET; conf.puppet = null; return true; }
    if (d.kind === 'repar') { const i = conf.repar.lastIndexOf(tag); if (i >= 0) { conf.repar.splice(i, 1); w.spent -= REPAR; return true; } }
    if (d.kind === 'restore' && conf.restore[d.tag] === tag) {
      const ids = Object.keys(conf.taken).filter(id => conf.taken[id] === '@' + d.tag);
      for (const id of ids) delete conf.taken[id];
      delete conf.restore[d.tag];
      w.spent -= (restorable(conf).find(r => r.tag === d.tag) || { cost: 0 }).cost;
      return true;
    }
    return false;
  }
  // the player is done: the rest pick, then the treaty is signed
  function done(conf) {
    const w = winner(conf, G().player);
    if (w) { w.done = true; conf.turn = conf.winners.indexOf(w) + 1; }
    aiTurns(conf);
    return finish(conf);
  }

  // ---------- the treaty ----------
  function revive(tag, provs) {
    const g = G(), c = g.countries[tag];
    c.alive = true; c.queue = [];
    const cap = provs.find(id => MAP().provs[id].capital && MAP().provs[id].cityTag === tag) ?? provs.slice().sort((a, b) => value(b) - value(a))[0];
    c.capital = cap;
    const types = (typeof Eras !== 'undefined' ? Eras.unitsFor(tag) : Object.keys(UNIT_TYPES)).filter(t => !UNIT_TYPES[t].locked);
    const inf = types.find(t => UNIT_TYPES[t].symbol === 'inf') || types[0];
    if (inf) Sim.newArmy(tag, cap, [{ type: inf, str: 0.6, org: 0.5 }, { type: inf, str: 0.6, org: 0.5 }]);
  }
  function finish(conf) {
    const g = G(), lc = g.countries[conf.loser];
    const parts = [];
    const gained = {};
    for (const id of conf.provs) {
      const t = conf.taken[id];
      if (t && t[0] !== '@') { g.owner[id] = t; (gained[t] || (gained[t] = [])).push(id); }
      else if (!t) g.owner[id] = conf.loser;       // land nobody claimed goes back
    }
    for (const r in conf.restore) {
      const ids = Object.keys(conf.taken).filter(id => conf.taken[id] === '@' + r).map(Number);
      for (const id of ids) g.owner[id] = r;
      revive(r, ids);
      Diplo.addRel(r, conf.restore[r], 60);
      parts.push(nm(conf.restore[r]) + ' restores ' + nm(r));
    }
    for (const t in gained) { parts.push(nm(t) + ' takes ' + (gained[t].length > 3 ? gained[t].length + ' provinces' : gained[t].map(id => MAP().provs[id].name).join(', '))); Diplo.addRel(conf.loser, t, -10 - 5 * gained[t].length); }
    const kept = MAP().provs.filter(p => g.owner[p.id] === conf.loser).map(p => p.id);
    if (!kept.length) {
      lc.alive = false;
      parts.push(nm(conf.loser) + ' ceases to exist');
    } else {
      if (g.owner[lc.capital] !== conf.loser) lc.capital = kept.slice().sort((a, b) => value(b) - value(a))[0];
      lc.stab = Math.max(0.2, lc.stab - 0.15); lc.ws = 0.1;
      revive(conf.loser, kept);
      if (conf.puppet) { lc.overlord = conf.puppet; parts.push(nm(conf.loser) + ' becomes a subject of ' + nm(conf.puppet)); }
      for (const t of conf.repar) { g.repar = g.repar || []; g.repar.push({ from: conf.loser, to: t, perDay: Math.max(1, Math.round(Math.sqrt(kept.length) * 1.5)), until: g.hour + 2 * YEAR }); }
      const rp = [...new Set(conf.repar)]; if (rp.length) parts.push(nm(conf.loser) + ' pays reparations to ' + rp.map(nm).join(' and '));
      for (const w of conf.winners) if (alive(w.tag) && !Sim.atWar(w.tag, conf.loser)) g.dip.pacts[Sim.pairKey(Sim.root(w.tag), Sim.root(conf.loser))] = g.hour + 2 * YEAR;
    }
    if (!Object.keys(gained).length && !conf.puppet && !conf.repar.length && !Object.keys(conf.restore).length) parts.push('the old borders are restored');
    g.ownVer++;
    Diplo.evacuate();
    const text = 'Treaty of ' + (conf.place || nm(conf.loser)) + ': ' + parts.join('; ') + '.';
    const involves = conf.winners.some(w => w.tag === g.player);
    Sim.notify(text, lc.capital, involves ? 'win' : 'info', false);
    (g.treaties || (g.treaties = [])).unshift({ hour: g.hour, text, loser: conf.loser });
    if (g.treaties.length > 30) g.treaties.pop();
    if (g.peace === conf) g.peace = null;
    return text;
  }
  // reparations are paid every day
  function daily() {
    const g = G();
    if (!g.repar || !g.repar.length) return;
    g.repar = g.repar.filter(r => r.until > g.hour && alive(r.from) && alive(r.to));
    for (const r of g.repar) {
      const a = g.countries[r.from].eco, b = g.countries[r.to].eco;
      if (a && b) { a.gold -= r.perDay; b.gold += r.perDay; }
    }
  }
  function view(conf) {
    const g = G(), me = g.player, w = winner(conf, me);
    return {
      loser: conf.loser, war: conf.war, pts: w ? w.pts : 0, left: w ? left(w) : 0,
      winners: conf.winners.map(x => ({ tag: x.tag, pts: x.pts, spent: x.spent, done: x.done })),
      provs: conf.provs.map(id => {
        const p = MAP().provs[id], chk = canDemand(conf, me, { kind: 'prov', id });
        return { id, name: p.name, cost: cost(conf, id, me), value: value(id), city: !!p.city, capital: !!p.capital, held: g.owner[id], taken: conf.taken[id] || null, ok: chk.ok, why: chk.why || '' };
      }).sort((a, b) => (b.taken === me) - (a.taken === me) || b.ok - a.ok || b.value - a.value),
      puppet: { cost: PUPPET, by: conf.puppet, ok: canDemand(conf, me, { kind: 'puppet' }).ok, why: canDemand(conf, me, { kind: 'puppet' }).why || '' },
      repar: { cost: REPAR, mine: conf.repar.filter(t => t === me).length, ok: canDemand(conf, me, { kind: 'repar' }).ok, why: canDemand(conf, me, { kind: 'repar' }).why || '' },
      restore: restorable(conf).concat(Object.keys(conf.restore).map(t => ({ tag: t, provs: [], cost: 0 }))).map(r => ({ tag: r.tag, cost: r.cost, by: conf.restore[r.tag] || null, ok: canDemand(conf, me, { kind: 'restore', tag: r.tag }).ok }))
    };
  }
  return { hooks, open, demand, undo, done, finish, daily, view, value, canDemand, current: () => (G() && G().peace) || null, aiPick: (conf, tag) => { const w = winner(conf, tag); if (w) aiPick(conf, w); } };
})();
