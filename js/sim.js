// Simulation: game state, clock, armies, movement, combat, wars, capitulation and AI.
'use strict';
const Sim = (function () {
  let MAP = null;   // generated map
  let G = null;     // game state (serialisable)
  let nbDist = [];  // km between adjacent provinces
  const hooks = { notify: () => {}, pause: () => {}, gameOver: () => {} };

  const START = Date.UTC(1936, 0, 1, 0, 0, 0);
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const ORD = n => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');
  let rng = mulberry32(42);

  function dateOf(hour) { return new Date(START + hour * 3600e3); }
  function dateStr(hour, withTime) {
    const d = dateOf(hour);
    const s = d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
    return withTime ? String(d.getUTCHours()).padStart(2, '0') + ':00, ' + s : s;
  }

  // ---------- setup ----------
  function init(map) {
    MAP = map;
    nbDist = MAP.provs.map(p => p.nb.map(q => GEO.haversineKm(p.lon, p.lat, MAP.provs[q].lon, MAP.provs[q].lat)));
  }
  function distKm(a, b) {
    const i = MAP.provs[a].nb.indexOf(b);
    return i >= 0 ? nbDist[a][i] : GEO.haversineKm(MAP.provs[a].lon, MAP.provs[a].lat, MAP.provs[b].lon, MAP.provs[b].lat);
  }

  function newGame(playerTag) {
    rng = mulberry32(1936 + playerTag.charCodeAt(0) * 7 + playerTag.charCodeAt(1));
    G = {
      hour: 0, speed: 2, paused: true, player: playerTag, over: false, ownVer: 0,
      countries: {}, owner: MAP.provs.map(p => p.owner),
      armies: [], nextArmy: 1, battles: [], nextBattle: 1, wars: [], nextWar: 1,
      log: [], stats: { captured: 0, lost: 0, battlesWon: 0, battlesLost: 0 },
      settings: { autoPause: true, pauseWar: true, pauseBattle: false, pauseLoss: true, pauseCapitulation: true }
    };
    for (const d of COUNTRY_DEFS) {
      const capital = MAP.provs.find(p => p.capital && p.cityTag === d.tag);
      const base = GOV_BASE[d.gov];
      G.countries[d.tag] = {
        tag: d.tag, name: d.name, color: d.color, gov: d.gov, overlord: d.overlord || null, culture: d.culture,
        pp: d.tag === playerTag ? 60 : 30, stab: base.stab, ws: base.ws, tech: d.tech,
        manpower: Math.round(d.pop * 1e6 * 0.012), losses: 0, equipment: d.divs * 60 + d.mil * 250,
        civ: d.civ, mil: d.mil, capital: capital ? capital.id : -1, alive: true, queue: [], armySeq: 0, baseDivs: d.divs
      };
    }
    for (const d of COUNTRY_DEFS) spawnInitialArmies(d);
    declareWar('ITA', 'ETH', true);
    return G;
  }

  function commanderFor(c) {
    const pool = NAME_POOLS[c.culture] || NAME_POOLS.oth;
    const initial = 'ABCDEFGHJKLMNOPRSTVW'[Math.floor(rng() * 20)];
    return { name: 'Gen. ' + initial + '. ' + pool[Math.floor(rng() * pool.length)], skill: 1 + Math.floor(rng() * 4) };
  }
  function makeUnit(type, str) { return { type, str: str === undefined ? 1 : str, org: 1 }; }
  function newArmy(tag, prov, units) {
    const c = G.countries[tag];
    c.armySeq++;
    const a = { id: G.nextArmy++, owner: tag, name: ORD(c.armySeq) + ' Army', commander: commanderFor(c), units, prov,
      path: [], progress: 0, order: 'hold', target: -1, frontTag: null, battle: 0, retreating: false, entrench: 0, supply: 1 };
    G.armies.push(a);
    return a;
  }

  function spawnInitialArmies(d) {
    const c = G.countries[d.tag];
    if (!d.divs || c.capital < 0) return;
    const types = [];
    for (let i = 0; i < d.divs; i++) {
      const r = rng();
      if (d.mil >= 8 && r < 0.10) types.push('tanks');
      else if (d.mil >= 8 && r < 0.20) types.push('motorized');
      else if (r < 0.33) types.push('artillery');
      else if (d.mil >= 10 && r < 0.36) types.push('recon');
      else types.push('infantry');
    }
    // overseas garrisons first
    for (const [city, n] of (d.garrisons || [])) {
      const prov = MAP.provs.find(p => p.city === city && G.owner[p.id] === d.tag);
      const take = types.splice(0, Math.min(n, types.length - 1));
      if (prov && take.length) newArmy(d.tag, prov.id, take.map(t => makeUnit(t))).entrench = 0.1;
    }
    const nd = types.length;
    const nArmies = Math.ceil(nd / 8);
    const home = MAP.provs.filter(p => G.owner[p.id] === d.tag && p.home);
    const border = home.filter(p => p.nb.some(q => G.owner[q] !== d.tag))
      .map(p => ({ p, w: p.nb.reduce((s, q) => s + (G.owner[q] !== d.tag ? (G.countries[G.owner[q]] ? G.countries[G.owner[q]].mil + 1 : 1) : 0), 0) + rng() * 3 }))
      .sort((a, b) => b.w - a.w).map(o => o.p.id);
    const spots = [c.capital, ...border.filter(id => id !== c.capital)];
    for (let i = 0; i < nArmies; i++) {
      const slice = types.slice(Math.floor(i * nd / nArmies), Math.floor((i + 1) * nd / nArmies));
      if (!slice.length) continue;
      const prov = spots[i % spots.length];
      const a = newArmy(d.tag, prov, slice.map(t => makeUnit(t)));
      a.entrench = 0.1;
    }
  }

  // ---------- relations ----------
  function root(tag) {
    let t = tag, guard = 0;
    while (G.countries[t] && G.countries[t].overlord && G.countries[G.countries[t].overlord] && G.countries[G.countries[t].overlord].alive && guard++ < 5) t = G.countries[t].overlord;
    return t;
  }
  function family(tag) {
    const r = root(tag);
    return Object.values(G.countries).filter(c => c.alive && root(c.tag) === r).map(c => c.tag);
  }
  function sideOf(war, tag) { return war.attackers.includes(tag) ? 'att' : war.defenders.includes(tag) ? 'def' : null; }
  function atWar(a, b) {
    if (a === b) return false;
    for (const w of G.wars) {
      const sa = sideOf(w, a), sb = sideOf(w, b);
      if (sa && sb && sa !== sb) return true;
    }
    return false;
  }
  function allied(a, b) {
    if (a === b) return true;
    if (root(a) === root(b)) return true;
    for (const w of G.wars) { const sa = sideOf(w, a); if (sa && sa === sideOf(w, b)) return true; }
    return false;
  }
  function enemiesOf(tag) {
    const s = new Set();
    for (const w of G.wars) {
      const side = sideOf(w, tag);
      if (!side) continue;
      (side === 'att' ? w.defenders : w.attackers).forEach(t => s.add(t));
    }
    return s;
  }
  function isAtWar(tag) { return G.wars.some(w => sideOf(w, tag)); }
  function canEnter(tag, prov) { const o = G.owner[prov]; return o === tag || allied(tag, o) || atWar(tag, o); }

  function declareWar(att, def, silent) {
    if (att === def || atWar(att, def) || allied(att, def)) return null;
    const A = family(att), D = family(def).filter(t => !A.includes(t));
    const war = { id: G.nextWar++, attackers: A, defenders: D, leaderA: att, leaderD: def, goal: 'Conquer ' + G.countries[def].name, start: G.hour };
    const total = A.length + D.length;
    war.name = total >= 8 ? 'World War' : G.countries[att].name + '–' + G.countries[def].name + ' War';
    G.wars.push(war);
    for (const t of A.concat(D)) { const c = G.countries[t]; c.ws = Math.min(1, c.ws + 0.1); }
    if (!silent) {
      const involvesPlayer = A.includes(G.player) || D.includes(G.player);
      notify(G.countries[att].name + ' declared war on ' + G.countries[def].name + '.', G.countries[def].capital, 'war', involvesPlayer && G.settings.pauseWar);
    }
    return war;
  }

  // ---------- pathfinding ----------
  function findPath(tag, from, to, mode) {
    if (from === to) return [];
    const provs = MAP.provs;
    const passable = id => mode === 'redeploy' ? (G.owner[id] === tag || allied(tag, G.owner[id])) : canEnter(tag, id);
    if (!passable(to)) return null;
    const tp = provs[to];
    const h = id => GEO.haversineKm(provs[id].lon, provs[id].lat, tp.lon, tp.lat);
    const g = new Map([[from, 0]]), came = new Map();
    const open = [[h(from), from]];
    const closed = new Set();
    while (open.length) {
      let bi = 0; for (let i = 1; i < open.length; i++) if (open[i][0] < open[bi][0]) bi = i;
      const [, cur] = open[bi]; open.splice(bi, 1);
      if (cur === to) break;
      if (closed.has(cur)) continue; closed.add(cur);
      const p = provs[cur];
      for (let k = 0; k < p.nb.length; k++) {
        const n = p.nb[k];
        if (closed.has(n) || !passable(n)) continue;
        const cost = g.get(cur) + nbDist[cur][k] / TERRAIN[provs[n].terrain].move;
        if (cost < (g.has(n) ? g.get(n) : Infinity)) { g.set(n, cost); came.set(n, cur); open.push([cost + h(n), n]); }
      }
      if (closed.size > 2500) break;
    }
    if (!came.has(to)) return null;
    const path = [to]; let c = to;
    while (came.get(c) !== from) { c = came.get(c); path.unshift(c); }
    return path;
  }

  // ---------- army helpers ----------
  function army(id) { return G.armies.find(a => a.id === id); }
  function armiesAt(prov) { return G.armies.filter(a => a.prov === prov); }
  function hostilesAt(tag, prov) { return G.armies.filter(a => a.prov === prov && !a.retreating && atWar(a.owner, tag)); }
  function armySpeed(a) {
    let s = Infinity; for (const u of a.units) s = Math.min(s, UNIT_TYPES[u.type].speed);
    s *= 0.6 + 0.4 * a.supply;
    if (a.order === 'redeploy') s *= 2.5;
    if (a.retreating) s *= 1.3;
    return s;
  }
  function armyStats(a) {
    let str = 0, org = 0, divs = a.units.length;
    for (const u of a.units) { str += u.str; org += u.org; }
    return { str: divs ? str / divs : 0, org: divs ? org / divs : 0, divs };
  }
  function armyPower(a, role, terrain) {
    let v = 0;
    const T = TERRAIN[terrain];
    for (const u of a.units) {
      const t = UNIT_TYPES[u.type];
      if (role === 'atk') v += t.atk * u.str * (0.3 + 0.7 * u.org) * T.atk * (t.armor ? T.armor : 1);
      else v += t.def * u.str * (0.4 + 0.6 * u.org);
    }
    const c = G.countries[a.owner];
    v *= c.tech * (1 + 0.05 * a.commander.skill) * (0.5 + 0.5 * a.supply);
    if (role === 'def') v *= 1 + a.entrench;
    return v;
  }
  function manpowerOf(a) { return a.units.reduce((s, u) => s + UNIT_TYPES[u.type].mp * u.str, 0); }

  // ---------- orders ----------
  function orderMove(a, dest, kind) {
    if (a.battle) leaveBattle(a);
    const mode = kind === 'redeploy' ? 'redeploy' : 'move';
    const path = findPath(a.owner, a.prov, dest, mode);
    if (!path) return false;
    a.path = path; a.progress = 0; a.order = kind || 'move'; a.target = dest; a.retreating = false;
    return true;
  }
  function orderHold(a) { if (a.battle) leaveBattle(a); a.path = []; a.progress = 0; a.order = 'hold'; a.target = -1; a.frontTag = null; }
  function orderDefend(a, frontTag) { if (a.battle) leaveBattle(a); a.path = []; a.progress = 0; a.order = 'defend'; a.frontTag = frontTag || null; a.target = -1; }
  function orderRetreat(a) {
    const c = G.countries[a.owner];
    if (a.battle) leaveBattle(a);
    // nearest own province not bordering an enemy
    const en = enemiesOf(a.owner);
    const seen = new Set([a.prov]); let frontier = [a.prov], dest = -1;
    for (let depth = 0; depth < 12 && dest < 0 && frontier.length; depth++) {
      const next = [];
      for (const p of frontier) for (const n of MAP.provs[p].nb) {
        if (seen.has(n)) continue; seen.add(n);
        if (G.owner[n] !== a.owner && !allied(a.owner, G.owner[n])) continue;
        if (!MAP.provs[n].nb.some(q => en.has(G.owner[q]))) { dest = n; break; }
        next.push(n);
      }
      frontier = next;
    }
    if (dest < 0) dest = c.capital;
    const ok = orderMove(a, dest, 'move');
    if (ok) a.order = 'retreat';
    return ok;
  }
  function mergeArmies(list) {
    if (list.length < 2) return null;
    const base = list[0];
    for (const a of list.slice(1)) {
      if (a.owner !== base.owner || a.prov !== base.prov) continue;
      if (a.battle) leaveBattle(a);
      base.units.push(...a.units);
      removeArmy(a);
    }
    return base;
  }
  function splitArmy(a) {
    if (a.units.length < 2) return null;
    const half = a.units.splice(Math.floor(a.units.length / 2));
    const b = newArmy(a.owner, a.prov, half);
    b.entrench = a.entrench; b.supply = a.supply;
    return b;
  }
  function removeArmy(a) {
    if (a.battle) leaveBattle(a);
    G.armies = G.armies.filter(x => x !== a);
  }

  // ---------- battles ----------
  function battleAt(prov) { return G.battles.find(b => b.prov === prov); }
  function startBattle(a, prov) {
    let b = G.battles.find(x => x.prov === prov && allied(x.atkTag, a.owner));
    if (!b) {
      const defs = hostilesAt(a.owner, prov);
      b = { id: G.nextBattle++, prov, atkTag: a.owner, defTag: defs[0].owner, attackers: [], from: {}, start: G.hour,
        casA: 0, casD: 0, progress: 0.5, rateA: 0, rateD: 0, mods: [] };
      G.battles.push(b);
      const pl = G.player;
      if (allied(a.owner, pl) || defs.some(d => allied(d.owner, pl))) {
        notify('Battle of ' + MAP.provs[prov].name + ' has begun.', prov, 'battle', G.settings.pauseBattle && (a.owner === pl || defs.some(d => d.owner === pl)));
      }
    }
    if (!b.attackers.includes(a.id)) { b.attackers.push(a.id); b.from[a.id] = a.prov; }
    a.battle = b.id; a.entrench = 0;
  }
  function leaveBattle(a) {
    const b = G.battles.find(x => x.id === a.battle);
    if (b) b.attackers = b.attackers.filter(id => id !== a.id);
    a.battle = 0;
  }
  function endBattle(b) {
    G.battles = G.battles.filter(x => x !== b);
    for (const id of b.attackers) { const a = army(id); if (a && a.battle === b.id) a.battle = 0; }
  }

  function stepBattle(b) {
    const prov = MAP.provs[b.prov];
    const atts = b.attackers.map(army).filter(a => a && a.battle === b.id && a.units.length);
    b.attackers = atts.map(a => a.id);
    if (!atts.length) { endBattle(b); return; }
    const defs = hostilesAt(b.atkTag, b.prov).filter(d => d.units.length);
    if (!defs.length) { endBattle(b); return; }   // attackers will advance on their own
    b.defTag = defs[0].owner;

    const fronts = new Set(atts.map(a => b.from[a.id])).size;
    const flank = 1 + 0.1 * (fronts - 1);
    const recon = atts.some(a => a.units.some(u => u.type === 'recon')) ? 1.08 : 1;
    let A = 0, B = 0, D = 0, F = 0;
    for (const a of atts) { A += armyPower(a, 'atk', prov.terrain); B += armyPower(a, 'def', prov.terrain) * 0.6; }
    A *= flank * recon;
    for (const d of defs) { D += armyPower(d, 'def', prov.terrain); F += armyPower(d, 'atk', 'plains') * 0.9; }
    const ra = Math.max(0.1, Math.min(6, A / Math.max(D, 1)));
    const rd = Math.max(0.1, Math.min(6, F / Math.max(B, 1)));
    const hitD = 0.014 * ra, hitA = 0.014 * rd;
    const apply = (list, hit, key) => {
      for (const a of list) for (const u of a.units) {
        const t = UNIT_TYPES[u.type];
        const orgLoss = hit * (0.7 + rng() * 0.6) * 50 / t.org;
        u.org = Math.max(0, u.org - orgLoss);
        const sl = Math.min(u.str, orgLoss * 0.22);
        u.str -= sl;
        const cas = sl * t.mp;
        b[key] += cas;
        G.countries[a.owner].losses += cas;
      }
    };
    apply(defs, hitD, 'casD');
    apply(atts, hitA, 'casA');
    b.rateD = hitD; b.rateA = hitA;
    const T = TERRAIN[prov.terrain];
    b.mods = [
      ['Terrain: ' + T.name, T.atk - 1],
      ['Defender entrenchment', -avg(defs.map(d => d.entrench))],
      ['Attacker supply', avg(atts.map(a => a.supply)) * 0.5 - 0.5],
      ['Defender supply', -(avg(defs.map(d => d.supply)) * 0.5 - 0.5)],
      ['Attacker commanders', 0.05 * avg(atts.map(a => a.commander.skill))],
      ['Defender commanders', -0.05 * avg(defs.map(d => d.commander.skill))],
      ['Technology', G.countries[b.atkTag].tech - G.countries[b.defTag].tech]
    ];
    if (fronts > 1) b.mods.push(['Attack from ' + fronts + ' sides', flank - 1]);
    if (recon > 1) b.mods.push(['Reconnaissance', recon - 1]);
    // remove shattered units
    for (const a of atts.concat(defs)) {
      a.units = a.units.filter(u => u.str > 0.05);
      if (!a.units.length) { notify(G.countries[a.owner].name + ' ' + a.name + ' was destroyed.', a.prov, 'loss', false); removeArmy(a); }
    }
    const dOrg = avg(defs.flatMap(d => d.units.map(u => u.org)));
    const aOrg = avg(atts.flatMap(a => a.units.map(u => u.org)));
    b.progress = (1 - dOrg) / ((1 - dOrg) + (1 - aOrg) + 1e-6);
    b.aOrg = aOrg; b.dOrg = dOrg;
    b.aStr = avg(atts.flatMap(a => a.units.map(u => u.str))); b.dStr = avg(defs.flatMap(d => d.units.map(u => u.str)));
    const pl = G.player;
    if (!defs.some(d => d.units.length) || dOrg < 0.06) {
      // attackers win; defenders retreat
      for (const d of defs) if (G.armies.includes(d)) retreatFrom(d, b);
      if (allied(b.atkTag, pl)) G.stats.battlesWon++;
      if (allied(b.defTag, pl)) G.stats.battlesLost++;
      if (b.atkTag === pl || defs.some(d => d.owner === pl))
        notify((b.atkTag === pl ? 'Victory' : 'Defeat') + ' at ' + prov.name + '.', b.prov, b.atkTag === pl ? 'win' : 'loss', false);
      for (const c of [b.atkTag, b.defTag]) { const cc = G.countries[c]; if (cc) cc.ws = Math.max(0, Math.min(1, cc.ws + (c === b.atkTag ? 0.004 : -0.004))); }
      endBattle(b);
    } else if (aOrg < 0.12) {
      for (const a of atts) { a.path = []; a.progress = 0; if (a.order !== 'defend') a.order = 'hold'; a.battle = 0; }
      if (b.atkTag === pl || defs.some(d => d.owner === pl))
        notify('The attack on ' + prov.name + ' was repulsed.', b.prov, b.atkTag === pl ? 'loss' : 'win', false);
      endBattle(b);
    }
  }
  function avg(arr) { return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0; }

  function retreatFrom(d, b) {
    const from = MAP.provs[b.prov];
    const attFrom = new Set(Object.values(b.from));
    const opts = from.nb.filter(n => (G.owner[n] === d.owner || allied(d.owner, G.owner[n])) && !hostilesAt(d.owner, n).length && !attFrom.has(n));
    if (!opts.length) {
      notify(G.countries[d.owner].name + ' ' + d.name + ' was encircled and destroyed at ' + from.name + '.', b.prov, d.owner === G.player ? 'loss' : 'win', false);
      G.countries[d.owner].losses += manpowerOf(d);
      removeArmy(d); return;
    }
    opts.sort((x, y) => friendlyScore(d.owner, y) - friendlyScore(d.owner, x));
    d.path = [opts[0]]; d.progress = 0; d.retreating = true; d.entrench = 0; d.battle = 0;
    if (d.order !== 'defend') d.order = 'retreat';
  }
  function friendlyScore(tag, p) {
    let s = 0;
    for (const n of MAP.provs[p].nb) { if (G.owner[n] === tag) s += 1; else if (atWar(tag, G.owner[n])) s -= 2; }
    return s;
  }

  // ---------- territory ----------
  function capture(prov, tag) {
    const prev = G.owner[prov];
    const p = MAP.provs[prov];
    let newOwner = tag;
    const core = p.core;
    if (core !== tag && G.countries[core] && G.countries[core].alive && allied(core, tag) && core !== prev) newOwner = core; // liberation
    G.owner[prov] = newOwner;
    G.ownVer++;
    if (newOwner === G.player) G.stats.captured++;
    if (prev === G.player) {
      G.stats.lost++;
      if (p.capital || p.city) notify(p.name + ' has fallen to ' + G.countries[tag].name + '.', prov, 'loss', G.settings.pauseLoss);
    }
    // capital relocation
    const pc = G.countries[prev];
    if (pc && pc.capital === prov) {
      const alt = MAP.provs.filter(q => G.owner[q.id] === prev && q.core === prev && q.city).sort((x, y) => (y.home - x.home) || (y.pop - x.pop))[0];
      if (alt) { pc.capital = alt.id; pc.stab = Math.max(0, pc.stab - 0.1); notify(pc.name + ' moved its capital to ' + alt.name + '.', alt.id, 'info', false); }
    }
  }

  function checkCapitulations() {
    for (const c of Object.values(G.countries)) {
      if (!c.alive || !isAtWar(c.tag)) continue;
      const home = MAP.provs.filter(p => p.core === c.tag && p.home);
      if (!home.length) continue;
      const held = home.filter(p => G.owner[p.id] === c.tag).length;
      const anyLeft = MAP.provs.some(p => G.owner[p.id] === c.tag);
      const capLost = G.owner[home.find(p => p.capital) ? home.find(p => p.capital).id : home[0].id] !== c.tag;
      if (!anyLeft || held / home.length < 0.35 || (capLost && held / home.length < 0.55)) capitulate(c.tag);
    }
  }

  function capitulate(tag) {
    const c = G.countries[tag];
    const enemies = [...enemiesOf(tag)];
    // the enemy holding the most of this country's land receives the rest
    const counts = {};
    MAP.provs.forEach(p => { if (p.core === tag && enemies.includes(G.owner[p.id])) counts[G.owner[p.id]] = (counts[G.owner[p.id]] || 0) + 1; });
    let winner = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0] || enemies[0];
    if (winner && G.countries[winner] && G.countries[winner].overlord && G.countries[G.countries[winner].overlord]?.alive && !counts[winner]) winner = root(winner);
    MAP.provs.forEach(p => { if (G.owner[p.id] === tag) G.owner[p.id] = winner; });
    G.ownVer++;
    for (const a of G.armies.filter(a => a.owner === tag)) removeArmy(a);
    c.alive = false; c.queue = [];
    for (const o of Object.values(G.countries)) if (o.overlord === tag) o.overlord = null;
    for (const w of G.wars) { w.attackers = w.attackers.filter(t => t !== tag); w.defenders = w.defenders.filter(t => t !== tag); }
    const ended = G.wars.filter(w => !w.attackers.length || !w.defenders.length);
    G.wars = G.wars.filter(w => w.attackers.length && w.defenders.length);
    const involves = enemies.includes(G.player) || tag === G.player || allied(tag, G.player);
    notify(c.name + ' has capitulated' + (winner ? ' to ' + G.countries[winner].name : '') + '.', G.countries[winner]?.capital ?? -1, 'cap', involves && G.settings.pauseCapitulation);
    for (const w of ended) notify('The ' + w.name + ' has ended.', -1, 'info', false);
    if (tag === G.player) { G.over = true; G.paused = true; hooks.gameOver(false); }
    else if (!Object.values(G.countries).some(o => o.alive && o.tag !== G.player && atWar(o.tag, G.player)) && ended.some(w => sideOf(w, G.player) !== null)) { /* player's war ended */ }
  }

  // ---------- supply ----------
  function computeSupply(a) {
    const p = MAP.provs[a.prov];
    const owner = G.owner[a.prov];
    const friendly = owner === a.owner || allied(a.owner, owner);
    let base = friendly ? 0.55 + 0.09 * p.infra : 0.4;
    if (p.core !== a.owner && !allied(p.core, a.owner)) base *= 0.85;
    // steps to a home province of this country or an ally
    let steps = 0;
    if (!(p.core === a.owner && owner === a.owner)) {
      const seen = new Set([a.prov]); let fr = [a.prov]; steps = 8;
      outer: for (let d = 1; d <= 7; d++) {
        const nx = [];
        for (const q of fr) for (const n of MAP.provs[q].nb) {
          if (seen.has(n)) continue; seen.add(n);
          const o = G.owner[n];
          if (o !== a.owner && !allied(a.owner, o)) continue;
          if (MAP.provs[n].core === o) { steps = d; break outer; }
          nx.push(n);
        }
        fr = nx;
      }
    }
    const distF = Math.pow(0.88, steps);
    const cap = 4 + p.infra * 4 + (p.city ? 6 : 0) + (p.capital ? 6 : 0);
    let demand = 0;
    for (const o of G.armies) if (o.prov === a.prov && allied(o.owner, a.owner)) for (const u of o.units) demand += UNIT_TYPES[u.type].supply;
    const capF = Math.min(1, cap / Math.max(1, demand));
    return Math.max(0.05, Math.min(1, base * distF * capF));
  }

  // ---------- recruitment ----------
  function canRecruit(tag, type) {
    const c = G.countries[tag], t = UNIT_TYPES[type];
    return c.manpower >= t.mp && c.equipment >= t.eq;
  }
  function recruit(tag, type, armyId) {
    const c = G.countries[tag], t = UNIT_TYPES[type];
    if (!canRecruit(tag, type)) return false;
    c.manpower -= t.mp; c.equipment -= t.eq;
    c.queue.push({ type, hours: t.days * 24, total: t.days * 24, armyId: armyId || 0 });
    return true;
  }
  function finishRecruit(c, item) {
    const target = item.armyId ? army(item.armyId) : null;
    const u = makeUnit(item.type, 1); u.org = 0.5;
    if (target && target.owner === c.tag && (G.owner[target.prov] === c.tag)) { target.units.push(u); return; }
    const cap = c.capital;
    if (cap < 0 || G.owner[cap] !== c.tag) return;
    let reserve = G.armies.find(a => a.owner === c.tag && a.prov === cap && a.reserve && a.units.length < 12);
    if (!reserve) { reserve = newArmy(c.tag, cap, []); reserve.reserve = true; }
    reserve.units.push(u);
    if (c.tag === G.player) notify('A new ' + UNIT_TYPES[item.type].name.toLowerCase() + ' division is ready in ' + MAP.provs[cap].name + '.', cap, 'info', false);
  }

  // ---------- AI ----------
  function aiCountry(c) {
    const war = isAtWar(c.tag);
    const myArmies = G.armies.filter(a => a.owner === c.tag);
    const divs = myArmies.reduce((s, a) => s + a.units.length, 0) + c.queue.length;
    const want = Math.max(2, Math.round(c.baseDivs * (war ? 1.6 : 1.1)));
    let guard = 0;
    while (divs + guard < want && guard < 3) {
      const r = rng();
      const type = c.mil >= 8 && r < 0.15 ? 'tanks' : r < 0.3 ? 'artillery' : 'infantry';
      if (!recruit(c.tag, type, 0)) break;
      guard++;
    }
    if (war) {
      // spread out: split big idle armies while parts of the front are uncovered
      const en = enemiesOf(c.tag);
      const front = MAP.provs.filter(p => G.owner[p.id] === c.tag && p.nb.some(n => en.has(G.owner[n])));
      const covered = new Set(G.armies.filter(a => a.owner === c.tag).map(a => a.path.length ? a.path[a.path.length - 1] : a.prov));
      let gaps = front.filter(p => !covered.has(p.id)).length;
      for (const a of myArmies.slice()) {
        if (gaps <= 0) break;
        if (!a.battle && !a.path.length && a.units.length >= 6) { splitArmy(a); gaps--; }
      }
      frontlineAI(c.tag, G.armies.filter(a => a.owner === c.tag), true);
    }
    // merge small reserve armies into nearby field armies
    for (const r of myArmies.filter(a => a.reserve && a.units.length >= 4 && !a.battle && !a.path.length)) r.reserve = false;
  }

  // Frontline logic shared by AI countries and player armies set to "Defend front" / "Attack".
  function frontlineAI(tag, list, allowAttack, frontTag) {
    const en = enemiesOf(tag);
    if (!en.size) return;
    const isEnemy = o => frontTag ? o === frontTag || (en.has(o) && root(o) === root(frontTag)) : en.has(o);
    const front = [];
    MAP.provs.forEach(p => {
      if (G.owner[p.id] !== tag) return;
      let threat = 0, touches = false;
      for (const n of p.nb) if (isEnemy(G.owner[n])) {
        touches = true; threat += 1;
        for (const h of G.armies) if (h.prov === n && en.has(h.owner)) threat += armyPower(h, 'atk', p.terrain) / 20;
      }
      if (touches) front.push({ id: p.id, threat: threat + (p.capital ? 4 : 0) + (p.city ? 1 : 0), def: 0 });
    });
    if (!front.length) return;
    const fmap = new Map(front.map(f => [f.id, f]));
    for (const a of G.armies) if (a.owner === tag || allied(a.owner, tag)) {
      const f = fmap.get(a.path.length ? a.path[a.path.length - 1] : a.prov);
      if (f) f.def += armyPower(a, 'def', MAP.provs[f.id].terrain) / 20;
    }
    for (const a of list) {
      if (a.battle || a.retreating || a.path.length || !a.units.length) continue;
      const st = armyStats(a);
      const here = fmap.get(a.prov);
      if (here && allowAttack && st.org > 0.7 && st.str > 0.6) {
        let best = null, bestScore = 0;
        for (const n of MAP.provs[a.prov].nb) {
          if (!isEnemy(G.owner[n])) continue;
          const hs = hostilesAt(tag, n);
          const defP = hs.reduce((s, h) => s + armyPower(h, 'def', MAP.provs[n].terrain), 0);
          const atkP = armyPower(a, 'atk', MAP.provs[n].terrain);
          const ratio = atkP / (defP + 1);
          let score = defP === 0 ? 5 + (MAP.provs[n].city ? 2 : 0) : ratio > 1.3 ? ratio : 0;
          if (MAP.provs[n].capital) score *= 1.5;
          if (score > bestScore) { bestScore = score; best = n; }
        }
        if (best !== null) { a.path = [best]; a.progress = 0; continue; }
      }
      if (here && here.def - armyPower(a, 'def', MAP.provs[a.prov].terrain) / 20 < here.threat * 0.8) continue; // needed here
      // move to the most under-defended frontier province nearby
      let target = null, bestNeed = -Infinity;
      const pa = MAP.provs[a.prov];
      for (const f of front) {
        const pf = MAP.provs[f.id];
        const d = GEO.haversineKm(pa.lon, pa.lat, pf.lon, pf.lat);
        const need = (f.threat - f.def) - d / 400;
        if (need > bestNeed) { bestNeed = need; target = f; }
      }
      if (target && target.id !== a.prov) {
        const path = findPath(tag, a.prov, target.id, 'move');
        if (path && path.length) { a.path = path; a.progress = 0; target.def += armyPower(a, 'def', MAP.provs[target.id].terrain) / 20; }
      }
    }
  }

  function playerOrders() {
    const mine = G.armies.filter(a => a.owner === G.player);
    const defenders = mine.filter(a => a.order === 'defend');
    if (defenders.length) {
      const groups = {};
      defenders.forEach(a => { (groups[a.frontTag || '*'] = groups[a.frontTag || '*'] || []).push(a); });
      for (const k in groups) frontlineAI(G.player, groups[k], false, k === '*' ? null : k);
    }
    for (const a of mine) {
      if (a.order === 'attack' && !a.battle && !a.path.length && a.target >= 0 && a.prov !== a.target) {
        const st = armyStats(a);
        if (st.org < 0.4) continue; // regroup before pressing on
        const path = findPath(a.owner, a.prov, a.target, 'move');
        if (path) a.path = path; else a.order = 'hold';
      }
      if ((a.order === 'attack' || a.order === 'move' || a.order === 'redeploy' || a.order === 'retreat') && a.prov === a.target && !a.path.length) { a.order = 'hold'; a.target = -1; }
    }
  }

  // ---------- ticks ----------
  function hourTick() {
    G.hour++;
    // movement
    for (const a of G.armies.slice()) {
      if (!G.armies.includes(a)) continue;
      if (a.battle) continue;
      if (!a.path.length) {
        a.entrench = Math.min(0.25, a.entrench + 0.25 / (24 * 10));
        recoverOrg(a, 1);
        if (a.retreating) a.retreating = false;
        continue;
      }
      const next = a.path[0];
      if (!canEnter(a.owner, next)) {
        const re = a.target >= 0 && a.target !== next ? findPath(a.owner, a.prov, a.target, a.order === 'redeploy' ? 'redeploy' : 'move') : null;
        a.path = re || []; a.progress = 0; continue;
      }
      if (!a.retreating && hostilesAt(a.owner, next).length) {
        if (a.order === 'redeploy') { a.path = []; a.progress = 0; a.order = 'hold'; continue; }
        startBattle(a, next); continue;
      }
      a.entrench = 0;
      a.progress += armySpeed(a) * TERRAIN[MAP.provs[next].terrain].move * (atWar(a.owner, G.owner[next]) ? 0.6 : 1);
      recoverOrg(a, 0.3);
      if (a.order === 'redeploy') for (const u of a.units) u.org = Math.max(0.2, u.org - 0.01);
      if (a.progress >= distKm(a.prov, next)) {
        a.prov = next; a.path.shift(); a.progress = 0;
        const o = G.owner[next];
        if (o !== a.owner && atWar(a.owner, o)) capture(next, a.owner);
        if (!a.path.length) a.retreating = false;
      }
    }
    for (const b of G.battles.slice()) if (G.battles.includes(b)) stepBattle(b);
    // queue
    for (const c of Object.values(G.countries)) {
      if (!c.alive || !c.queue.length) continue;
      for (const item of c.queue) item.hours--;
      const done = c.queue.filter(i => i.hours <= 0);
      c.queue = c.queue.filter(i => i.hours > 0);
      for (const d of done) finishRecruit(c, d);
    }
    if (G.hour % 24 === 0) dayTick();
    else if (G.hour % 6 === 0) playerOrders();
  }
  function recoverOrg(a, f) {
    const c = G.countries[a.owner];
    const rate = 0.006 * f * a.supply * (0.8 + 0.4 * c.ws);
    for (const u of a.units) u.org = Math.min(1, u.org + rate);
  }

  function dayTick() {
    for (const c of Object.values(G.countries)) {
      if (!c.alive) continue;
      const war = isAtWar(c.tag);
      c.pp += 1 + (c.gov === 'Authoritarian' ? 0.2 : 0);
      const d = COUNTRY_DEFS.find(x => x.tag === c.tag);
      c.manpower += Math.round(d.pop * 1e6 * 0.00003 * (0.5 + c.stab) * (war ? 1.5 : 1));
      c.equipment += c.mil * 12 * (0.7 + 0.5 * c.stab);
      if (!war) c.ws += (GOV_BASE[c.gov].ws - c.ws) * 0.01;
      c.stab += (GOV_BASE[c.gov].stab - c.stab) * 0.005 - (war && c.ws < 0.3 ? 0.001 : 0);
      c.stab = Math.max(0, Math.min(1, c.stab)); c.ws = Math.max(0, Math.min(1, c.ws));
    }
    for (const a of G.armies) {
      a.supply = computeSupply(a);
      if (a.supply < 0.35) for (const u of a.units) u.str = Math.max(0.1, u.str - 0.004 * (0.35 - a.supply) / 0.35);
      // reinforcement in friendly territory
      if (G.owner[a.prov] === a.owner && !a.battle) {
        const c = G.countries[a.owner];
        for (const u of a.units) {
          if (u.str >= 1) continue;
          const need = Math.min(0.03, 1 - u.str);
          const mp = need * UNIT_TYPES[u.type].mp, eq = need * UNIT_TYPES[u.type].eq;
          if (c.manpower >= mp && c.equipment >= eq) { c.manpower -= mp; c.equipment -= eq; u.str += need; }
        }
      }
    }
    checkCapitulations();
    const day = Math.floor(G.hour / 24);
    for (const c of Object.values(G.countries)) {
      if (!c.alive || c.tag === G.player) continue;
      const war = isAtWar(c.tag);
      if (war || (day + c.tag.charCodeAt(0)) % 7 === 0) aiCountry(c);
    }
    playerOrders();
  }

  function notify(text, prov, kind, pause) {
    G.log.unshift({ hour: G.hour, text, prov, kind });
    if (G.log.length > 80) G.log.pop();
    hooks.notify(text, prov, kind);
    if (pause && G.settings.autoPause && !G.paused) { G.paused = true; hooks.pause(text); }
  }

  return {
    init, newGame, hourTick, dateStr, hooks,
    get G() { return G; }, set G(v) { G = v; },
    get MAP() { return MAP; },
    atWar, allied, isAtWar, enemiesOf, family, root, canEnter, declareWar, findPath,
    army, armiesAt, hostilesAt, armyStats, armyPower, armySpeed, manpowerOf, battleAt, distKm,
    orderMove, orderHold, orderDefend, orderRetreat, mergeArmies, splitArmy, recruit, canRecruit,
    computeSupply
  };
})();
