// Simulation: game state, clock, armies, movement, combat, wars, capitulation and AI.
'use strict';
const Sim = (function () {
  let MAP = null;   // generated map
  let G = null;     // game state (serialisable)
  let nbDist = [];  // km between adjacent provinces
  const hooks = { notify: () => {}, pause: () => {}, gameOver: () => {}, lost: () => {}, battleEnd: () => {}, battleStart: () => {}, captured: () => {}, promoted: () => {} };

  let START = Date.UTC(1936, 0, 1, 0, 0, 0);  // reset per era in newGame
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const ORD = n => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');
  let rng = mulberry32(42);

  function dateTime() { return START + G.hour * 3600e3; }
  function dateOf(hour) { return new Date(START + hour * 3600e3); }
  function dateStr(hour, withTime) {
    const d = dateOf(hour);
    const y = d.getUTCFullYear();
    const s = d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()] + ' ' + (typeof Eras !== 'undefined' ? Eras.yearLabel(y) : y);
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
    START = typeof Eras !== 'undefined' ? Eras.startTime() : START;
    if (typeof Tech !== 'undefined') Tech.registerUnlocks();
    rng = mulberry32(1936 + playerTag.charCodeAt(0) * 7 + playerTag.charCodeAt(1));
    G = {
      hour: 0, speed: 2, paused: true, player: playerTag, over: false, ownVer: 0,
      countries: {}, owner: MAP.provs.map(p => p.owner),
      armies: [], nextArmy: 1, battles: [], nextBattle: 1, wars: [], nextWar: 1,
      log: [], stats: { captured: 0, lost: 0, battlesWon: 0, battlesLost: 0 },
      settings: { autoPause: true, pauseWar: true, pauseBattle: false, pauseLoss: true, pauseCities: false, pauseCapitulation: false, pauseMinor: false },
      // diplomacy: relation changes, factions, pacts, guarantees, trade deals, cooldowns and war claims
      dip: { rel: {}, factions: [], facOf: {}, nextFac: 1, pacts: {}, guar: [], trade: [], embargo: [], plan: {}, cd: {}, claims: {} }
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
    const eraWars = typeof Eras !== 'undefined' && !Eras.isBase();
    if (!eraWars) for (const d of COUNTRY_DEFS) spawnInitialArmies(d);
    if (eraWars) {
      // the era's opening wars: [attacker, defender, attacker allies, defender allies, name]
      for (const [a, d, aAll, dAll, name] of Eras.wars()) {
        const w = G.countries[a] && G.countries[d] && declareWar(a, d, true);
        if (!w) continue;
        for (const [side, list] of [[w.attackers, aAll], [w.defenders, dAll]])
          for (const t of list) if (G.countries[t]) for (const x of coalition(t)) if (!w.attackers.includes(x) && !w.defenders.includes(x)) side.push(x);
        if (name) w.name = name;
      }
      // alliances already standing on the first day (after the wars, so a member's war does not drag in the rest)
      for (const [name, members] of Eras.factions()) {
        const live = members.filter(t => G.countries[t] && !G.dip.facOf[t]);
        if (live.length < 2) continue;
        const f = { id: G.dip.nextFac++, name, leader: live[0], members: live, since: 0 };
        G.dip.factions.push(f);
        for (const t of live) G.dip.facOf[t] = f.id;
      }
      // armies are placed once the wars are known, so nations already at war start on their fronts
      for (const d of COUNTRY_DEFS) spawnInitialArmies(d);
    } else declareWar('ITA', 'ETH', true);
    if (typeof Tech !== 'undefined') Tech.setup();
    if (typeof Economy !== 'undefined') Economy.setup();
    if (typeof Navy !== 'undefined') Navy.setup();
    if (typeof Air !== 'undefined') Air.setup();
    if (typeof Events !== 'undefined') Events.setup();
    if (typeof Routes !== 'undefined') Routes.setup();
    return G;
  }

  // continue a saved game: the state is plain data, the rest is rebuilt around it
  function restore(g) {
    START = typeof Eras !== 'undefined' ? Eras.startTime() : START;
    if (typeof Tech !== 'undefined') Tech.registerUnlocks();
    G = g;
    rng = mulberry32(1936 + g.hour * 13 + g.player.charCodeAt(0) * 7 + g.player.charCodeAt(1));
    if (typeof Economy !== 'undefined') Economy.restore();
    if (typeof Routes !== 'undefined') { Routes.restore(); if (!G.routes.length) Routes.setup(); }
    if (typeof Navy !== 'undefined' && G.fleets) Navy.restore();
    if (typeof Air !== 'undefined') Air.restore();
    if (typeof Events !== 'undefined' && !G.ev) Events.setup();
    G.ownVer++;
    return G;
  }

  function commanderFor(c) {
    const pool = NAME_POOLS[c.culture] || NAME_POOLS.oth;
    const initial = 'ABCDEFGHJKLMNOPRSTVW'[Math.floor(rng() * 20)];
    const rank = typeof Eras !== 'undefined' ? Eras.rankFor(c.culture) : 'Gen.';
    return { name: rank + ' ' + initial + '. ' + pool[Math.floor(rng() * pool.length)], skill: 1 + Math.floor(rng() * 4), xp: 0, traits: [] };
  }
  // ---------- commanders learn ----------
  // Every hour in battle teaches a commander something, a win teaches more. Enough of it and they rise a
  // grade (skill, up to 5) and pick up a habit from how they won: Offensive, Defensive or Swift.
  const TRAITS = {
    offensive: { name: 'Offensive', desc: 'Attacks hit 10% harder' },
    defensive: { name: 'Defensive', desc: 'Defends 10% better' },
    swift: { name: 'Swift', desc: 'Marches 10% faster' }
  };
  const MAX_SKILL = 5;
  const xpNeed = c => 80 * c.skill;
  const hasTrait = (a, t) => !!(a.commander.traits && a.commander.traits.includes(t));
  function gainXp(a, n, role) {
    const c = a.commander;
    if (!c.traits) c.traits = [];
    c.xp = (c.xp || 0) + n;
    if (c.skill >= MAX_SKILL) { c.xp = Math.min(c.xp, xpNeed(c)); return; }
    if (c.xp < xpNeed(c)) return;
    c.xp -= xpNeed(c); c.skill++;
    let trait = null;
    if (c.traits.length < 2) {
      const want = role === 'atk' ? 'offensive' : role === 'def' ? 'defensive' : 'swift';
      trait = !c.traits.includes(want) ? want : ['offensive', 'defensive', 'swift'].find(t => !c.traits.includes(t));
      c.traits.push(trait);
    }
    if (isHuman(a.owner)) tell(a.owner, c.name + ' of the ' + a.name + ' has been promoted (skill ' + c.skill + ')' + (trait ? ' and is now known as ' + TRAITS[trait].name + '.' : '.'), a.prov, 'win', false);
    try { hooks.promoted(a, trait); } catch (e) { console.error(e); }
  }
  // an ambush needs cover: woods, hills, mountains, marsh, jungle or streets
  const AMBUSH_GROUND = { forest: 1, hills: 1, mountains: 1, jungle: 1, marsh: 1, urban: 1 };
  function canAmbush(a) {
    return !a.sea && !a.battle && a.units.length > 0 && !!AMBUSH_GROUND[MAP.provs[a.prov].terrain] && (G.owner[a.prov] === a.owner || allied(a.owner, G.owner[a.prov]));
  }
  function orderAmbush(a) {
    if (!canAmbush(a)) return false;
    orderHold(a); a.order = 'ambush';
    return true;
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
      const eraType = typeof Eras !== 'undefined' ? Eras.pickUnitType(d, rng) : null;
      if (eraType) { types.push(eraType); continue; }
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
    // already at war (a historical start in mid-war): hold every province that faces the enemy, occupied land included
    const foes = enemiesOf(d.tag);
    if (foes.size) {
      const front = MAP.provs.filter(p => G.owner[p.id] === d.tag && p.nb.some(q => foes.has(G.owner[q])))
        .map(p => ({ p, w: (p.nb.reduce((s, q) => s + (foes.has(G.owner[q]) ? (G.countries[G.owner[q]].mil + 1) : 0), 0) + (p.capital ? 20 : 0) + rng() * 2) *
          (distKm(p.id, c.capital) < 2500 ? 1 : 0.08) }))   // far-off colonial fronts get small garrisons, not field armies
        .sort((a, b) => b.w - a.w).map(o => o.p.id);
      // expeditionary forces (the British in France, the Indian Army in Mesopotamia): d.deploy = [[lon, lat, share], ...]
      for (const [lon, lat, share] of (d.deploy || [])) {
        const n = Math.min(types.length - 1, Math.round(nd * share));
        if (n <= 0) continue;
        const spots = MAP.provs.filter(p => (G.owner[p.id] === d.tag || allied(d.tag, G.owner[p.id])) && !COUNTRY_BY_TAG[G.owner[p.id]]?.unclaimed)
          .sort((a, b) => GEO.haversineKm(lon, lat, a.lon, a.lat) - GEO.haversineKm(lon, lat, b.lon, b.lat)).slice(0, Math.max(1, Math.ceil(n / 4)));
        const take = types.splice(0, n);
        spots.forEach((p, i) => { const part = take.slice(Math.floor(i * n / spots.length), Math.floor((i + 1) * n / spots.length)); if (part.length) newArmy(d.tag, p.id, part.map(t => makeUnit(t))).entrench = Eras.trench ? Eras.trench().max * 0.9 : 0.1; });
      }
      if (front.length) {
        const nd2 = types.length, keep = Math.floor(nd2 * 0.15), field = nd2 - keep;
        const nF = Math.min(front.length, Math.max(1, Math.ceil(field / 3)));
        let k = 0;
        for (let i = 0; i < nF; i++) {
          const n = Math.floor((i + 1) * field / nF) - Math.floor(i * field / nF);
          if (n > 0) newArmy(d.tag, front[i], types.slice(k, k + n).map(t => makeUnit(t))).entrench = Eras.trench ? Eras.trench().max * 0.9 : 0.1;
          k += n;
        }
        if (k < nd2) newArmy(d.tag, c.capital, types.slice(k).map(t => makeUnit(t))).entrench = 0.1;
        return;
      }
    }
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
  // Overlords and deaths change rarely, so each nation's root and family are worked out once per game hour
  // (or again after relDirty(), which every overlord or alive change calls). The AI asks for them constantly.
  let famMemo = null;
  function relMemo() {
    if (!famMemo || famMemo.G !== G || famMemo.hour !== G.hour) famMemo = { G, hour: G.hour, root: new Map(), fam: null };
    return famMemo;
  }
  function relDirty() { famMemo = null; }
  function root(tag) {
    const m = relMemo();
    let r = m.root.get(tag);
    if (r !== undefined) return r;
    let t = tag, guard = 0;
    while (G.countries[t] && G.countries[t].overlord && G.countries[G.countries[t].overlord] && G.countries[G.countries[t].overlord].alive && guard++ < 5) t = G.countries[t].overlord;
    m.root.set(tag, t);
    return t;
  }
  function family(tag) {
    const m = relMemo();
    if (!m.fam) {
      m.fam = new Map();
      for (const c of Object.values(G.countries)) if (c.alive) { const r = root(c.tag); if (!m.fam.has(r)) m.fam.set(r, []); m.fam.get(r).push(c.tag); }
    }
    return (m.fam.get(root(tag)) || []).slice();
  }
  // Which side of which war each nation is on. Alliances like NATO put 30 and more nations on one side, and the AI
  // asks "at war?" and "allied?" tens of thousands of times a day, so the answer comes from an index. The index is
  // checked against the war list on every use (cheap: a few comparisons per war) and rebuilt when anything changed.
  let warIdx = null;
  function warIndex() {
    const ws = G.wars, X = warIdx;
    if (X && X.G === G && X.ws === ws && X.sig.length === ws.length * 5) {
      let ok = true;
      for (let i = 0, j = 0; i < ws.length; i++, j += 5) {
        const w = ws[i], q = X.sig;
        if (w !== q[j] || w.attackers !== q[j + 1] || w.defenders !== q[j + 2] || w.attackers.length !== q[j + 3] || w.defenders.length !== q[j + 4]) { ok = false; break; }
      }
      if (ok) return X;
    }
    const side = new Map(), sig = [];
    const add = (t, w, sd) => { let m = side.get(t); if (!m) side.set(t, m = new Map()); if (!m.has(w)) m.set(w, sd); };
    for (const w of ws) {
      sig.push(w, w.attackers, w.defenders, w.attackers.length, w.defenders.length);
      for (const t of w.attackers) add(t, w, 'att');
      for (const t of w.defenders) add(t, w, 'def');
    }
    return (warIdx = { G, ws, sig, side });
  }
  const NONE = new Map();
  function sideOf(war, tag) {
    const m = warIndex().side.get(tag);
    if (m && m.has(war)) return m.get(war);
    if (!G.wars.includes(war)) return war.attackers.includes(tag) ? 'att' : war.defenders.includes(tag) ? 'def' : null;   // a war that has ended
    return null;
  }
  function atWar(a, b) {
    if (a === b) return false;
    const X = warIndex(), ma = X.side.get(a);
    if (!ma) return false;
    const mb = X.side.get(b) || NONE;
    for (const [w, sa] of ma) { const sb = mb.get(w); if (sb && sb !== sa) return true; }
    return false;
  }
  function factionOf(tag) { const id = G.dip.facOf[root(tag)]; return id ? G.dip.factions.find(f => f.id === id) || null : null; }
  const pairKey = (a, b) => a < b ? a + '|' + b : b + '|' + a;
  function hasPact(a, b) { const u = G.dip.pacts[pairKey(root(a), root(b))]; return !!u && u > G.hour; }
  // everyone who fights alongside a nation: its overlord's family plus its faction
  function coalition(tag) {
    const out = new Set(family(tag));
    const f = factionOf(tag);
    if (f) for (const m of f.members) if (G.countries[m] && G.countries[m].alive) family(m).forEach(t => out.add(t));
    return [...out];
  }
  function allied(a, b) {
    if (a === b) return true;
    if (root(a) === root(b)) return true;
    const fa = G.dip.facOf[root(a)];
    if (fa && fa === G.dip.facOf[root(b)]) return true;
    const X = warIndex(), ma = X.side.get(a);
    if (!ma) return false;
    const mb = X.side.get(b) || NONE;
    for (const [w, sa] of ma) if (mb.get(w) === sa) return true;
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
  function isAtWar(tag) { return warIndex().side.has(tag); }
  // unclaimed land in the historical eras (tag UNC) is open to anyone and taken by marching in
  const wild = o => !!(COUNTRY_BY_TAG[o] && COUNTRY_BY_TAG[o].unclaimed);
  function canEnter(tag, prov) { const o = G.owner[prov]; return o === tag || allied(tag, o) || atWar(tag, o) || wild(o); }

  function declareWar(att, def, silent, opts) {
    if (att === def || atWar(att, def) || allied(att, def)) return null;
    if (hasPact(att, def) && !(opts && opts.breakPact)) return null;
    const A = coalition(att), D = coalition(def).filter(t => !A.includes(t)), D0 = D.slice();
    // guarantors of anyone attacked come to their defence
    for (const g of G.dip.guar) {
      if (!D.includes(g.of) || A.includes(g.by) || D.includes(g.by) || !G.countries[g.by]?.alive) continue;
      if (D0.some(t => atWar(g.by, t))) continue;   // already fighting the side it would defend
      for (const t of coalition(g.by)) if (!A.includes(t) && !D.includes(t)) D.push(t);
    }
    // a war ends every pact between the two sides and sours relations
    for (const a of A) for (const d of D) { delete G.dip.pacts[pairKey(root(a), root(d))]; if (typeof Economy !== 'undefined') Economy.endDealsBetween(a, d, 'war'); }
    const rk = pairKey(att, def); G.dip.rel[rk] = (G.dip.rel[rk] || 0) - 50;
    const war = { id: G.nextWar++, attackers: A, defenders: D, leaderA: att, leaderD: def, goal: 'Conquer ' + G.countries[def].name, start: G.hour };
    const total = A.length + D.length;
    war.name = total >= 8 ? 'World War' : G.countries[att].name + '–' + G.countries[def].name + ' War';
    G.wars.push(war);
    for (const t of A.concat(D)) { const c = G.countries[t]; c.ws = Math.min(1, c.ws + 0.1); }
    if (!silent) {
      // the clock stops only when someone else drags the player into a war, not for wars it starts itself
      const onPlayer = D.includes(G.player) || (A.includes(G.player) && att !== G.player && !allied(att, G.player));
      notify(G.countries[att].name + ' declared war on ' + G.countries[def].name + '.', G.countries[def].capital, 'war', onPlayer && G.settings.pauseWar);
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
  // armies already at sea (past embarkation) don't hold the province they left
  const ashore = a => !a.sea || a.sea.phase === 'prep';
  function hostilesAt(tag, prov) { return G.armies.filter(a => a.prov === prov && !a.retreating && ashore(a) && atWar(a.owner, tag)); }
  function armySpeed(a) {
    let s = Infinity, slow = null;
    for (const u of a.units) { const v = UNIT_TYPES[u.type].speed; if (v < s) { s = v; slow = u.type; } }
    s *= 0.6 + 0.4 * a.supply;
    if (slow && typeof Tech !== 'undefined') s *= 1 + Tech.modFast(a.owner, 'speed', slow, a.prov);
    // motor units crawl without fuel
    const eco = G.countries[a.owner].eco;
    if (slow && eco && eco.sat && typeof Economy !== 'undefined' && Economy.oilEra() && (Tech.unitClass(slow) === 'motorised' || UNIT_TYPES[slow].armor)) s *= 0.5 + 0.5 * eco.sat.fuel;
    if (a.order === 'redeploy') s *= 2.5;
    if (a.order === 'forced') s *= 1.5;
    if (hasTrait(a, 'swift')) s *= 1.1;
    if (a.retreating) s *= 1.3;
    return s;
  }
  function armyStats(a) {
    let str = 0, org = 0, divs = a.units.length;
    for (const u of a.units) { str += u.str; org += u.org; }
    return { str: divs ? str / divs : 0, org: divs ? org / divs : 0, divs };
  }
  // opt (battles only): breach = share of the defenders' trenches and forts the attackers' tanks, gas and
  // stormtroops cancel; drone = how much of their drones' strike gets through the enemy's jamming and air defence
  function armyPower(a, role, terrain, opt) {
    opt = opt || {};
    let v = 0;
    const T = TERRAIN[terrain];
    const TX = typeof Tech !== 'undefined';
    for (const u of a.units) {
      const t = UNIT_TYPES[u.type];
      const m = TX ? 1 + Tech.modFast(a.owner, role === 'atk' ? 'attack' : 'defence', u.type, a.prov) : 1;
      // storming a beach from the boats: marines are trained for it
      const land = a.landing && role === 'atk' ? (u.type === 'marines' || t.symbol === 'mar' ? 0.85 : 0.5) : 1;
      const dr = t.drone && opt.drone !== undefined ? opt.drone : 1;
      if (role === 'atk') v += t.atk * u.str * (0.3 + 0.7 * u.org) * T.atk * (t.armor ? T.armor : 1) * m * land * dr;
      else v += t.def * u.str * (0.4 + 0.6 * u.org) * m;
    }
    const c = G.countries[a.owner];
    const skill = a.commander.skill + (TX ? Tech.modFast(a.owner, 'commander', '', -1) : 0);
    // technology: in 2026 the level counts twice over (power ~ level squared), in other eras once
    const lvl = TX ? Tech.level(a.owner) : c.tech, wt = typeof Eras !== 'undefined' ? Eras.techWeight() : 1;
    v *= (wt === 1 ? lvl : Math.pow(lvl, wt)) * (1 + 0.05 * skill) * (0.5 + 0.5 * a.supply);
    if (role === 'def') v *= 1 + (a.entrench + fortBonus(a.owner, a.prov)) * (1 - (opt.breach || 0));
    if (a.commander.traits && a.commander.traits.length) v *= 1 + (hasTrait(a, role === 'atk' ? 'offensive' : 'defensive') ? 0.1 : 0);
    return v;
  }
  function fortBonus(tag, prov) {
    if (typeof Economy === 'undefined' || !Economy.infra) return 0;
    const f = Economy.infra(prov, 'fort');
    return f && (G.owner[prov] === tag || allied(tag, G.owner[prov])) ? 0.15 * f : 0;
  }
  function manpowerOf(a) { return a.units.reduce((s, u) => s + UNIT_TYPES[u.type].mp * u.str, 0); }

  // ---------- orders ----------
  // an army caught between two province centres walks back to its own centre (a.lead) instead of
  // jumping there when an order turns it round or stops it
  function walkBack(a) {
    if (a.path.length && a.progress > 0) a.lead = { to: a.path[0], km: Math.min(a.progress, distKm(a.prov, a.path[0])) };
    a.path = []; a.progress = 0;
  }
  function pathKm(from, path) { let s = 0, p = from; for (const n of path) { s += distKm(p, n); p = n; } return s; }
  function orderMove(a, dest, kind) {
    if (a.sea && a.sea.phase !== 'prep') return false;
    if (a.sea) a.sea = null;   // a new order calls off the planned landing
    if (a.battle) leaveBattle(a);
    const mode = kind === 'redeploy' ? 'redeploy' : 'move';
    // mid-leg, the army is really between a.prov and the next province: keep going forward when that is
    // the shorter way to the new destination, otherwise turn round where it stands
    const next = a.lead ? a.lead.to : a.path.length && a.progress > 0 ? a.path[0] : -1;
    const done = a.lead ? a.lead.km : a.progress;
    const path = findPath(a.owner, a.prov, dest, mode);
    let fwd = null;
    if (next >= 0 && canEnter(a.owner, next) && !hostilesAt(a.owner, next).length) {
      const rest = next === dest ? [] : findPath(a.owner, next, dest, mode);
      if (rest) fwd = [next].concat(rest);
    }
    if (fwd && (!path || pathKm(a.prov, fwd) - done <= pathKm(a.prov, path) + done)) {
      a.path = fwd; a.progress = done; a.lead = null;      // carry on along the current leg
    } else {
      if (!path) return false;
      if (!a.lead) walkBack(a);
      a.path = path; a.progress = 0;
    }
    a.order = kind || 'move'; a.target = dest; a.retreating = false; a.chase = 0;
    return true;
  }
  function orderHold(a) { if (a.sea && a.sea.phase === 'prep') a.sea = null; if (a.battle) leaveBattle(a); walkBack(a); a.order = 'hold'; a.target = -1; a.frontTag = null; a.chase = 0; }
  function orderDefend(a, frontTag) { if (a.sea) return; if (a.battle) leaveBattle(a); walkBack(a); a.order = 'defend'; a.frontTag = frontTag || null; a.target = -1; a.chase = 0; }
  // attack an enemy army and keep following it until it is destroyed or the order is changed
  function orderChase(a, target) {
    if (!target || !atWar(a.owner, target.owner)) return false;
    const dest = target.path.length && target.path[0] !== a.prov ? target.path[0] : target.prov;
    if (dest === a.prov) { orderHold(a); a.order = 'attack'; a.chase = target.id; return true; }
    if (!orderMove(a, dest, 'move') && (dest === target.prov || !orderMove(a, target.prov, 'move'))) return false;
    a.order = 'attack'; a.chase = target.id;
    return true;
  }
  function chaseStep(a) {
    const t = army(a.chase);
    if (!t || !t.units.length || !atWar(a.owner, t.owner)) {
      a.chase = 0;
      if (a.order === 'attack' && !a.battle) { walkBack(a); a.order = 'hold'; a.target = -1; }
      tell(a.owner, a.name + (t && t.units.length ? ' broke off the pursuit.' : ' has destroyed the enemy army it was hunting.'), a.prov, t && t.units.length ? 'info' : 'win', false);
      return;
    }
    if (a.battle || a.sea) return;
    if (a.order !== 'attack') { if (armyStats(a).org < 0.3) return; a.order = 'attack'; }
    if (t.sea) return;
    // aim where the enemy army is going, not the province it is leaving: its next stop while it marches
    let dest = t.prov;
    if (t.path.length) {
      const nx = t.path[0];
      // it is marching into our province: stand and meet it here
      if (nx === a.prov) { if (a.path.length) { walkBack(a); a.target = a.prov; } return; }
      dest = nx;
    }
    if (dest === a.prov) return;
    if (a.target === dest && a.path.length && a.path[a.path.length - 1] === dest) return;
    const id = t.id;
    if (orderMove(a, dest, 'move')) { a.order = 'attack'; }
    a.chase = id;
  }
  function orderRetreat(a) {
    const c = G.countries[a.owner];
    if (a.sea) { if (typeof Navy !== 'undefined') Navy.cancelInvasion(a); return true; }
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
    if (list.some(a => a.sea)) return null;
    for (const a of list.slice(1)) {
      if (a.owner !== base.owner || a.prov !== base.prov) continue;
      if (a.battle) leaveBattle(a);
      base.units.push(...a.units);
      removeArmy(a);
    }
    return base;
  }
  function splitArmy(a) {
    if (a.units.length < 2 || a.sea) return null;
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
      for (const pl of humans()) if (allied(a.owner, pl) || defs.some(d => allied(d.owner, pl))) {
        tell(pl, 'Battle of ' + MAP.provs[prov].name + ' has begun.', prov, 'battle', G.settings.pauseBattle && (a.owner === pl || defs.some(d => d.owner === pl)));
      }
      // an army lying in wait springs its ambush: the attackers are caught strung out on the march
      const lying = defs.filter(d => d.order === 'ambush');
      if (lying.length) {
        b.ambush = lying.length;
        for (const d of lying) d.order = 'hold';
        for (const pl of humans()) if (allied(a.owner, pl) || lying.some(d => allied(d.owner, pl)))
          tell(pl, (lying.some(d => allied(d.owner, pl)) ? 'Our ambush at ' : 'Ambushed at ') + MAP.provs[prov].name + '!', prov, lying.some(d => allied(d.owner, pl)) ? 'win' : 'loss', false);
      }
    }
    if (b.ambush && G.hour - b.start < 24 && !b.attackers.includes(a.id)) for (const u of a.units) u.org = Math.max(0, u.org - 0.15);
    if (!b.attackers.length) { b.attackers.push(a.id); b.from[a.id] = a.prov; try { hooks.battleStart(b); } catch (e) { console.error(e); } }
    if (!b.attackers.includes(a.id)) { b.attackers.push(a.id); b.from[a.id] = a.prov; }
    a.battle = b.id; a.entrench = 0;
  }
  function leaveBattle(a) {
    const b = G.battles.find(x => x.id === a.battle);
    if (b) b.attackers = b.attackers.filter(id => id !== a.id);
    a.battle = 0; a.landing = false;
  }
  // winner: 'atk' or 'def' when the fight was decided, nothing when it simply broke off
  function endBattle(b, winner) {
    G.battles = G.battles.filter(x => x !== b);
    if (winner) { b.end = G.hour; b.winner = winner; try { hooks.battleEnd(b); } catch (e) { console.error(e); } }
    for (const id of b.attackers) { const a = army(id); if (a && a.battle === b.id) { a.battle = 0; a.landing = false; } }
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
    const kitA = battleKit(atts, b.atkTag), kitD = battleKit(defs, b.defTag);
    // drones get through what the other side's jammers and air defence miss
    const droneA = Math.max(0.25, 1 - kitD.counter), droneD = Math.max(0.25, 1 - kitA.counter);
    let A = 0, B = 0, D = 0, F = 0;
    for (const a of atts) { A += armyPower(a, 'atk', prov.terrain, { drone: droneA }); B += armyPower(a, 'def', prov.terrain) * 0.6; }
    // trench eras: only so many divisions fit on the stretch of front being attacked
    const fw = frontageMul(atts, defs);
    A *= flank * recon * fw; B *= fw;
    for (const d of defs) { D += armyPower(d, 'def', prov.terrain, { breach: kitA.breach }); F += armyPower(d, 'atk', 'plains', { drone: droneD }) * 0.9; }
    const amb = b.ambush && G.hour - b.start < 24 ? 1.35 : 1;
    D *= amb; F *= amb;
    for (const a of atts) gainXp(a, 1, 'atk');
    for (const d of defs) gainXp(d, 1, 'def');
    // aircraft overhead and warships off the coast; air defence on the ground blunts the enemy's planes
    const airA = typeof Air !== 'undefined' ? Air.battleBonus(b.atkTag, b.prov) : { mul: 1 }, airD = typeof Air !== 'undefined' ? Air.battleBonus(b.defTag, b.prov) : { mul: 1 };
    if (airA.mul > 1) airA.mul = 1 + (airA.mul - 1) * (1 - kitD.aa);
    if (airD.mul > 1) airD.mul = 1 + (airD.mul - 1) * (1 - kitA.aa);
    const navA = typeof Navy !== 'undefined' && G.fleets ? Navy.shoreSupport(b.atkTag, b.prov) : 0, navD = typeof Navy !== 'undefined' && G.fleets ? Navy.shoreSupport(b.defTag, b.prov) : 0;
    A *= airA.mul * (1 + navA); F *= airD.mul * (1 + navD);
    const landing = atts.some(a => a.landing), fort = fortBonus(b.defTag, b.prov);
    const ra = Math.max(0.1, Math.min(6, A / Math.max(D, 1)));
    const rd = Math.max(0.1, Math.min(6, F / Math.max(B, 1)));
    // trench eras fight slower (Eras.trench().pace), so reserves can reach a threatened sector before it breaks
    const pace = 0.014 * ((typeof Eras !== 'undefined' && Eras.trench().pace) || 1);
    const hitD = pace * ra, hitA = pace * rd;
    const apply = (list, hit, key) => {
      for (const a of list) for (const u of a.units) {
        const t = UNIT_TYPES[u.type];
        const orgLoss = hit * (0.7 + rng() * 0.6) * 50 / t.org / (1 + (typeof Tech !== 'undefined' ? Math.max(-0.5, Tech.modFast(a.owner, 'org', u.type, a.prov)) : 0));
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
      ['Technology', typeof Tech !== 'undefined' ? Tech.level(b.atkTag) - Tech.level(b.defTag) : G.countries[b.atkTag].tech - G.countries[b.defTag].tech]
    ];
    if (kitA.breach > 0.01) b.mods.push(['Tanks, gas and assault troops', kitA.breach * avg(defs.map(d => d.entrench))]);
    if (kitA.drones || kitD.drones) b.mods.push(['Drones', (kitA.drones ? droneA * 0.1 : 0) - (kitD.drones ? droneD * 0.1 : 0)]);
    if (kitA.aa > 0.01 || kitD.aa > 0.01) b.mods.push(['Air defence', kitD.aa * 0.1 - kitA.aa * 0.1]);
    if (fronts > 1) b.mods.push(['Attack from ' + fronts + ' sides', flank - 1]);
    if (recon > 1) b.mods.push(['Reconnaissance', recon - 1]);
    if (fort) b.mods.push(['Fortifications', -fort]);
    if (amb > 1) b.mods.push(['Ambush', -(amb - 1)]);
    if (landing) b.mods.push(['Amphibious landing', -0.5]);
    if (airA.supB || airD.supB) b.mods.push(['Air superiority', (airA.supB || 0) - (airD.supB || 0)]);
    if (airA.cas || airD.cas) b.mods.push(['Close air support', (airA.cas || 0) - (airD.cas || 0)]);
    if (navA || navD) b.mods.push(['Naval gunfire', navA - navD]);
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
      // attackers win; the beaten defenders are destroyed where they stand (no running away)
      for (const d of defs) if (G.armies.includes(d)) destroyBeaten(d, b.prov);
      for (const a of atts) if (G.armies.includes(a)) gainXp(a, 30, 'atk');
      if (allied(b.atkTag, pl)) G.stats.battlesWon++;
      if (allied(b.defTag, pl)) G.stats.battlesLost++;
      for (const h of humans()) if (b.atkTag === h || defs.some(d => d.owner === h))
        tell(h, (b.atkTag === h ? 'Victory' : 'Defeat') + ' at ' + prov.name + '.', b.prov, b.atkTag === h ? 'win' : 'loss', false);
      for (const c of [b.atkTag, b.defTag]) { const cc = G.countries[c]; if (cc) cc.ws = Math.max(0, Math.min(1, cc.ws + (c === b.atkTag ? 0.004 : -0.004))); }
      endBattle(b, 'atk');
    } else if (aOrg < 0.12) {
      // the attack broke down: the beaten attackers are destroyed too
      for (const a of atts) if (G.armies.includes(a)) destroyBeaten(a, b.prov);
      for (const d of defs) if (G.armies.includes(d)) gainXp(d, 30, 'def');
      for (const h of humans()) if (b.atkTag === h || defs.some(d => d.owner === h))
        tell(h, 'The attack on ' + prov.name + ' was beaten off.', b.prov, b.atkTag === h ? 'loss' : 'win', false);
      endBattle(b, 'def');
    }
  }
  // trench eras: one army rarely beats a dug-in enemy, so idle armies next to the same enemy province attack it together
  function massedAttacks(tag, list, isEnemy, odds) {
    const ready = list.filter(a => !a.battle && !a.retreating && !a.path.length && a.units.length && !a.sea && G.owner[a.prov] === tag);
    if (ready.length < 2) return;
    const byTarget = new Map();
    for (const a of ready) {
      const st = armyStats(a);
      if (st.org < 0.7 || st.str < 0.6) continue;
      for (const n of MAP.provs[a.prov].nb) if (isEnemy(G.owner[n])) { if (!byTarget.has(n)) byTarget.set(n, []); byTarget.get(n).push(a); }
    }
    const used = new Set();
    const cands = [];
    for (const [n, group] of byTarget) {
      const hs = hostilesAt(tag, n);
      if (!hs.length || group.length < 2) continue;
      const T = MAP.provs[n].terrain, br = battleKit(group, tag).breach;
      const atk = group.reduce((s, a) => s + armyPower(a, 'atk', T), 0) * frontageMul(group, hs) * (1 + 0.1 * (new Set(group.map(a => a.prov)).size - 1));
      const def = hs.reduce((s, h) => s + armyPower(h, 'def', T, { breach: br }), 0) + reservesAt(tag, n);
      const air = typeof Air !== 'undefined' ? Air.battleBonus(tag, n).mul / Math.max(0.5, Air.battleBonus(G.owner[n], n).mul) : 1;
      const r = atk * air / (def + 1);
      if (r > odds) cands.push({ n, group, r: r * (MAP.provs[n].city ? 1.3 : 1) });
    }
    cands.sort((x, y) => y.r - x.r);
    for (const c of cands) {
      if (c.group.some(a => used.has(a))) continue;
      // keep one army back in each province so the line does not open behind the attack
      for (const a of c.group) {
        const others = G.armies.filter(o => o !== a && o.owner === tag && o.prov === a.prov && !o.path.length);
        if (!others.length && c.group.length > 2 && a === c.group[c.group.length - 1]) continue;
        a.path = [c.n]; a.progress = 0; used.add(a);
      }
    }
  }
  // trench eras: enemy armies next to province n that would march in to help hold it
  function reservesAt(tag, n) {
    let v = 0;
    for (const m of MAP.provs[n].nb) for (const h of hostilesAt(tag, m)) if (!h.battle) v += armyPower(h, 'def', MAP.provs[n].terrain) * 0.25;
    return v;
  }
  // attack power of the enemy armies around province n (not counting the one being attacked from)
  function exposedAt(tag, n, from) {
    let v = 0;
    for (const m of MAP.provs[n].nb) if (m !== from) for (const h of hostilesAt(tag, m)) v += armyPower(h, 'atk', MAP.provs[n].terrain);
    return v;
  }
  // trench eras (Eras.trench().frontage): an attack can use at most frontage x the defending divisions (+3);
  // a bigger stack adds nothing to the fight, it only waits behind the line
  function frontageMul(atts, defs) {
    const fr = typeof Eras !== 'undefined' ? Eras.trench().frontage : 0;
    if (!fr) return 1;
    const na = atts.reduce((s, a) => s + a.units.length, 0), nd = defs.reduce((s, a) => s + a.units.length, 0);
    return na ? Math.min(1, (fr * Math.max(1, nd) + 3) / na) : 1;
  }
  function avg(arr) { return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0; }
  // what a side brings beyond raw strength: trench-breaking (unit breach), air defence (unit aa),
  // drones, and counter-drone jamming (unit aa plus the counterDrone technology)
  function battleKit(list, tag) {
    let n = 0, br = 0, aa = 0, dr = 0;
    for (const a of list) for (const u of a.units) {
      const t = UNIT_TYPES[u.type]; n++;
      br += (t.breach || 0) * u.str; aa += (t.aa || 0) * u.str; if (t.drone) dr++;
    }
    n = Math.max(1, n);
    const jam = typeof Tech !== 'undefined' ? Tech.modFast(tag, 'counterDrone', '', -1) : 0;
    const air = Math.min(0.8, (typeof Eras !== 'undefined' && Eras.trench().aaK || 3) * aa / n);
    return { breach: Math.min(0.8, 2.5 * br / n), aa: air, drones: dr, counter: Math.min(0.75, air * 0.6 + jam) };
  }

  // an army that loses a battle does not run: what is left of it is killed or taken prisoner
  function destroyBeaten(a, prov) {
    tell(a.owner, a.name + ' was destroyed at ' + MAP.provs[prov].name + '.', prov, 'loss', false);
    for (const h of humans()) if (h !== a.owner && G.battles.some(x => x.prov === prov)) tell(h, G.countries[a.owner].name + ' ' + a.name + ' was destroyed at ' + MAP.provs[prov].name + '.', prov, 'win', false);
    G.countries[a.owner].losses += manpowerOf(a);
    removeArmy(a);
  }
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
    if (prev !== newOwner) hooks.captured(prov, prev, newOwner);
    if (newOwner === G.player) G.stats.captured++;
    if (isHuman(prev)) {
      if (prev === G.player) { G.stats.lost++; hooks.lost(prov, newOwner); }   // the red banner and map flash, for every province
      if (p.capital || p.city) {
        // only the capital falling stops the clock; other losses are notices (unless the player asked for city pauses, once a day at most)
        const pause = (G.settings.pauseLoss && p.capital) || (G.settings.pauseCities && p.city && !(G.hour - (G.lossPauseAt ?? -99) < 24));
        if (pause) G.lossPauseAt = G.hour;
        // the local player sees the banner instead of a toast; the log keeps the city
        if (prev === G.player) { G.log.unshift({ hour: G.hour, text: p.name + ' has fallen to ' + G.countries[tag].name + '.', prov, kind: 'loss', to: prev }); if (G.log.length > 80) G.log.pop(); if (pause && G.settings.autoPause && !G.paused) { G.paused = true; hooks.pause(); } }
        else tell(prev, p.name + ' has fallen to ' + G.countries[tag].name + '.', prov, 'loss', pause);
      }
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
      // a government in exile (Belgium, Serbia and Romania in 1917) fights on while its alliance does
      const d = COUNTRY_BY_TAG[c.tag];
      if (d && d.exile && MAP.provs.some(p => G.owner[p.id] === c.tag) && coalition(c.tag).some(t => t !== c.tag && G.countries[t].alive && isAtWar(t) && !COUNTRY_BY_TAG[t]?.exile)) continue;
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
    const myWars = G.wars.filter(w => w.attackers.includes(tag) || w.defenders.includes(tag));
    const leaders = myWars.map(w => w.attackers.includes(tag) ? w.leaderD : w.leaderA);
    if (tag !== G.player && typeof Peace !== 'undefined') {
      // the victors meet at a peace conference to share out the land
      const counts = {};
      MAP.provs.forEach(p => { if (p.core === tag && enemies.includes(G.owner[p.id])) counts[G.owner[p.id]] = (counts[G.owner[p.id]] || 0) + 1; });
      for (const w of G.wars) { w.attackers = w.attackers.filter(t => t !== tag); w.defenders = w.defenders.filter(t => t !== tag); }
      const ended = G.wars.filter(w => !w.attackers.length || !w.defenders.length);
      G.wars = G.wars.filter(w => w.attackers.length && w.defenders.length);
      for (const b of G.battles.slice()) if (!atWar(b.atkTag, b.defTag)) endBattle(b);
      notify(c.name + ' has capitulated.', c.capital, 'cap', false);   // a conference that needs the player pauses on its own
      for (const w of ended) notify('The ' + w.name + ' has ended.', -1, 'info', false);
      Peace.open(tag, enemies, counts, myWars.length ? myWars[0].name : '', leaders);
      return;
    }
    // the enemy holding the most of this country's land receives the rest
    const counts = {};
    MAP.provs.forEach(p => { if (p.core === tag && enemies.includes(G.owner[p.id])) counts[G.owner[p.id]] = (counts[G.owner[p.id]] || 0) + 1; });
    let winner = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0] || enemies[0];
    if (winner && G.countries[winner] && G.countries[winner].overlord && G.countries[G.countries[winner].overlord]?.alive && !counts[winner]) winner = root(winner);
    MAP.provs.forEach(p => { if (G.owner[p.id] === tag) G.owner[p.id] = winner; });
    G.ownVer++;
    for (const a of G.armies.filter(a => a.owner === tag)) removeArmy(a);
    c.alive = false; c.queue = [];
    dropFromDiplomacy(tag);
    for (const o of Object.values(G.countries)) if (o.overlord === tag) o.overlord = null;
    relDirty();
    for (const w of G.wars) { w.attackers = w.attackers.filter(t => t !== tag); w.defenders = w.defenders.filter(t => t !== tag); }
    const ended = G.wars.filter(w => !w.attackers.length || !w.defenders.length);
    G.wars = G.wars.filter(w => w.attackers.length && w.defenders.length);
    const involves = enemies.includes(G.player) || tag === G.player || allied(tag, G.player);
    notify(c.name + ' has capitulated' + (winner ? ' to ' + G.countries[winner].name : '') + '.', G.countries[winner]?.capital ?? -1, 'cap', tag === G.player);
    for (const w of ended) notify('The ' + w.name + ' has ended.', -1, 'info', false);
    if (tag === G.player) { G.over = true; G.paused = true; hooks.gameOver(false); }
    else if (!Object.values(G.countries).some(o => o.alive && o.tag !== G.player && atWar(o.tag, G.player)) && ended.some(w => sideOf(w, G.player) !== null)) { /* player's war ended */ }
  }

  function dropFromDiplomacy(tag) {
    const D = G.dip;
    for (const f of D.factions) f.members = f.members.filter(t => t !== tag);
    delete D.facOf[tag];
    D.factions = D.factions.filter(f => { if (!f.members.length) return false; if (!f.members.includes(f.leader)) f.leader = f.members[0]; return true; });
    D.guar = D.guar.filter(g => g.by !== tag && g.of !== tag);
    for (const k of Object.keys(D.pacts)) if (k.split('|').includes(tag)) delete D.pacts[k];
    if (typeof Economy !== 'undefined') Economy.dropNation(tag);
    if (typeof Navy !== 'undefined') Navy.dropNation(tag);
    if (typeof Air !== 'undefined') Air.dropNation(tag);
  }

  // ---------- supply ----------
  // Supply comes from home provinces, cities, supply hubs and ports the navy keeps open;
  // it thins out with every province it has to travel and with poor infrastructure.
  function sourceValue(tag, id) {
    const p = MAP.provs[id], o = G.owner[id];
    if (o !== tag && !allied(tag, o)) return 0;
    let v = 0;
    if (p.core === o && p.home) v = 1;
    else if (p.core === o) v = p.city ? 0.75 : 0.55;           // colonies feed troops a little
    const EC = typeof Economy !== 'undefined' && Economy.infra;
    if (EC && Economy.infra(id, 'hub')) v = Math.max(v, 1);
    if (G.countries[o] && G.countries[o].capital === id) v = 1;
    if (EC && typeof Navy !== 'undefined' && G.fleets && Economy.infra(id, 'port')) v = Math.max(v, Navy.portSupply(tag, id));
    return v;
  }
  // armies of one nation sharing a province share the answer; it is worked out again each game hour
  let armiesByProv = null;   // set while the daily supply pass runs
  let reachMemo = { G: null, hour: -1, ver: -1, m: new Map() };
  function supplyReach(tag, prov) {
    const iv = typeof Economy !== 'undefined' && Economy.infraVer ? Economy.infraVer() : 0;
    if (reachMemo.G !== G || reachMemo.hour !== G.hour || reachMemo.ver !== G.ownVer || reachMemo.iv !== iv) reachMemo = { G, hour: G.hour, ver: G.ownVer, iv, m: new Map() };
    const key = tag + ':' + prov;
    let r = reachMemo.m.get(key);
    if (r === undefined) { r = supplyReachRaw(tag, prov); reachMemo.m.set(key, r); }
    return r;
  }
  function supplyReachRaw(tag, prov) {
    let best = sourceValue(tag, prov);
    if (best >= 1) return 1;
    // supply fades 12% a province, or only 6% along a railway
    const RT = typeof Routes !== 'undefined' && Routes.any();
    const fac = new Map([[prov, 1]]); let fr = [prov];
    for (let d = 1; d <= 7 && fr.length; d++) {
      const nx = [];
      for (const q of fr) {
        const fq = fac.get(q);
        if (fq * 0.94 <= best) continue;
        for (const n of MAP.provs[q].nb) {
          const f = fq * (RT && Routes.railEdge(tag, q, n) ? 0.94 : 0.88);
          if (f <= best || (fac.has(n) && fac.get(n) >= f)) continue;
          const o = G.owner[n];
          if (o !== tag && !allied(tag, o)) continue;
          fac.set(n, f);
          const v = sourceValue(tag, n) * f;
          if (v > best) best = v;
          nx.push(n);
        }
      }
      fr = nx;
    }
    return best;
  }
  function computeSupply(a) {
    if (a.sea && a.sea.phase !== 'prep') return Math.max(0.3, a.supply || 0.8);
    const p = MAP.provs[a.prov];
    const owner = G.owner[a.prov];
    const friendly = owner === a.owner || allied(a.owner, owner);
    const rInf = typeof Routes !== 'undefined' ? Routes.infraAt(a.prov, a.owner) : 0;
    let base = friendly ? 0.55 + 0.09 * (p.infra + rInf) : 0.4;
    if (p.core !== a.owner && !allied(p.core, a.owner)) base *= 0.85;
    const reach = Math.max(0.12, supplyReach(a.owner, a.prov));
    const EC = typeof Economy !== 'undefined' && Economy.infra;
    const cap = 4 + (p.infra + rInf) * 4 + (p.city ? 6 : 0) + (p.capital ? 6 : 0) + (EC ? Economy.infra(a.prov, 'hub') * 12 + Economy.infra(a.prov, 'port') * 2 : 0);
    let demand = 0;
    for (const o of (armiesByProv && armiesByProv.get(a.prov)) || G.armies) if (o.prov === a.prov && allied(o.owner, a.owner)) for (const u of o.units) demand += UNIT_TYPES[u.type].supply;
    const capF = Math.min(1, cap / Math.max(1, demand));
    const tm = typeof Tech !== 'undefined' ? 1 + Tech.mod(a.owner, 'supply', { prov: a.prov }) : 1;
    // enemy aircraft over the roads
    let air = 1;
    if (typeof Air !== 'undefined' && G.wings && G.wings.length) { const sup = Air.superiority(a.owner, [p.lon, p.lat]); if (sup < 0.5) air = 0.7 + 0.6 * sup; }
    return Math.max(0.05, Math.min(1, base * reach * capF * tm * air));
  }

  // ---------- recruitment ----------
  function canRecruit(tag, type) {
    const c = G.countries[tag], t = UNIT_TYPES[type];
    if (!t || (typeof Eras !== 'undefined' && !Eras.isBase() && !Eras.unitsFor(tag).includes(type))) return false;
    if (t.locked && !(typeof Tech !== 'undefined' && Tech.unlocked(tag, type))) return false;
    return c.manpower >= mpCost(tag, type) && c.equipment >= t.eq;
  }
  // prov: where the new division gathers (one of your own provinces); the capital when left out
  function recruit(tag, type, armyId, prov) {
    const c = G.countries[tag], t = UNIT_TYPES[type];
    if (!canRecruit(tag, type)) return false;
    c.manpower -= mpCost(tag, type); c.equipment -= t.eq;
    const item = { type, hours: t.days * 24, total: t.days * 24, armyId: armyId || 0 };
    if (Number.isInteger(prov) && prov >= 0 && G.owner[prov] === tag) item.prov = prov;
    c.queue.push(item);
    return true;
  }
  function spawnProv(c, item) {
    if (item && Number.isInteger(item.prov) && G.owner[item.prov] === c.tag) return item.prov;
    return c.capital >= 0 && G.owner[c.capital] === c.tag ? c.capital : -1;
  }
  function mpCost(tag, type) { return Math.round(UNIT_TYPES[type].mp * Math.max(0.5, 1 + (typeof Tech !== 'undefined' ? Tech.mod(tag, 'recruitCost', { unit: type }) : 0))); }
  function finishRecruit(c, item) {
    const target = item.armyId ? army(item.armyId) : null;
    const u = makeUnit(item.type, 1); u.org = 0.5;
    if (target && target.owner === c.tag && !target.sea && (G.owner[target.prov] === c.tag)) { target.units.push(u); return; }
    const cap = spawnProv(c, item);
    if (cap < 0) return;
    let reserve = G.armies.find(a => a.owner === c.tag && a.prov === cap && a.reserve && a.units.length < 12);
    if (!reserve) { reserve = newArmy(c.tag, cap, []); reserve.reserve = true; }
    reserve.units.push(u);
    tell(c.tag, 'A new ' + UNIT_TYPES[item.type].name.toLowerCase() + ' division is ready in ' + MAP.provs[cap].name + '.', cap, 'info', false);
  }

  // ---------- AI ----------
  function aiCountry(c) {
    const war = isAtWar(c.tag);
    const myArmies = G.armies.filter(a => a.owner === c.tag);
    const divs = myArmies.reduce((s, a) => s + a.units.length, 0) + c.queue.length;
    // army size follows the danger it faces, and what the treasury can carry
    const threat = !war && typeof Diplo !== 'undefined' ? Diplo.threatOf(c.tag) : null;
    const e = c.eco, broke = e && e.need && e.gold < 0 && e.debtDays > 30;
    const want = Math.max(2, Math.round(c.baseDivs * (war ? 1.6 : threat ? 1.35 : broke ? 0.9 : 1.1)));
    let guard = 0;
    while (divs + guard < want && guard < 3 && !(broke && !war)) {
      let type = null;
      // short of the strategic good: pick units that do not need it
      for (let i = 0; i < 3; i++) {
        const r = rng();
        const eraType = typeof Eras !== 'undefined' ? Eras.pickUnitType(COUNTRY_BY_TAG[c.tag], rng) : null;
        type = eraType || (c.mil >= 8 && r < 0.15 ? 'tanks' : r < 0.3 ? 'artillery' : 'infantry');
        if (!(e && e.sat && e.sat.strategic < 0.6 && typeof Economy !== 'undefined' && Economy.stratUnit(type))) break;
      }
      if (!recruit(c.tag, type, 0)) break;
      guard++;
    }
    // at peace with a stronger hostile neighbour: move idle armies up to that border
    if (threat) guardBorder(c.tag, threat, myArmies);
    if (war) {
      // spread out: split big idle armies while parts of the front are uncovered
      const en = enemiesOf(c.tag);
      const front = MAP.provs.filter(p => G.owner[p.id] === c.tag && p.nb.some(n => en.has(G.owner[n])));
      const covered = new Set(G.armies.filter(a => a.owner === c.tag).map(a => a.path.length ? a.path[a.path.length - 1] : a.prov));
      let gaps = front.filter(p => !covered.has(p.id)).length;
      for (const a of myArmies.slice()) {
        if (gaps <= 0) break;
        if (!a.battle && !a.path.length && !a.sea && a.units.length >= 6) { splitArmy(a); gaps--; }
      }
      frontlineAI(c.tag, G.armies.filter(a => a.owner === c.tag), true);
    }
    // merge small reserve armies into nearby field armies
    for (const r of myArmies.filter(a => a.reserve && a.units.length >= 4 && !a.battle && !a.path.length)) r.reserve = false;
  }

  function guardBorder(tag, foe, mine) {
    const border = MAP.provs.filter(p => G.owner[p.id] === tag && p.nb.some(n => G.owner[n] === foe))
      .sort((a, b) => (b.capital ? 3 : 0) + (b.city ? 1 : 0) - (a.capital ? 3 : 0) - (a.city ? 1 : 0));
    if (!border.length) return;
    const on = new Map(border.map(p => [p.id, 0]));
    const idle = [];
    for (const a of mine) {
      const at = a.path.length ? a.path[a.path.length - 1] : a.prov;
      if (on.has(at)) on.set(at, on.get(at) + 1);
      else if (!a.battle && !a.path.length && !a.sea && !a.reserve && a.units.length >= 2) idle.push(a);
    }
    // keep about a third of the field armies home
    for (const a of idle.slice(0, Math.ceil(idle.length * 0.65))) {
      const tgt = border.reduce((b, p) => on.get(p.id) < on.get(b.id) ? p : b, border[0]);
      const path = findPath(tag, a.prov, tgt.id, 'move');
      if (path && path.length) { a.path = path; a.progress = 0; on.set(tgt.id, on.get(tgt.id) + 1); }
    }
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
      if (f) { f.def += armyPower(a, 'def', MAP.provs[f.id].terrain) / 20; f.divs = (f.divs || 0) + a.units.length; }
    }
    const tr = typeof Eras !== 'undefined' ? Eras.trench() : {};
    // trench eras want better odds before going over the top; a nation on the defensive (posture 'defend')
    // waits for far better odds still, and one grinding forward (posture 'grind') takes worse ones
    const pst = typeof COUNTRY_BY_TAG !== 'undefined' && COUNTRY_BY_TAG[tag] ? COUNTRY_BY_TAG[tag].posture : '';
    const odds = (tr.odds || 1.3) * (pst === 'defend' ? 1.6 : pst === 'grind' ? 0.85 : 1);
    const trenchy = !!tr.frontage;
    if (trenchy && allowAttack) massedAttacks(tag, list, isEnemy, odds);
    for (const a of list) {
      if (a.battle || a.retreating || a.path.length || !a.units.length || a.sea) continue;
      const st = armyStats(a);
      const here = fmap.get(a.prov);
      if (here && allowAttack && st.org > 0.7 && st.str > 0.6) {
        let best = null, bestScore = 0;
        for (const n of MAP.provs[a.prov].nb) {
          if (!isEnemy(G.owner[n])) continue;
          const hs = hostilesAt(tag, n);
          // tanks, gas, drones and rockets cancel part of the enemy's trenches (unit breach), so count them in the odds
          const br = hs.length ? battleKit([a], tag).breach : 0;
          const defP = hs.reduce((s, h) => s + armyPower(h, 'def', MAP.provs[n].terrain, { breach: br }), 0) + (trenchy && hs.length ? reservesAt(tag, n) : 0);
          const airR = trenchy && hs.length && typeof Air !== 'undefined' ? Air.battleBonus(tag, n).mul / Math.max(0.5, Air.battleBonus(G.owner[n], n).mul) : 1;
          const atkP = armyPower(a, 'atk', MAP.provs[n].terrain) * (hs.length ? frontageMul([a], hs) : 1) * airR;
          const ratio = atkP / (defP + 1);
          let score = defP === 0 ? 5 + (MAP.provs[n].city ? 2 : 0) : ratio > odds ? ratio : 0;
          // trench eras: no walking into an empty gap that strong enemy armies next to it would close on you
          if (score && trenchy && exposedAt(tag, n, a.prov) > atkP * 0.8) score = 0;
          if (MAP.provs[n].capital) score *= 1.5;
          if (score > bestScore) { bestScore = score; best = n; }
        }
        if (best !== null) { a.path = [best]; a.progress = 0; continue; }
      }
      if (here && here.def - armyPower(a, 'def', MAP.provs[a.prov].terrain) / 20 < here.threat * 0.8) continue; // needed here
      if (here && trenchy && a.entrench > tr.max * 0.5) continue;   // dug in on the front line: stay in the trenches
      if (trenchy && MAP.provs[a.prov].capital && G.owner[a.prov] === tag && !G.armies.some(o => o !== a && o.owner === tag && o.prov === a.prov)) continue;   // the capital keeps its garrison
      // move to the most under-defended frontier province nearby
      let target = null, bestNeed = -Infinity;
      const pa = MAP.provs[a.prov];
      for (const f of front) {
        // trench eras: a sector already holding a dozen divisions gets no more (a beaten stack dies whole)
        if (trenchy && (f.divs || 0) >= 12 && f.id !== a.prov) continue;
        const pf = MAP.provs[f.id];
        const d = GEO.haversineKm(pa.lon, pa.lat, pf.lon, pf.lat);
        const need = (f.threat - f.def) - d / 400;
        if (need > bestNeed) { bestNeed = need; target = f; }
      }
      if (target && target.id !== a.prov) {
        // reinforcements travel through friendly land only, never blundering into enemy armies on the way
        const path = findPath(tag, a.prov, target.id, 'redeploy') || findPath(tag, a.prov, target.id, 'move');
        if (path && path.length) { a.path = path; a.progress = 0; target.def += armyPower(a, 'def', MAP.provs[target.id].terrain) / 20; target.divs = (target.divs || 0) + a.units.length; }
      }
    }
  }

  function playerOrders() {
    for (const h of humans()) humanOrders(h);
  }
  function humanOrders(me) {
    const mine = G.armies.filter(a => a.owner === me);
    const defenders = mine.filter(a => a.order === 'defend');
    if (defenders.length) {
      const groups = {};
      defenders.forEach(a => { (groups[a.frontTag || '*'] = groups[a.frontTag || '*'] || []).push(a); });
      for (const k in groups) frontlineAI(me, groups[k], false, k === '*' ? null : k);
    }
    for (const a of mine) {
      if (a.order === 'attack' && !a.battle && !a.path.length && a.target >= 0 && a.prov !== a.target) {
        const st = armyStats(a);
        if (st.org < 0.4) continue; // regroup before pressing on
        const path = findPath(a.owner, a.prov, a.target, 'move');
        if (path) a.path = path; else a.order = 'hold';
      }
      if ((a.order === 'attack' || a.order === 'move' || a.order === 'forced' || a.order === 'redeploy' || a.order === 'retreat') && a.prov === a.target && !a.path.length && !a.chase) { a.order = 'hold'; a.target = -1; }
    }
  }

  // ---------- ticks ----------
  function hourTick() {
    G.hour++;
    // movement
    for (const a of G.armies.slice()) {
      if (!G.armies.includes(a)) continue;
      a.rate = 0;   // km per hour this hour; the renderer uses it to glide between ticks
      if (a.sea && typeof Navy !== 'undefined' && Navy.stepArmy(a)) continue;
      if (a.chase) { chaseStep(a); if (!G.armies.includes(a)) continue; }
      if (a.battle) continue;
      if (a.lead) {                       // walking back to its own province centre first
        const sp = armySpeed(a);
        a.lead.km -= sp; a.rate = -sp;
        if (a.lead.km <= 0) a.lead = null;
        continue;
      }
      if (!a.path.length) {
        const tr = typeof Eras !== 'undefined' ? Eras.trench() : { max: 0.25, days: 10 };
        a.entrench = Math.min(tr.max, a.entrench + tr.max / (24 * tr.days));
        recoverOrg(a, 1);
        if (a.retreating) a.retreating = false;
        continue;
      }
      const next = a.path[0];
      if (!canEnter(a.owner, next)) {
        const re = a.target >= 0 && a.target !== next ? findPath(a.owner, a.prov, a.target, a.order === 'redeploy' ? 'redeploy' : 'move') : null;
        walkBack(a); a.path = re || []; continue;
      }
      if (!a.retreating && hostilesAt(a.owner, next).length) {
        if (a.order === 'redeploy') { walkBack(a); a.order = 'hold'; continue; }
        startBattle(a, next); continue;
      }
      a.entrench = 0;
      a.rate = armySpeed(a) * TERRAIN[MAP.provs[next].terrain].move * (atWar(a.owner, G.owner[next]) ? 0.6 : 1) * (typeof Routes !== 'undefined' ? Routes.speedMul(a.owner, a.prov, next) : 1);
      a.progress += a.rate;
      recoverOrg(a, 0.3);
      if (a.order === 'redeploy') for (const u of a.units) u.org = Math.max(0.2, u.org - 0.01);
      // forced march: the men get there faster, and tired (the 0.3 recovered this hour is taken back, and more)
      else if (a.order === 'forced') for (const u of a.units) u.org = Math.max(0.3, u.org - 0.006 - 0.006 * 0.3);
      if (a.progress >= distKm(a.prov, next)) {
        // carry the leftover distance into the next leg, so marching never stalls at a province centre
        const over = a.progress - distKm(a.prov, next);
        a.prov = next; a.path.shift(); a.progress = a.path.length ? Math.min(over, distKm(next, a.path[0]) * 0.9) : 0; a.landing = false;
        const o = G.owner[next];
        if (o !== a.owner && (atWar(a.owner, o) || wild(o))) capture(next, a.owner);
        if (!a.path.length) a.retreating = false;
      }
    }
    for (const b of G.battles.slice()) if (G.battles.includes(b)) stepBattle(b);
    if (typeof Navy !== 'undefined' && G.fleets) Navy.hour();
    // queue
    for (const c of Object.values(G.countries)) {
      if (!c.alive || !c.queue.length) continue;
      for (const item of c.queue) item.hours -= typeof Economy !== 'undefined' ? Economy.recruitRate(c.tag, item.type) : 1;
      const done = c.queue.filter(i => i.hours <= 0);
      c.queue = c.queue.filter(i => i.hours > 0);
      for (const d of done) finishRecruit(c, d);
    }
    // the day's work is split over the first four hours of each day, so no single frame carries all of it
    const hd = G.hour % 24;
    if (hd < DAY_PARTS.length) DAY_PARTS[hd]();
    if (G.hour % 6 === 0) playerOrders();
  }
  function recoverOrg(a, f) {
    const c = G.countries[a.owner];
    const rate = 0.006 * f * a.supply * (0.8 + 0.4 * c.ws) * (typeof Tech !== 'undefined' && a.units.length ? 1 + Math.max(-0.5, Tech.modFast(a.owner, 'org', a.units[0].type, -1)) : 1);
    for (const u of a.units) u.org = Math.min(1, u.org + rate);
  }

  // 1. sea and air first: convoy losses and bomb damage feed today's economy; AI landings are planned
  // right after the AI's fleets get their orders
  function daySeaAir() {
    if (typeof Navy !== 'undefined' && G.fleets) { Navy.daily(); Navy.aiInvasions(); }
    if (typeof Air !== 'undefined' && G.wings) Air.daily();
  }
  // 2. economy and research, then each nation's daily numbers
  function dayNations() {
    const ECO = typeof Economy !== 'undefined', TX = typeof Tech !== 'undefined';
    if (ECO) Economy.daily();
    if (typeof Routes !== 'undefined') Routes.daily();
    if (TX) Tech.daily();
    if (ECO && Math.floor(G.hour / 24) % 30 === 0) { Economy.monthly(); if (typeof Routes !== 'undefined') Routes.monthly(); }
    for (const c of Object.values(G.countries)) {
      if (!c.alive) continue;
      const war = isAtWar(c.tag);
      const M = (n, ctx) => TX ? Tech.mod(c.tag, n, ctx) : 0;
      c.pp += (1 + ((typeof Eras !== 'undefined' ? Eras.govClass(c.gov) : c.gov) === 'Authoritarian' ? 0.2 : 0)) * (1 + M('pp'));
      const d = COUNTRY_DEFS.find(x => x.tag === c.tag);
      const fed = c.eco && c.eco.sat ? c.eco.sat.food : 1;
      c.manpower += Math.round(d.pop * 1e6 * 0.00003 * (0.5 + c.stab) * (war ? 1.5 : 1) * fed * Math.max(0.2, 1 + M('manpower')));
      if (!ECO) c.equipment += c.mil * 12 * (0.7 + 0.5 * c.stab);
      const wsT = Math.min(1, GOV_BASE[c.gov].ws + M('warSupport'));
      const stT = Math.max(0, Math.min(1, GOV_BASE[c.gov].stab + (c.eco ? c.eco.stabAdj || 0 : 0)));
      if (!war) c.ws += (wsT - c.ws) * 0.01;
      c.stab += (stT - c.stab) * 0.005 - (war && c.ws < 0.3 ? 0.001 : 0);
      c.stab = Math.max(0, Math.min(1, c.stab)); c.ws = Math.max(0, Math.min(1, c.ws));
    }
  }
  // 3. supply, attrition and reinforcement for every army, then who has capitulated
  function dayArmies() {
    armiesByProv = new Map();
    for (const o of G.armies) { if (!armiesByProv.has(o.prov)) armiesByProv.set(o.prov, []); armiesByProv.get(o.prov).push(o); }
    for (const a of G.armies) {
      a.supply = computeSupply(a);
      // out of supply: attrition, and organisation drains away
      if (a.supply < 0.35) for (const u of a.units) { u.str = Math.max(0.1, u.str - 0.004 * (0.35 - a.supply) / 0.35); u.org = Math.max(0, u.org - 0.03 * (0.35 - a.supply) / 0.35); }
      // reinforcement in friendly territory
      if (G.owner[a.prov] === a.owner && !a.battle && !a.sea) {
        const c = G.countries[a.owner];
        for (const u of a.units) {
          if (u.str >= 1) continue;
          const need = Math.min(0.03, 1 - u.str) * (typeof Economy !== 'undefined' ? Economy.recruitRate(c.tag, u.type) : 1);
          const mp = need * UNIT_TYPES[u.type].mp, eq = need * UNIT_TYPES[u.type].eq;
          if (c.manpower >= mp && c.equipment >= eq) { c.manpower -= mp; c.equipment -= eq; u.str += need; }
        }
      }
    }
    armiesByProv = null;
    checkCapitulations();
  }
  // 4a. the AI nations plan their armies (every day at war, once a week in peace)
  function dayAI() {
    const day = Math.floor(G.hour / 24);
    for (const c of Object.values(G.countries)) {
      if (!c.alive || isHuman(c.tag)) continue;
      const war = isAtWar(c.tag);
      if (war || (day + c.tag.charCodeAt(0)) % 7 === 0) aiCountry(c);
    }
  }
  // 4b. diplomacy, politics, peace talks, events and the autosave
  function dayWorld() {
    if (typeof Diplo !== 'undefined') Diplo.dayTick();
    if (typeof Politics !== 'undefined') Politics.daily();
    if (typeof Peace !== 'undefined') Peace.daily();
    if (typeof Events !== 'undefined') Events.daily();
    if (typeof Goals !== 'undefined') Goals.daily();
    if (typeof Save !== 'undefined') Save.tick();
  }
  const DAY_PARTS = [daySeaAir, dayNations, dayArmies, () => { dayAI(); dayWorld(); }];

  // humans: the local player plus, in a multiplayer game, every nation another person leads
  function isHuman(tag) { return tag === G.player || !!(G.humans && G.humans[tag]); }
  function humans() { const out = [G.player]; if (G.humans) for (const t in G.humans) if (t !== G.player && G.countries[t]) out.push(t); return out; }
  // a message for one human's nation; the local player also gets the toast and pause
  function tell(tag, text, prov, kind, pause) {
    if (tag === G.player) return notify(text, prov, kind, pause, tag);
    if (!isHuman(tag)) return;
    G.log.unshift({ hour: G.hour, text, prov, kind, to: tag });
    if (G.log.length > 80) G.log.pop();
  }
  function notify(text, prov, kind, pause, to) {
    G.log.unshift(to ? { hour: G.hour, text, prov, kind, to } : { hour: G.hour, text, prov, kind });
    if (G.log.length > 80) G.log.pop();
    hooks.notify(text, prov, kind);
    if (pause && G.settings.autoPause && !G.paused) { G.paused = true; hooks.pause(text); }
  }

  return {
    relDirty,
    init, newGame, restore, hourTick, dateStr, dateTime, hooks, mpCost,
    get G() { return G; }, set G(v) { G = v; },
    get MAP() { return MAP; },
    atWar, allied, isAtWar, enemiesOf, family, root, canEnter, declareWar, findPath,
    factionOf, coalition, hasPact, pairKey, sideOf, endBattle: b => endBattle(b), removeArmy: a => removeArmy(a), newArmy, notify: (...x) => notify(...x), rng: () => rng(),
    startBattle: (a, prov) => startBattle(a, prov), capture: (p, t) => capture(p, t), fortBonus, supplyReach, sourceValue,
    isHuman, humans, tell, army, armiesAt, hostilesAt, armyStats, armyPower, armySpeed, manpowerOf, battleAt, distKm,
    orderMove, orderHold, orderDefend, orderAmbush, canAmbush, TRAITS, gainXp, orderRetreat, orderChase, mergeArmies, splitArmy, recruit, canRecruit, spawnProv,
    computeSupply, dropNation: t => dropFromDiplomacy(t)
  };
})();
