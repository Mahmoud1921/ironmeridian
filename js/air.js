// Air: wings of aircraft based at airbases, flying missions over land or sea within their range.
// Fighters decide air superiority; close support and bombers help battles, strategic bombers
// wreck industry and ports, naval bombers strike ships and convoys. State: G.wings, G.bomb.
'use strict';
const Air = (function () {
  const G = () => Sim.G, MAP = () => Sim.MAP;
  const TYPES = {
    fighter:   { short: 'FTR', air: 30, ground: 2, naval: 2, range: 700, eq: 300, days: 45, aa: 1.0 },
    cas:       { short: 'CAS', air: 6, ground: 26, naval: 8, range: 500, eq: 350, days: 50, aa: 1.3 },
    bomber:    { short: 'BMB', air: 4, ground: 12, naval: 5, strat: 20, range: 1200, eq: 450, days: 60, aa: 1.2 },
    navbomber: { short: 'NAV', air: 5, ground: 6, naval: 28, range: 1000, eq: 400, days: 55, aa: 1.3 }
  };
  const TYPE_KEYS = Object.keys(TYPES);
  const ERA_AIR = {
    'ww2-1936': { range: 1, names: { fighter: 'Fighters', cas: 'Close air support', bomber: 'Bombers', navbomber: 'Naval bombers' } },
    'greatwar-1917': { range: 0.45, names: { fighter: 'Scout fighters', cas: 'Ground-attack flights', bomber: 'Bombers' } },
    // 2026: jets fly far, and close support is mostly done by armed drones
    'modern-2026': { range: 2.4, names: { fighter: 'Multirole fighters', cas: 'Strike drones', bomber: 'Bombers and cruise missiles', navbomber: 'Maritime strike' } }
  };
  const MISSIONS = {
    idle:        { name: 'Stand down', desc: 'Stays at its base and rebuilds.' },
    superiority: { name: 'Air superiority', desc: 'Fights enemy aircraft over the target area. Wins the sky for battles there.' },
    cas:         { name: 'Close air support', desc: 'Attacks enemy troops in battles near the target.' },
    bomb:        { name: 'Strategic bombing', desc: 'Wrecks industry, ports and dockyards in an enemy province.' },
    naval:       { name: 'Naval strike', desc: 'Attacks enemy ships and convoys in a sea zone.' }
  };
  const AREA_KM = 450;  // how far from its target point a mission's effect reaches
  const eraId = () => typeof Economy !== 'undefined' ? Economy.eraId() : 'ww2-1936';
  const EA = () => ERA_AIR[eraId()] || null;
  const available = () => !!EA();
  const types = () => EA() ? TYPE_KEYS.filter(t => EA().names[t]) : [];
  const typeName = t => (EA() && EA().names[t]) || t;
  const range = (t, tag) => TYPES[t].range * (EA() ? EA().range : 1) * (1 + mod(tag, 'airRange'));
  const mod = (tag, name, ctx) => typeof Tech !== 'undefined' && tag ? Tech.mod(tag, name, ctx || {}) : 0;
  const infra = (pid, k) => typeof Economy !== 'undefined' && Economy.infra ? Economy.infra(pid, k) : 0;
  const friendlyTo = (tag, o) => o === tag || Sim.allied(tag, o);
  const km = (a, b) => GEO.haversineKm(a[0], a[1], b[0], b[1]);
  const ORD = n => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');

  function wing(id) { return G().wings.find(w => w.id === id); }
  function point(w) {
    if (w.mission === 'idle' || w.target < 0) { const p = MAP().provs[w.base]; return [p.lon, p.lat]; }
    if (w.sea) { const z = Seas.zone(w.target); return [z.lon, z.lat]; }
    const p = MAP().provs[w.target]; return [p.lon, p.lat];
  }
  const basePt = w => { const p = MAP().provs[w.base]; return [p.lon, p.lat]; };
  function inRange(w, pt) { return km(basePt(w), pt) <= range(w.type, w.owner); }

  // ---------- airbases ----------
  function capacity(pid) { return infra(pid, 'air') * 4; }
  function basedAt(pid) { return G().wings.filter(w => w.base === pid).length; }
  function basesOf(tag) {
    const g = G(), out = [];
    for (const p of MAP().provs) if (infra(p.id, 'air') && friendlyTo(tag, g.owner[p.id])) out.push(p.id);
    return out;
  }
  function freeBase(tag, near) {
    const g = G();
    const list = basesOf(tag).filter(pid => g.owner[pid] === tag && basedAt(pid) < capacity(pid));
    if (!list.length) return -1;
    const n = near >= 0 ? MAP().provs[near] : MAP().provs[g.countries[tag].capital];
    if (!n) return list[0];
    return list.sort((a, b) => GEO.haversineKm(MAP().provs[a].lon, MAP().provs[a].lat, n.lon, n.lat) - GEO.haversineKm(MAP().provs[b].lon, MAP().provs[b].lat, n.lon, n.lat))[0];
  }

  // ---------- setup ----------
  // opening air forces: [fighter, cas, bomber, navbomber]
  const START = {
    'ww2-1936': { GER: [4, 2, 3, 0], ENG: [4, 0, 3, 1], FRA: [4, 1, 2, 0], ITA: [3, 1, 3, 0], SOV: [6, 2, 4, 0], USA: [3, 1, 2, 2], JAP: [3, 0, 2, 3],
      POL: [2, 0, 1, 0], CZE: [2, 0, 1, 0], SPA: [1, 0, 1, 0], CHI: [1, 0, 0, 0], ROM: [1, 0, 0, 0], YUG: [1, 0, 0, 0], TUR: [1, 0, 0, 0], HOL: [1, 0, 0, 0], BEL: [1, 0, 0, 0], SWE: [1, 0, 0, 0], AST: [1, 0, 0, 0], CAN: [1, 0, 0, 0] },
    'greatwar-1917': { GER: [6, 2, 3, 0], FRA: [7, 1, 3, 0], GBR: [7, 1, 3, 0], ITA: [3, 0, 2, 0], RUS: [2, 0, 1, 0], AUH: [2, 0, 1, 0], USA: [1, 0, 0, 0], OTT: [1, 0, 0, 0] },
    'modern-2026': { USA: [16, 8, 6, 5], CHN: [12, 6, 3, 4], RUS: [8, 5, 3, 2], IND: [6, 3, 0, 1], GBR: [3, 2, 0, 1], FRA: [4, 2, 0, 1], DEU: [3, 1, 0, 0], ITA: [2, 1, 0, 1],
      ESP: [2, 1, 0, 0], TUR: [4, 4, 0, 1], ISR: [4, 3, 0, 0], IRN: [2, 4, 0, 0], PAK: [4, 2, 0, 0], JPN: [4, 1, 0, 2], KOR: [4, 1, 0, 1], TWN: [3, 1, 0, 1], SAU: [3, 1, 0, 0],
      ARE: [2, 2, 0, 0], EGY: [3, 1, 0, 0], UKR: [1, 4, 0, 0], POL: [2, 1, 0, 0], AUS: [2, 1, 0, 1], CAN: [1, 0, 0, 1], BRA: [1, 1, 0, 0], GRC: [2, 0, 0, 0], NLD: [1, 0, 0, 0],
      NOR: [1, 0, 0, 1], SWE: [1, 0, 0, 0], FIN: [1, 0, 0, 0], DZA: [2, 0, 0, 0], PRK: [2, 1, 0, 0], VNM: [1, 0, 0, 0], IDN: [1, 0, 0, 0], THA: [1, 0, 0, 0], MAR: [1, 0, 0, 0], QAT: [1, 0, 0, 0] }
  };
  function setup() {
    const g = G();
    g.wings = []; g.nextWing = 1; g.bomb = {};
    if (!available()) return;
    const table = START[eraId()] || {};
    const front = {};
    // airbases: the capital and the biggest home cities of nations with an air force
    for (const c of Object.values(g.countries)) {
      const d = COUNTRY_BY_TAG[c.tag];
      if (!c.alive || !d || d.unclaimed || c.capital < 0) continue;
      const big = !!table[c.tag];
      if (!big && ((eraId() !== 'ww2-1936' && eraId() !== 'modern-2026') || (d.mil || 0) < 3)) continue;
      Economy.setInfra(c.capital, 'air', big ? 2 : 1);
      if (big) MAP().provs.filter(p => g.owner[p.id] === c.tag && p.city && p.home && !p.capital).sort((a, b) => b.pop - a.pop).slice(0, 2).forEach(p => Economy.setInfra(p.id, 'air', 1));
      // a nation already at war starts with airfields behind its fronts, so its planes can reach the fighting
      if (big && Sim.isAtWar(c.tag)) {
        const foes = MAP().provs.filter(p => Sim.atWar(c.tag, g.owner[p.id]));
        // one field facing each enemy nation (the strongest first), the nearest own city not right on the line
        const foeTags = [...new Set(foes.map(p => g.owner[p.id]))].sort((x, y) => (COUNTRY_BY_TAG[y]?.divs || 0) - (COUNTRY_BY_TAG[x]?.divs || 0)).slice(0, 4);
        const cities = MAP().provs.filter(p => g.owner[p.id] === c.tag && p.city);
        for (const ft of foeTags) {
          const fp = foes.filter(p => g.owner[p.id] === ft);
          let best = null, bd = Infinity;
          for (const p of cities) { let d = Infinity; for (const q of fp) d = Math.min(d, GEO.haversineKm(p.lon, p.lat, q.lon, q.lat)); if (d > 40 && d < bd) { bd = d; best = p; } }
          if (!best || bd > 400) continue;
          Economy.setInfra(best.id, 'air', Math.max(1, Economy.infra(best.id, 'air')));
          if (front[c.tag] === undefined) front[c.tag] = best.id;
        }
      }
    }
    for (const tag in table) {
      const c = g.countries[tag];
      if (!c || !c.alive) continue;
      const [f, cas, b, n] = table[tag];
      const list = [...Array(f).fill('fighter'), ...Array(cas).fill('cas'), ...Array(b).fill('bomber'), ...Array(n).fill('navbomber')].filter(t => types().includes(t));
      for (const t of list) { const base = freeBase(tag, t === 'bomber' || front[tag] === undefined ? -1 : front[tag]); if (base < 0) break; newWing(tag, t, base); }
    }
  }
  function newWing(tag, type, base) {
    const g = G(), c = g.countries[tag];
    c.airSeq = (c.airSeq || 0) + 1;
    const w = { id: g.nextWing++, owner: tag, type, name: ORD(c.airSeq) + ' ' + ({ fighter: 'Fighter', cas: 'Attack', bomber: 'Bomber', navbomber: 'Naval' })[type] + ' Wing', base, mission: 'idle', target: -1, sea: false, str: 1, org: 1, kills: 0 };
    g.wings.push(w);
    return w;
  }
  function removeWing(w) { G().wings = G().wings.filter(x => x !== w); }

  // ---------- orders ----------
  function canFly(w, mission, target, sea) {
    if (!MISSIONS[mission]) return { ok: false, why: 'Unknown mission' };
    if (mission === 'idle') return { ok: true };
    if (target === undefined || target < 0) return { ok: false, why: 'Pick a target' };
    if (mission === 'naval' && !sea) return { ok: false, why: 'Naval strikes need a sea zone.' };
    if (mission !== 'naval' && mission !== 'superiority' && sea) return { ok: false, why: 'Pick a land province for this mission.' };
    if (mission === 'bomb' && !Sim.atWar(w.owner, G().owner[target])) return { ok: false, why: 'Only enemy provinces can be bombed.' };
    const pt = sea ? [Seas.zone(target).lon, Seas.zone(target).lat] : [MAP().provs[target].lon, MAP().provs[target].lat];
    const d = km(basePt(w), pt), r = range(w.type, w.owner);
    if (d > r) return { ok: false, why: 'Out of range: ' + Math.round(d) + ' km, this wing reaches ' + Math.round(r) + ' km. Rebase closer.' };
    return { ok: true };
  }
  function setMission(w, mission, target, sea) {
    const chk = canFly(w, mission, target, sea);
    if (!chk.ok) return chk;
    w.mission = mission; w.target = mission === 'idle' ? -1 : target; w.sea = mission === 'idle' ? false : !!sea;
    return { ok: true };
  }
  function rebase(w, pid) {
    if (!infra(pid, 'air')) return { ok: false, why: 'No airbase there.' };
    if (!friendlyTo(w.owner, G().owner[pid])) return { ok: false, why: 'Not a friendly airbase.' };
    if (basedAt(pid) >= capacity(pid)) return { ok: false, why: 'That airbase is full (' + capacity(pid) + ' wings).' };
    w.base = pid;
    if (w.mission !== 'idle' && !inRange(w, point(w))) { w.mission = 'idle'; w.target = -1; }
    w.org = Math.max(0.3, w.org - 0.2);
    return { ok: true };
  }

  // ---------- production ----------
  function canBuild(tag, t) {
    const c = G().countries[tag];
    if (!types().includes(t)) return { ok: false, why: 'Not available in this era' };
    const eq = TYPES[t].eq;
    if (c.equipment < eq) return { ok: false, why: 'Needs ' + eq + ' ' + (typeof Economy !== 'undefined' ? Economy.goodName('arms').toLowerCase() : 'equipment') };
    if (!basesOf(tag).some(pid => G().owner[pid] === tag)) return { ok: false, why: 'Needs an airbase' };
    if ((c.airQueue || []).length >= 6) return { ok: false, why: 'The aircraft queue is full (6)' };
    return { ok: true, eq };
  }
  function build(tag, t) {
    const chk = canBuild(tag, t);
    if (!chk.ok) return chk;
    const c = G().countries[tag];
    c.equipment -= chk.eq;
    (c.airQueue = c.airQueue || []).push({ type: t, left: TYPES[t].days, total: TYPES[t].days });
    return { ok: true, text: typeName(t) + ' ordered.' };
  }
  function cancelBuild(tag, i) {
    const c = G().countries[tag], q = (c.airQueue || [])[i];
    if (!q) return;
    c.airQueue.splice(i, 1);
    c.equipment += Math.round(TYPES[q.type].eq * 0.5);
  }
  function stepQueue(c) {
    if (!c.airQueue || !c.airQueue.length) return;
    // aircraft come out of the arsenals: more arsenals, more lines
    const lines = Math.max(1, Math.min(c.airQueue.length, Math.floor(((c.eco && c.eco.arsenals) || c.mil || 1) / 4)));
    const f = c.eco && c.eco.sat ? 0.4 + 0.6 * Math.min(c.eco.sat.metal, c.eco.sat.fuel) : 1;
    for (const q of c.airQueue.slice(0, lines)) q.left -= f;
    const done = c.airQueue.filter(q => q.left <= 0);
    c.airQueue = c.airQueue.filter(q => q.left > 0);
    for (const q of done) {
      const base = freeBase(c.tag, -1);
      if (base < 0) { c.airQueue.push({ type: q.type, left: 1, total: q.total }); continue; }   // waits for room at an airbase
      const w = newWing(c.tag, q.type, base); w.org = 0.6;
      Sim.tell(c.tag, 'The ' + w.name + ' (' + typeName(q.type).toLowerCase() + ') is ready at ' + MAP().provs[base].name + '.', base, 'info', false);
    }
  }
  function upkeep(tag) { let u = 0; for (const w of G().wings) if (w.owner === tag) u += TYPES[w.type].eq / 2400; return u; }

  // ---------- air superiority ----------
  // fighter strength each side puts over a point; radar at home adds to defenders
  let cache = { hour: -1, m: new Map() };
  function fightersNear(tag, pt, friendly) {
    let v = 0;
    for (const w of G().wings) {
      if (w.mission !== 'superiority') continue;
      const mine = friendlyTo(tag, w.owner);
      if (friendly ? !mine : !Sim.atWar(tag, w.owner)) continue;
      if (km(point(w), pt) > AREA_KM) continue;
      v += TYPES[w.type].air * w.str * (0.4 + 0.6 * w.org) * (1 + mod(w.owner, 'air')) * radarBonus(w.owner, pt);
    }
    // modern eras: missile batteries on the ground deny the sky as well as fighters do
    const aaK = typeof Eras !== 'undefined' && Eras.trench().aaK;
    if (aaK) for (const b of hourly().aa) {
      const mine = friendlyTo(tag, b.owner);
      if (friendly ? !mine : !Sim.atWar(tag, b.owner)) continue;
      if (GEO.haversineKm(b.lon, b.lat, pt[0], pt[1]) > AREA_KM) continue;
      v += b.aa * aaK * 10;
    }
    return v;
  }
  // radar stations and air defence batteries, gathered once per game hour (superiority is cached hourly too)
  let hourCache = { g: null, hour: -1 };
  function hourly() {
    const g = G();
    const v = typeof Economy !== 'undefined' && Economy.infraVer ? Economy.infraVer() : 0;
    if (hourCache.g === g && hourCache.hour === g.hour && hourCache.v === v && hourCache.armies === g.armies.length) return hourCache;
    const radar = [], aa = [];
    for (const p of MAP().provs) if (infra(p.id, 'radar')) radar.push(p);
    for (const a of g.armies) {
      let v = 0; for (const u of a.units) { const t = UNIT_TYPES[u.type]; if (t && t.aa) v += t.aa * u.str; }
      const p = MAP().provs[a.prov];
      if (v > 0 && p) aa.push({ owner: a.owner, lon: p.lon, lat: p.lat, aa: v });
    }
    return (hourCache = { g, hour: g.hour, v, armies: g.armies.length, radar, aa, rb: new Map() });
  }
  function radarBonus(tag, pt) {
    const g = G(), H = hourly(), key = tag + ':' + Math.round(pt[0] * 2) + ':' + Math.round(pt[1] * 2);
    let r = H.rb.get(key);
    if (r !== undefined) return r;
    r = 1;
    for (const p of H.radar) if (friendlyTo(tag, g.owner[p.id]) && GEO.haversineKm(p.lon, p.lat, pt[0], pt[1]) < 600) { r = 1.3; break; }
    H.rb.set(key, r);
    return r;
  }
  // 0..1: this side's share of the sky over a point (0.5 when the sky is empty)
  function superiority(tag, pt) {
    const key = tag + ':' + Math.round(pt[0] * 2) + ':' + Math.round(pt[1] * 2);
    const g = G();
    if (cache.hour !== g.hour) cache = { hour: g.hour, m: new Map() };
    if (cache.m.has(key)) return cache.m.get(key);
    const own = fightersNear(tag, pt, true), en = fightersNear(tag, pt, false);
    const s = own + en <= 0 ? 0.5 : own / (own + en);
    cache.m.set(key, s);
    return s;
  }
  function provPt(pid) { const p = MAP().provs[pid]; return [p.lon, p.lat]; }
  // ground support near a battle
  function casNear(tag, pid) {
    const pt = provPt(pid);
    let v = 0;
    for (const w of G().wings) {
      if (w.mission !== 'cas' || !friendlyTo(tag, w.owner) || w.sea) continue;
      if (km(point(w), pt) > AREA_KM) continue;
      v += TYPES[w.type].ground * w.str * (0.4 + 0.6 * w.org) * (1 + mod(w.owner, 'air'));
    }
    return v;
  }
  // multiplier on a side's combat power in a land battle, and the lines shown in the battle view
  function battleBonus(tag, pid) {
    if (!available() || !G().wings.length) return { mul: 1, sup: 0.5, cas: 0 };
    const sup = superiority(tag, provPt(pid));
    const cas = casNear(tag, pid);
    const supB = (sup - 0.5) * 0.3;                                 // up to ±15% for owning the sky
    const casB = Math.min(0.35, cas / (cas + 120) * 0.6) * (0.3 + 0.7 * sup);  // attack planes need cover
    return { mul: 1 + supB + casB, sup, cas: casB, supB };
  }

  // ---------- sea presence and strikes ----------
  // [zone, tag, power] for naval bombers watching a zone (feeds sea control and convoy raiding)
  function seaPresence() {
    const out = [];
    const g = G();
    if (!g.wings) return out;
    for (const w of g.wings) if (w.mission === 'naval' && w.sea) out.push([w.target, w.owner, TYPES[w.type].naval * w.str * 0.5]);
    return out;
  }
  // hourly strike power of a nation's aircraft on a zone where its fleet is fighting enemyTag
  function navalStrike(tag, zone, enemyTag) {
    let v = 0;
    for (const w of G().wings) if (w.mission === 'naval' && w.sea && w.target === zone && friendlyTo(tag, w.owner)) v += TYPES[w.type].naval * w.str * (0.4 + 0.6 * w.org) * 0.5;
    return v;
  }

  // ---------- damage from bombing ----------
  function bombDamage(pid) { const b = G().bomb; return (b && b[pid]) || 0; }

  // ---------- daily: air battles, strikes, bombing, recovery, AI ----------
  function daily() {
    const g = G();
    if (!g.wings) return;
    for (const pid in g.bomb) { g.bomb[pid] = Math.max(0, g.bomb[pid] - 0.01); if (!g.bomb[pid]) delete g.bomb[pid]; }
    if (!available()) return;
    cache = { hour: -1, m: new Map() };
    for (const w of g.wings.slice()) {
      if (!g.wings.includes(w)) continue;
      // a base lost to the enemy: fly to the nearest free one or lose the wing
      if (!friendlyTo(w.owner, g.owner[w.base]) || !infra(w.base, 'air')) {
        const nb = freeBase(w.owner, w.base);
        if (nb < 0) { Sim.tell(w.owner, 'The ' + w.name + ' lost its airbase and was disbanded.', -1, 'loss', false); removeWing(w); continue; }
        w.base = nb; w.mission = 'idle'; w.target = -1;
      }
      if (w.mission !== 'idle' && !inRange(w, point(w))) { w.mission = 'idle'; w.target = -1; }
      if (w.mission === 'idle') { w.org = Math.min(1, w.org + 0.15); repair(w); continue; }
      w.org = Math.max(0.1, w.org - 0.03);
      const pt = point(w);
      // enemy fighters over the area shoot down aircraft; fighters lose less
      const en = fightersNear(w.owner, pt, false);
      if (en > 0) {
        const own = fightersNear(w.owner, pt, true);
        const loss = 0.06 * en / (en + own + 10) * (w.type === 'fighter' ? 0.7 : 1.4) * TYPES[w.type].aa / (1 + mod(w.owner, 'air'));
        w.str = Math.max(0, w.str - loss);
      }
      // enemy flak from ships under naval attack
      if (w.mission === 'naval' && w.sea) {
        let aa = 0, targets = [];
        for (const f of g.fleets) if (f.zone === w.target && Sim.atWar(w.owner, f.owner)) { targets.push(f); for (const s of f.ships) aa += Navy.stat(s.type, 'aa') * s.str; }
        if (targets.length) {
          w.str = Math.max(0, w.str - Math.min(0.08, aa / 800));
          // daily strike on ships not already in a surface battle (battles take the hourly strikes)
          const idle = targets.filter(f => !f.battle);
          let dmg = TYPES[w.type].naval * w.str * (0.4 + 0.6 * w.org) * 0.6;
          for (const f of idle) {
            if (dmg <= 0) break;
            const s = f.ships[Math.floor(Sim.rng() * f.ships.length)];
            if (!s) continue;
            // submerged boats are hard to find from the air
            s.str -= dmg * Math.min(1, Navy.stat(s.type, 'vis')) / Navy.stat(s.type, 'hp'); s.org = Math.max(0, s.org - 0.1);
            dmg *= 0.5;
            if (s.str <= 0.02) {
              f.ships = f.ships.filter(x => x !== s);
              w.kills++;
              if (f.owner === g.player || w.owner === g.player) Sim.notify((w.owner === g.player ? 'Our aircraft sank' : 'Enemy aircraft sank') + ' a ' + Navy.typeName(s.type).toLowerCase() + ' in the ' + Seas.zone(f.zone).name + '.', -1, w.owner === g.player ? 'win' : 'loss', false);
              if (!f.ships.length) Navy.removeFleet(f);
            }
          }
        }
      }
      if (w.mission === 'bomb' && !w.sea && Sim.atWar(w.owner, g.owner[w.target])) {
        const sup = superiority(w.owner, pt);
        const hit = (TYPES[w.type].strat || TYPES[w.type].ground * 0.3) * w.str * (0.4 + 0.6 * w.org) * (0.3 + 0.7 * sup) / 1000;
        g.bomb[w.target] = Math.min(0.75, (g.bomb[w.target] || 0) + hit);
      }
      if (w.str < 0.05) { Sim.tell(w.owner, 'The ' + w.name + ' was shot out of the sky.', -1, 'loss', false); removeWing(w); continue; }
      if (w.str < 0.35) { w.mission = 'idle'; w.target = -1; }
    }
    for (const c of Object.values(g.countries)) if (c.alive) stepQueue(c);
    const day = Math.floor(g.hour / 24);
    for (const c of Object.values(g.countries)) if (c.alive && !Sim.isHuman(c.tag) && (day + c.tag.charCodeAt(2)) % 3 === 0) ai(c);
  }
  function repair(w) {
    if (w.str >= 1) return;
    const c = G().countries[w.owner];
    const need = Math.min(1 - w.str, 0.05);
    const eq = need * TYPES[w.type].eq * 0.6;
    if (c.equipment >= eq) { c.equipment -= eq; w.str += need; }
  }

  // ---------- AI ----------
  function ai(c) {
    const g = G(), tag = c.tag;
    const mine = g.wings.filter(w => w.owner === tag);
    const war = Sim.isAtWar(tag);
    // build a few wings while industry allows
    if (basesOf(tag).some(pid => g.owner[pid] === tag) && (c.airQueue || []).length < 2) {
      const want = Math.round((COUNTRY_BY_TAG[tag]?.mil || 0) / 2) + (war ? 2 : 0);
      if (mine.length + (c.airQueue || []).length < want) {
        const r = Sim.rng(), ts = types();
        const t = r < 0.5 ? 'fighter' : r < 0.7 && ts.includes('cas') ? 'cas' : r < 0.9 && ts.includes('bomber') ? 'bomber' : ts.includes('navbomber') ? 'navbomber' : 'fighter';
        if (ts.includes(t) && c.equipment > TYPES[t].eq * 3) build(tag, t);
      }
    }
    if (!mine.length) return;
    if (!war) { for (const w of mine) if (w.mission !== 'idle') setMission(w, 'idle'); return; }
    // the hottest battles of ours (up to three, so the wings spread over the fronts), or the most threatened front province
    const short = !!(EA() && EA().range < 1);   // early aircraft: stay with the fronts they can reach
    const hot = [];
    for (const b of g.battles) {
      const involved = b.atkTag === tag || b.defTag === tag || Sim.allied(b.atkTag, tag) || Sim.allied(b.defTag, tag);
      if (!involved) continue;
      // an ally's battle only if one of our airfields can reach it (no flying off to a distant front)
      const own = b.atkTag === tag || b.defTag === tag;
      if (!own && short) { const pp = MAP().provs[b.prov]; if (!basesOf(tag).some(pid => km([MAP().provs[pid].lon, MAP().provs[pid].lat], [pp.lon, pp.lat]) <= range('fighter', tag))) continue; }
      // our own battles come well before an ally's
      hot.push([b.attackers.length * 3 + (MAP().provs[b.prov].city ? 2 : 0) + (b.atkTag === tag || b.defTag === tag ? 20 : 0), b.prov]);
    }
    hot.sort((a, b) => b[0] - a[0]);
    const focuses = [...new Set(hot.map(h => h[1]))].slice(0, 3);
    let focus = focuses.length ? focuses[0] : -1, fs = -Infinity;
    if (focus < 0) {
      const en = Sim.enemiesOf(tag);
      for (const p of MAP().provs) if (g.owner[p.id] === tag && p.nb.some(n => en.has(g.owner[n]))) { const s = p.pop / 1e5 + (p.city ? 5 : 0); if (s > fs) { fs = s; focus = p.id; } }
      if (focus >= 0) focuses.push(focus);
    }
    let wi = 0;
    for (const w of mine) {
      if (w.str < 0.4) { if (w.mission !== 'idle') setMission(w, 'idle'); continue; }
      if (w.type === 'navbomber') {
        const zones = new Set(); for (const f of g.fleets) if (Sim.atWar(tag, f.owner)) zones.add(f.zone);
        let best = -1, bd = Infinity;
        for (const z of zones) { const zz = Seas.zone(z); const d = km(basePt(w), [zz.lon, zz.lat]); if (d < bd && d <= range(w.type, tag)) { bd = d; best = z; } }
        if (best >= 0) setMission(w, 'naval', best, true);
        continue;
      }
      if (w.type === 'bomber') {
        // bomb the richest enemy province in reach
        let best = -1, bs = 0;
        for (const p of MAP().provs) {
          if (!Sim.atWar(tag, g.owner[p.id])) continue;
          const I = g.ind[p.id]; if (!I) continue;
          const v = Object.values(I).reduce((s, n) => s + n, 0) + infra(p.id, 'dock') * 2;
          if (v > bs && km(basePt(w), [p.lon, p.lat]) <= range(w.type, tag)) { bs = v; best = p.id; }
        }
        if (best >= 0 && Sim.rng() < 0.6) { setMission(w, 'bomb', best); continue; }
      }
      if (focuses.length) {
        const m = w.type === 'fighter' ? 'superiority' : 'cas';
        const k = wi++ % focuses.length;
        let r = { ok: false };
        for (let j = 0; j < focuses.length && !r.ok; j++) r = setMission(w, m, focuses[(k + j) % focuses.length]);
        const focus = focuses[k];
        if (!r.ok) {
          // move closer to the fighting
          const nb = freeBase(tag, focus), fp = MAP().provs[focus];
          if (nb >= 0 && nb !== w.base && (!short || km([MAP().provs[nb].lon, MAP().provs[nb].lat], [fp.lon, fp.lat]) <= range(w.type, tag))) { rebase(w, nb); setMission(w, m, focus); }
        }
      }
    }
  }

  function restore() { cache = { hour: -1, m: new Map() }; }
  function dropNation(tag) { const g = G(); if (g.wings) g.wings = g.wings.filter(w => w.owner !== tag); }

  return { restore, TYPES, TYPE_KEYS, MISSIONS, available, types, typeName, range, setup, daily, wing, newWing, removeWing, canFly, setMission, rebase,
    canBuild, build, cancelBuild, upkeep, superiority, battleBonus, casNear, seaPresence, navalStrike, bombDamage, basesOf, capacity, basedAt, freeBase, point, dropNation, AREA_KM };
})();
