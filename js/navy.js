// Navy: ships, fleets, missions, naval battles, sea control, convoys and raiding, transports and
// naval invasions. State lives in G (G.fleets, G.navBattles, c.navy) so a save stays plain data.
'use strict';
const Navy = (function () {
  const G = () => Sim.G, MAP = () => Sim.MAP;
  const DAY = 24;
  // one set of rules; each era renames the roles and slows the ships
  const ROLES = {
    battleship: { short: 'BB', atk: 36, torp: 0, asw: 0, aa: 6, air: 0, hp: 110, spd: 42, vis: 1.2, eq: 2500, days: 360, raid: 0.1, search: 1.0 },
    carrier:    { short: 'CV', atk: 2, torp: 0, asw: 4, aa: 8, air: 30, hp: 70, spd: 50, vis: 1.3, eq: 2200, days: 330, raid: 0.2, search: 2.5 },
    cruiser:    { short: 'CA', atk: 14, torp: 2, asw: 3, aa: 5, air: 0, hp: 45, spd: 55, vis: 1.0, eq: 900, days: 180, raid: 0.45, search: 1.4 },
    destroyer:  { short: 'DD', atk: 6, torp: 3, asw: 9, aa: 3, air: 0, hp: 20, spd: 60, vis: 0.8, eq: 350, days: 90, raid: 0.2, search: 1.2 },
    submarine:  { short: 'SS', atk: 0, torp: 22, asw: 0, aa: 0, air: 0, hp: 14, spd: 30, vis: 0.25, eq: 350, days: 75, raid: 1.0, search: 0.8 },
    transport:  { short: 'TR', atk: 0, torp: 0, asw: 0, aa: 0, air: 0, hp: 10, spd: 35, vis: 1.0, eq: 150, days: 45, raid: 0, search: 0 }
  };
  const ROLE_KEYS = Object.keys(ROLES);
  const ERA_NAVY = {
    'ww2-1936': { speed: 1, days: 1, eq: 1, fleet: 'Fleet', names: { battleship: 'Battleship', carrier: 'Aircraft carrier', cruiser: 'Cruiser', destroyer: 'Destroyer flotilla', submarine: 'Submarine flotilla', transport: 'Transport' } },
    // 2026: the "battleship" role is the big missile cruiser, the "cruiser" role the destroyer, and submarines are nuclear or AIP boats
    'modern-2026': { speed: 1.25, days: 1.4, eq: 1.6, fleet: 'Task force', subMul: 1.3, names: { battleship: 'Missile cruiser', carrier: 'Aircraft carrier', cruiser: 'Destroyer', destroyer: 'Frigate', submarine: 'Attack submarine', transport: 'Amphibious ship' } },
    'greatwar-1917': { speed: 0.85, days: 1, eq: 0.8, fleet: 'Fleet', subMul: 0.85, names: { battleship: 'Dreadnought', carrier: 'Seaplane carrier', cruiser: 'Cruiser', destroyer: 'Destroyer flotilla', submarine: 'Submarine flotilla', transport: 'Troopship' } },
    'napoleonic-1805': { speed: 0.26, days: 0.7, eq: 0.5, fleet: 'Squadron', names: { battleship: 'Ship of the line', cruiser: 'Frigate', destroyer: 'Brig', transport: 'Troopship' } },
    'medieval-1200': { speed: 0.2, days: 0.45, eq: 0.3, fleet: 'Fleet', names: { battleship: 'Great galley', destroyer: 'Galley', transport: 'Cog' } },
    'rome-117': { speed: 0.2, days: 0.45, eq: 0.3, fleet: 'Classis', names: { battleship: 'Quinquereme', cruiser: 'Trireme', destroyer: 'Liburna', transport: 'Merchantman' } },
    'greece-431bc': { speed: 0.2, days: 0.45, eq: 0.3, fleet: 'Fleet', names: { cruiser: 'Trireme', destroyer: 'Penteconter', transport: 'Merchantman' } }
  };
  // opening navies: [battleship, carrier, cruiser, destroyer, submarine, transport]
  const START = {
    'ww2-1936': { ENG: [15, 6, 20, 18, 6, 30], USA: [15, 4, 18, 20, 10, 24], JAP: [10, 6, 16, 16, 8, 24], FRA: [7, 1, 14, 14, 12, 16], ITA: [4, 0, 14, 12, 14, 16],
      GER: [3, 0, 6, 6, 8, 10], SOV: [3, 0, 5, 8, 14, 8], HOL: [0, 0, 3, 6, 4, 6], SPA: [1, 0, 4, 6, 4, 6], TUR: [1, 0, 1, 3, 3, 4], SWE: [0, 0, 1, 4, 4, 3],
      ARG: [2, 0, 3, 6, 2, 4], BRA: [2, 0, 2, 4, 1, 4], CHL: [1, 0, 1, 4, 2, 3], GRE: [0, 0, 1, 4, 2, 3], POL: [0, 0, 0, 2, 3, 2], CHI: [0, 0, 2, 2, 0, 4],
      AST: [0, 0, 3, 2, 0, 3], CAN: [0, 0, 0, 3, 0, 3], YUG: [0, 0, 0, 2, 2, 2], ROM: [0, 0, 0, 2, 1, 2], NOR: [0, 0, 0, 2, 2, 2], DEN: [0, 0, 0, 1, 1, 1], POR: [0, 0, 0, 3, 2, 2] },
    'greatwar-1917': { GBR: [33, 2, 24, 30, 10, 36], GER: [19, 0, 10, 18, 22, 12], FRA: [10, 0, 10, 14, 8, 14], RUS: [8, 0, 8, 12, 6, 8], AUH: [4, 0, 6, 8, 4, 6],
      ITA: [6, 0, 8, 12, 6, 8], USA: [14, 0, 12, 16, 8, 14], JAP: [10, 0, 12, 12, 3, 12], OTT: [1, 0, 2, 4, 0, 4], SPA: [2, 0, 2, 3, 0, 3], BRA: [2, 0, 2, 3, 0, 3],
      ARG: [2, 0, 2, 3, 0, 3], CHL: [1, 0, 2, 2, 0, 2], NED: [0, 0, 2, 4, 2, 3], SWE: [0, 0, 1, 3, 2, 2], AST: [0, 0, 3, 3, 1, 2], POR: [0, 0, 1, 2, 0, 2] },
    'modern-2026': { USA: [9, 11, 20, 8, 16, 10], CHN: [3, 3, 14, 14, 12, 8], RUS: [2, 1, 4, 8, 10, 4], GBR: [0, 2, 6, 6, 4, 3], FRA: [0, 1, 4, 8, 4, 3], JPN: [0, 0, 10, 10, 6, 3],
      IND: [0, 2, 6, 8, 6, 3], ITA: [0, 2, 4, 8, 3, 3], KOR: [0, 0, 6, 8, 6, 2], TWN: [0, 0, 2, 6, 2, 2], TUR: [0, 1, 0, 8, 4, 2], ESP: [0, 1, 0, 6, 2, 2], AUS: [0, 0, 3, 4, 2, 2],
      DEU: [0, 0, 0, 6, 2, 0], NLD: [0, 0, 2, 2, 2, 1], CAN: [0, 0, 0, 6, 1, 0], BRA: [0, 0, 0, 4, 3, 1], IRN: [0, 0, 0, 4, 4, 1], PAK: [0, 0, 0, 6, 4, 0], EGY: [0, 0, 0, 6, 3, 2],
      SAU: [0, 0, 0, 4, 0, 0], ISR: [0, 0, 0, 3, 3, 0], GRC: [0, 0, 0, 8, 4, 1], NOR: [0, 0, 0, 4, 3, 0], SWE: [0, 0, 0, 4, 3, 0], POL: [0, 0, 0, 2, 1, 0], IDN: [0, 0, 0, 6, 3, 2],
      VNM: [0, 0, 0, 4, 3, 1], THA: [0, 0, 0, 4, 0, 1], SGP: [0, 0, 0, 4, 2, 1], PRK: [0, 0, 0, 2, 8, 0], CHL: [0, 0, 0, 4, 2, 1], ARG: [0, 0, 0, 4, 0, 0], DZA: [0, 0, 0, 4, 4, 1],
      MAR: [0, 0, 0, 4, 0, 0], PER: [0, 0, 0, 4, 4, 0], MEX: [0, 0, 0, 4, 0, 0], NZL: [0, 0, 0, 2, 0, 0], PHL: [0, 0, 0, 4, 0, 1], MYS: [0, 0, 0, 4, 2, 0], BGD: [0, 0, 0, 4, 2, 0],
      DNK: [0, 0, 0, 5, 0, 0], PRT: [0, 0, 0, 4, 2, 0], ZAF: [0, 0, 0, 4, 3, 0], COL: [0, 0, 0, 4, 4, 0], VEN: [0, 0, 0, 3, 1, 0], ARE: [0, 0, 0, 4, 0, 0] },
    'napoleonic-1805': { GBR: [30, 0, 20, 16, 0, 20], FRA: [18, 0, 10, 8, 0, 14], SPA: [14, 0, 6, 5, 0, 8], RUS: [8, 0, 4, 4, 0, 6], DEN: [5, 0, 3, 2, 0, 3],
      SWE: [4, 0, 3, 3, 0, 3], OTT: [6, 0, 4, 4, 0, 6], HOL: [4, 0, 3, 3, 0, 3], POR: [3, 0, 2, 2, 0, 2], NAP: [1, 0, 1, 2, 0, 2], EIC: [0, 0, 3, 4, 0, 6], ALG: [0, 0, 1, 4, 0, 1] },
    'medieval-1200': { VEN: [8, 0, 0, 12, 0, 12], GEN: [6, 0, 0, 10, 0, 8], BYZ: [4, 0, 0, 8, 0, 6], SIC: [4, 0, 0, 6, 0, 6], ARA: [2, 0, 0, 5, 0, 4], AYY: [3, 0, 0, 6, 0, 4],
      DEN: [0, 0, 0, 6, 0, 6], NOR: [0, 0, 0, 6, 0, 5], ENG: [0, 0, 0, 4, 0, 6], FRA: [0, 0, 0, 3, 0, 4], SNG: [4, 0, 0, 8, 0, 6], KAM: [0, 0, 0, 4, 0, 4], SRV: [0, 0, 0, 6, 0, 4],
      ALM: [0, 0, 0, 5, 0, 4], JER: [0, 0, 0, 2, 0, 2], POR: [0, 0, 0, 2, 0, 2], CAS: [0, 0, 0, 2, 0, 2], GRY: [0, 0, 0, 3, 0, 2], CHO: [0, 0, 0, 5, 0, 3] },
    'rome-117': { ROM: [8, 0, 16, 16, 0, 14], HAN: [0, 0, 4, 6, 0, 6], BOS: [0, 0, 0, 3, 0, 2], CHO: [0, 0, 0, 4, 0, 3], SAT: [0, 0, 0, 3, 0, 2], AKS: [0, 0, 0, 2, 0, 2], FUN: [0, 0, 0, 3, 0, 2], HIM: [0, 0, 0, 2, 0, 2] },
    'greece-431bc': { ATH: [0, 0, 30, 8, 0, 12], SPA: [0, 0, 3, 2, 0, 2], CRT: [0, 0, 3, 2, 0, 1], PER: [0, 0, 15, 6, 0, 10], CAR: [0, 0, 12, 6, 0, 8], SYR: [0, 0, 8, 4, 0, 4],
      MAS: [0, 0, 2, 3, 0, 2], ETR: [0, 0, 3, 3, 0, 2], TAR: [0, 0, 2, 2, 0, 2], BOS: [0, 0, 0, 2, 0, 1], CHU: [0, 0, 0, 4, 0, 3], YUE: [0, 0, 0, 4, 0, 3], QII: [0, 0, 0, 2, 0, 2] }
  };
  const MISSIONS = {
    hold:    { name: 'Hold position', search: 0.04, desc: 'Stays put and only fights when found.' },
    patrol:  { name: 'Patrol', search: 0.15, desc: 'Watches the zone and engages enemy ships it spots.' },
    hunt:    { name: 'Search and destroy', search: 0.3, desc: 'Actively hunts enemy fleets in the zone.' },
    escort:  { name: 'Convoy escort', search: 0.12, desc: 'Protects trade convoys and supply lines passing through.' },
    raid:    { name: 'Convoy raiding', search: 0.02, desc: 'Sinks enemy convoys in the zone. Submarines excel at it.' },
    support: { name: 'Invasion support', search: 0.12, desc: 'Covers landings and shells the coast for troops ashore.' },
    repair:  { name: 'Return to port', search: 0.02, desc: 'Sails to the nearest friendly port to repair.' }
  };
  const eraId = () => typeof Economy !== 'undefined' ? Economy.eraId() : 'ww2-1936';
  const EN = () => ERA_NAVY[eraId()] || ERA_NAVY['ww2-1936'];
  const roles = () => ROLE_KEYS.filter(r => EN().names[r]);
  const warRoles = () => roles().filter(r => r !== 'transport');
  const typeName = r => EN().names[r] || r;
  const stat = (r, k) => {
    const v = ROLES[r][k];
    if (k === 'spd') return v * EN().speed;
    if (k === 'days') return Math.max(10, Math.round(v * EN().days));
    if (k === 'eq') return Math.round(v * EN().eq);
    if (k === 'torp') return v * (EN().subMul || 1);
    return v;
  };
  const mod = (tag, name, ctx) => typeof Tech !== 'undefined' ? Tech.mod(tag, name, ctx || {}) : 0;
  const infra = (pid, k) => typeof Economy !== 'undefined' && Economy.infra ? Economy.infra(pid, k) : 0;
  const ORD = n => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');

  function nav(c) { return c.navy || (c.navy = { transports: 0, queue: [], seq: 0, sunk: 0, lost: 0, convoysSunk: 0, convoysLost: 0 }); }
  function fleet(id) { return G().fleets.find(f => f.id === id); }
  const friendlyTo = (tag, o) => o === tag || Sim.allied(tag, o);

  // ---------- ports ----------
  function isPort(pid) { return infra(pid, 'port') > 0; }
  function portsOf(tag, allies) {
    const g = G(), out = [];
    for (const p of MAP().provs) if (isPort(p.id) && (allies ? friendlyTo(tag, g.owner[p.id]) : g.owner[p.id] === tag)) out.push(p.id);
    return out;
  }
  // zones with a friendly port: where fleets repair and troops embark
  function portZones(tag) {
    const s = new Set();
    for (const pid of portsOf(tag, true)) for (const z of Seas.zonesOf(pid)) s.add(z);
    return s;
  }
  function homePort(tag) {
    const g = G(), c = g.countries[tag];
    const ports = portsOf(tag, false);
    if (!ports.length) return -1;
    const cap = c.capital >= 0 ? MAP().provs[c.capital] : null;
    let best = ports[0], bs = -Infinity;
    for (const pid of ports) {
      const p = MAP().provs[pid];
      const s = infra(pid, 'port') * 2 + infra(pid, 'dock') * 3 + (p.home ? 4 : 0) + (p.core === tag ? 2 : 0) - (cap ? GEO.haversineKm(p.lon, p.lat, cap.lon, cap.lat) / 800 : 0);
      if (s > bs) { bs = s; best = pid; }
    }
    return best;
  }
  function homeZone(tag) { const pid = homePort(tag); return pid < 0 ? -1 : Seas.zonesOf(pid)[0]; }
  function nearestPortZone(tag, from) {
    const pz = portZones(tag);
    if (pz.has(from)) return from;
    let best = -1, bd = Infinity;
    for (const z of pz) { const r = Seas.route(from, z, tag); if (!r) continue; const km = Seas.routeKm(from, r); if (km < bd) { bd = km; best = z; } }
    return best;
  }

  // ---------- setup ----------
  function setup() {
    const g = G();
    g.fleets = []; g.nextFleet = 1; g.navBattles = []; g.nextNB = 1; g.navLog = [];
    Seas.build(MAP());
    const table = START[eraId()] || {};
    for (const c of Object.values(g.countries)) {
      if (!c.alive) continue;
      nav(c);
      const def = COUNTRY_BY_TAG[c.tag];
      if (!def || def.unclaimed || !portsOf(c.tag, false).length) continue;
      let n = table[c.tag];
      if (!n) {
        // navies nobody listed: a few small ships for seafaring nations
        const coast = MAP().provs.filter(p => g.owner[p.id] === c.tag && p.city && Seas.isCoastal(p.id)).length;
        if (!coast || (def.divs || 0) < 3) continue;
        const d = Math.min(4, Math.round((def.mil || 1) / 4 + coast / 4));
        n = [0, 0, def.mil >= 8 ? 1 : 0, d, 0, Math.max(1, Math.round(d / 2))];
      }
      const [bb, cv, ca, dd, ss, tr] = n;
      c.navy.transports = tr;
      // the dockyards that built these ships
      const hp = homePort(c.tag);
      if (hp >= 0) Economy.setInfra(hp, 'dock', Math.max(1, Math.min(5, Math.round((bb * 3 + cv * 3 + ca + dd * 0.5 + ss * 0.5) / 12))));
      const home = homeZone(c.tag);
      if (home < 0) continue;
      // a second station on another sea, if the nation has ports there
      const others = [...new Set(portsOf(c.tag, false).flatMap(pid => Seas.zonesOf(pid)))].filter(z => z !== home);
      const second = others.length && bb + ca + dd >= 10 ? others.sort((a, b) => Seas.zone(b).coast.filter(pid => g.owner[pid] === c.tag).length - Seas.zone(a).coast.filter(pid => g.owner[pid] === c.tag).length)[0] : -1;
      const ships = (r, k) => Array.from({ length: k }, () => ({ type: r, str: 1, org: 1 }));
      const has = r => !!EN().names[r];
      const main = [], aux = [];
      const split = (r, k) => { if (!has(r) || !k) return; const a = second >= 0 ? Math.floor(k / 3) : 0; main.push(...ships(r, k - a)); aux.push(...ships(r, a)); };
      split('battleship', bb); split('carrier', cv); split('cruiser', ca); split('destroyer', dd);
      if (main.length) newFleet(c.tag, home, main, 'hold');
      if (aux.length) newFleet(c.tag, second, aux, 'hold');
      if (has('submarine') && ss) newFleet(c.tag, home, ships('submarine', ss), 'hold', 'Submarine Flotilla');
    }
    computeControl();
  }
  function newFleet(tag, zone, ships, mission, name) {
    const g = G(), c = g.countries[tag], n = nav(c);
    n.seq++;
    const f = { id: g.nextFleet++, owner: tag, name: name ? ORD(n.seq) + ' ' + name : ORD(n.seq) + ' ' + EN().fleet, zone, path: [], progress: 0, mission: mission || 'hold', area: zone, ships, battle: 0, retreat: false, rate: 0 };
    g.fleets.push(f);
    return f;
  }
  function removeFleet(f) { const g = G(); g.fleets = g.fleets.filter(x => x !== f); for (const b of g.navBattles) { b.a = b.a.filter(id => id !== f.id); b.b = b.b.filter(id => id !== f.id); } }

  // ---------- fleet stats ----------
  function fleetSpeed(f) { let s = Infinity; for (const sh of f.ships) s = Math.min(s, stat(sh.type, 'spd')); return (s === Infinity ? 0 : s) * (1 + mod(f.owner, 'navalSpeed')); }
  function fleetStats(f) {
    let str = 0, org = 0; const n = f.ships.length;
    for (const s of f.ships) { str += s.str; org += s.org; }
    return { str: n ? str / n : 0, org: n ? org / n : 0, n };
  }
  // combat value of a fleet, for sea control and AI choices
  function power(f) {
    let v = 0;
    const m = 1 + mod(f.owner, 'naval');
    for (const s of f.ships) v += (stat(s.type, 'atk') + stat(s.type, 'torp') * 0.7 + stat(s.type, 'air') + stat(s.type, 'asw') * 0.4 + stat(s.type, 'hp') * 0.1) * s.str * (0.5 + 0.5 * s.org);
    return v * m;
  }
  function visibility(f) { let v = 0; for (const s of f.ships) v = Math.max(v, stat(s.type, 'vis')); return v; }
  function searchOf(f) {
    let s = 0; for (const sh of f.ships) s = Math.max(s, stat(sh.type, 'search'));
    let m = f.path.length ? 0.08 : (MISSIONS[f.mission] || MISSIONS.hold).search;
    // radar on a friendly coast helps find ships in the zone
    if (Seas.zone(f.zone).coast.some(pid => infra(pid, 'radar') && friendlyTo(f.owner, G().owner[pid]))) m *= 1.5;
    return m * s;
  }
  function comp(f) {
    const cnt = {};
    for (const s of f.ships) cnt[s.type] = (cnt[s.type] || 0) + 1;
    return ROLE_KEYS.filter(r => cnt[r]).map(r => cnt[r] + ' ' + stat(r, 'short')).join(' · ');
  }
  function compLong(f) {
    const cnt = {};
    for (const s of f.ships) cnt[s.type] = (cnt[s.type] || 0) + 1;
    return ROLE_KEYS.filter(r => cnt[r]).map(r => ({ type: r, n: cnt[r] }));
  }

  // ---------- sea control ----------
  let ctl = {}, ctlHour = -1;
  function computeControl() {
    const g = G();
    ctl = {};
    for (const f of g.fleets) {
      const z = f.zone;
      (ctl[z] || (ctl[z] = {}))[f.owner] = (ctl[z][f.owner] || 0) + power(f);
    }
    // naval bombers on patrol count toward control
    if (typeof Air !== 'undefined') for (const [z, tag, v] of Air.seaPresence()) (ctl[z] || (ctl[z] = {}))[tag] = (ctl[z][tag] || 0) + v;
    ctlHour = g.hour;
  }
  function control(z) { if (G().hour - ctlHour > 6) computeControl(); return ctl[z] || {}; }
  // share of naval power in a zone on this nation's side; 1 when nobody hostile is there
  function superiority(tag, z) {
    const c = control(z);
    let own = 0, en = 0;
    for (const t in c) { if (friendlyTo(tag, t)) own += c[t]; else if (Sim.atWar(tag, t)) en += c[t]; }
    if (en <= 0) return 1;
    return own / (own + en);
  }
  function enemyPower(tag, z) { const c = control(z); let en = 0; for (const t in c) if (Sim.atWar(tag, t)) en += c[t]; return en; }
  function controller(z) {
    const c = control(z); let best = null, bv = 0;
    for (const t in c) if (c[t] > bv) { bv = c[t]; best = t; }
    return best;
  }

  // ---------- orders ----------
  function orderMove(f, z, mission) {
    if (f.battle) return false;
    const path = Seas.route(f.zone, z, f.owner);
    if (!path) return false;
    f.path = path; f.progress = 0; f.area = z; f.retreat = false;
    if (mission) f.mission = mission;
    return true;
  }
  function setMission(f, m, z) {
    if (!MISSIONS[m]) return false;
    if (m === 'repair') {
      const pz = nearestPortZone(f.owner, f.zone);
      if (pz < 0) return false;
      f.mission = 'repair';
      if (pz !== f.zone) return orderMove(f, pz, 'repair');
      f.area = pz; return true;
    }
    const target = z === undefined || z < 0 ? (f.path.length ? f.path[f.path.length - 1] : f.zone) : z;
    if (target !== f.zone && !f.path.length) { if (!orderMove(f, target, m)) return false; }
    f.mission = m; f.area = target;
    return true;
  }
  function splitFleet(f) {
    if (f.ships.length < 2 || f.battle) return null;
    // split by kind: keep capital ships together, hand over half of each type
    const give = [];
    const byType = {};
    f.ships.forEach((s, i) => (byType[s.type] = byType[s.type] || []).push(i));
    for (const t in byType) { const idx = byType[t]; idx.slice(0, Math.floor(idx.length / 2)).forEach(i => give.push(i)); }
    if (!give.length) give.push(f.ships.length - 1);
    const moved = f.ships.filter((_, i) => give.includes(i));
    f.ships = f.ships.filter((_, i) => !give.includes(i));
    const b = newFleet(f.owner, f.zone, moved, f.mission);
    b.area = f.area;
    return b;
  }
  function mergeFleets(list) {
    if (list.length < 2) return null;
    const base = list[0];
    for (const f of list.slice(1)) {
      if (f.owner !== base.owner || f.zone !== base.zone || f.battle || base.battle) continue;
      base.ships.push(...f.ships); removeFleet(f);
    }
    return base;
  }

  // ---------- production ----------
  function docks(tag) { const g = G(); let n = 0; for (const p of MAP().provs) if (g.owner[p.id] === tag) n += infra(p.id, 'dock'); return n; }
  function canBuild(tag, r) {
    const c = G().countries[tag];
    if (!EN().names[r]) return { ok: false, why: 'Not built in this era' };
    if (!docks(tag)) return { ok: false, why: 'Needs a naval dockyard' };
    const eq = stat(r, 'eq');
    if (c.equipment < eq) return { ok: false, why: 'Needs ' + eq + ' ' + (typeof Economy !== 'undefined' ? Economy.goodName('arms').toLowerCase() : 'equipment') };
    if (nav(c).queue.length >= 8) return { ok: false, why: 'The shipyard queue is full (8)' };
    return { ok: true, eq };
  }
  function build(tag, r) {
    const chk = canBuild(tag, r);
    if (!chk.ok) return chk;
    const c = G().countries[tag];
    c.equipment -= chk.eq;
    const days = stat(r, 'days') * Math.max(0.5, 1 + mod(tag, 'shipBuild'));
    nav(c).queue.push({ type: r, left: days, total: days });
    return { ok: true, text: typeName(r) + ' laid down.' };
  }
  function cancelBuild(tag, i) {
    const c = G().countries[tag], q = nav(c).queue[i];
    if (!q) return;
    nav(c).queue.splice(i, 1);
    c.equipment += Math.round(stat(q.type, 'eq') * 0.5);
  }
  function stepYards(c) {
    const n = nav(c);
    if (!n.queue.length) return;
    const d = docks(c.tag);
    if (!d) return;
    // each dockyard level works on one hull; more levels, more hulls at once
    const lines = Math.max(1, Math.min(n.queue.length, d));
    const eco = c.eco && c.eco.sat ? 0.4 + 0.6 * c.eco.sat.metal : 1;
    for (const q of n.queue.slice(0, lines)) q.left -= eco;
    const done = n.queue.filter(q => q.left <= 0);
    n.queue = n.queue.filter(q => q.left > 0);
    for (const q of done) launch(c, q.type);
  }
  function launch(c, r) {
    const g = G();
    if (r === 'transport') { nav(c).transports++; if (c.tag === g.player) Sim.notify('A new ' + typeName(r).toLowerCase() + ' joined the transport pool.', -1, 'info', false); return; }
    const home = homeZone(c.tag);
    if (home < 0) return;
    // new ships join a fleet waiting at the home port, or form a new one
    let f = g.fleets.find(x => x.owner === c.tag && x.zone === home && !x.path.length && !x.battle && (r === 'submarine') === x.ships.every(s => s.type === 'submarine') && x.ships.length < 30);
    const ship = { type: r, str: 1, org: 0.6 };
    if (f) f.ships.push(ship); else f = newFleet(c.tag, home, [ship], 'hold', r === 'submarine' ? 'Submarine Flotilla' : null);
    if (c.tag === g.player) Sim.notify('A new ' + typeName(r).toLowerCase() + ' joined the ' + f.name + ' at ' + Seas.zone(home).name + '.', -1, 'info', false);
  }
  function upkeep(tag) {
    let u = 0;
    for (const f of G().fleets) if (f.owner === tag) for (const s of f.ships) u += stat(s.type, 'eq') / 8000;
    const c = G().countries[tag];
    return u + (c && c.navy ? c.navy.transports * 0.02 : 0);
  }

  // ---------- hourly: movement, spotting and battles ----------
  function hour() {
    const g = G();
    if (!g.fleets) return;
    for (const f of g.fleets.slice()) {
      f.rate = 0;
      if (f.battle || !f.path.length) continue;
      const next = f.path[0];
      // a strait that closed under the fleet (a new war) turns it around
      const st = Seas.straitBetween(f.zone, next);
      if (st && !Seas.zone(f.zone).nb.includes(next) && !Seas.straitOpen(st, f.owner)) { f.path = []; f.progress = 0; continue; }
      const km = GEO.haversineKm(Seas.zone(f.zone).lon, Seas.zone(f.zone).lat, Seas.zone(next).lon, Seas.zone(next).lat);
      f.rate = fleetSpeed(f);
      f.progress += f.rate;
      for (const s of f.ships) s.org = Math.max(0.2, s.org - 0.0008);
      if (f.progress >= km) {
        f.zone = next; f.path.shift(); f.progress = 0;
        if (!f.path.length) f.retreat = false;
      }
    }
    // spotting: hostile fleets sharing a zone may find each other
    const byZone = {};
    for (const f of g.fleets) if (!f.battle && !f.retreat && !(f.safeUntil > g.hour)) (byZone[f.zone] = byZone[f.zone] || []).push(f);
    for (const z in byZone) {
      const list = byZone[z];
      if (list.length < 2) continue;
      for (const f of list) {
        if (f.battle) continue;
        for (const e of list) {
          if (e === f || e.battle || f.battle || !Sim.atWar(f.owner, e.owner)) continue;
          const p = searchOf(f) * visibility(e) * 0.6;
          if (Sim.rng() < p) startBattle(+z, f, e);
        }
      }
    }
    for (const b of g.navBattles.slice()) stepBattle(b);
    if (g.hour % 6 === 0) computeControl();
  }
  function startBattle(z, f, e) {
    const g = G();
    const b = { id: g.nextNB++, zone: z, sideA: f.owner, sideB: e.owner, a: [], b: [], start: g.hour, sunkA: 0, sunkB: 0 };
    // everyone at sea there on either side joins
    for (const x of g.fleets) {
      if (x.zone !== z || x.battle || x.retreat) continue;
      if ((x.owner === f.owner || Sim.allied(x.owner, f.owner)) && Sim.atWar(x.owner, e.owner)) { b.a.push(x.id); x.battle = b.id; }
      else if ((x.owner === e.owner || Sim.allied(x.owner, e.owner)) && Sim.atWar(x.owner, f.owner)) { b.b.push(x.id); x.battle = b.id; }
    }
    if (!b.a.length || !b.b.length) { for (const id of b.a.concat(b.b)) { const x = fleet(id); if (x) x.battle = 0; } return; }
    for (const id of b.a.concat(b.b)) { const x = fleet(id); x.path = []; x.progress = 0; }
    g.navBattles.push(b);
    const pl = g.player;
    if (friendlyTo(pl, f.owner) || friendlyTo(pl, e.owner)) Sim.notify('Naval battle in the ' + Seas.zone(z).name + ' between ' + g.countries[f.owner].name + ' and ' + g.countries[e.owner].name + '.', -1, 'battle', false);
  }
  function endBattle(b) {
    const g = G();
    g.navBattles = g.navBattles.filter(x => x !== b);
    for (const id of b.a.concat(b.b)) { const f = fleet(id); if (f && f.battle === b.id) f.battle = 0; }
  }
  function fire(list, zone, enemyTag) {
    let surf = 0, torp = 0, asw = 0, air = 0, aa = 0;
    for (const f of list) {
      const m = 1 + mod(f.owner, 'naval');
      for (const s of f.ships) {
        const k = s.str * (0.4 + 0.6 * s.org) * m;
        surf += stat(s.type, 'atk') * k; torp += stat(s.type, 'torp') * k; asw += stat(s.type, 'asw') * k; air += stat(s.type, 'air') * k; aa += stat(s.type, 'aa') * s.str;
      }
    }
    if (typeof Air !== 'undefined' && list.length) air += Air.navalStrike(list[0].owner, zone, enemyTag);
    return { surf, torp, asw, air, aa };
  }
  function hitShips(list, dmgSurf, dmgSub, b, side) {
    const g = G();
    // spread damage over ships, bigger and easier-to-see ships draw more fire
    const surface = [], subs = [];
    for (const f of list) for (const s of f.ships) (s.type === 'submarine' ? subs : surface).push([f, s]);
    // fire falls in salvoes on a few ships at a time, so damaged ships do go down
    const hit = (arr, dmg) => {
      if (!arr.length || dmg <= 0) return;
      const w = arr.map(([, s]) => stat(s.type, 'hp') * stat(s.type, 'vis'));
      const tot = w.reduce((a, v) => a + v, 0);
      const shots = Math.max(1, Math.min(arr.length, Math.round(dmg / 12)));
      for (let k = 0; k < shots; k++) {
        let r = Sim.rng() * tot, i = 0;
        while (i < w.length - 1 && r > w[i]) { r -= w[i]; i++; }
        const s = arr[i][1], share = dmg / shots * (0.6 + Sim.rng() * 0.8);
        s.str -= share / stat(s.type, 'hp');
        s.org = Math.max(0, s.org - share / stat(s.type, 'hp') * 0.8);
      }
      for (const [, s] of arr) s.org = Math.max(0, s.org - 0.02);
    };
    hit(surface, dmgSurf); hit(subs, dmgSub);
    for (const f of list) {
      const before = f.ships.length;
      const sunk = f.ships.filter(s => s.str <= 0.02);
      f.ships = f.ships.filter(s => s.str > 0.02);
      if (sunk.length) {
        b['sunk' + side] += sunk.length;
        nav(g.countries[f.owner]).lost += sunk.length;
        const pl = g.player;
        if (f.owner === pl || Sim.allied(f.owner, pl) || Sim.atWar(f.owner, pl)) {
          const names = sunk.map(s => typeName(s.type).toLowerCase());
          Sim.notify(g.countries[f.owner].name + ' lost ' + (sunk.length > 1 ? sunk.length + ' ships' : 'a ' + names[0]) + ' of the ' + f.name + ' in the ' + Seas.zone(f.zone).name + '.', -1, f.owner === pl ? 'loss' : Sim.atWar(f.owner, pl) ? 'win' : 'info', false);
        }
      }
      if (!f.ships.length && before) removeFleet(f);
    }
  }
  function stepBattle(b) {
    const g = G();
    const A = b.a.map(fleet).filter(f => f && f.battle === b.id && f.ships.length && f.zone === b.zone);
    const B = b.b.map(fleet).filter(f => f && f.battle === b.id && f.ships.length && f.zone === b.zone);
    b.a = A.map(f => f.id); b.b = B.map(f => f.id);
    if (!A.length || !B.length || g.hour - b.start > 36) { endBattle(b); return; }
    const fa = fire(A, b.zone, b.sideB), fb = fire(B, b.zone, b.sideA);
    const K = 0.05;
    // guns and torpedoes hit surface ships; only escorts and aircraft can reach submarines
    hitShips(B, (fa.surf + fa.torp * 0.8 + fa.air * Math.max(0.3, 1 - fb.aa / 150)) * K, (fa.asw + fa.air * 0.2) * K * 0.8, b, 'B');
    hitShips(A, (fb.surf + fb.torp * 0.8 + fb.air * Math.max(0.3, 1 - fa.aa / 150)) * K, (fb.asw + fb.air * 0.2) * K * 0.8, b, 'A');
    // battered fleets break off and run for port
    for (const f of A.concat(B)) {
      if (!g.fleets.includes(f)) continue;
      const st = fleetStats(f);
      if (st.org < 0.25 || st.str < 0.35) {
        f.battle = 0; f.retreat = true; f.safeUntil = g.hour + 24;
        const pz = nearestPortZone(f.owner, f.zone);
        if (pz >= 0 && pz !== f.zone) { f.path = Seas.route(f.zone, pz, f.owner) || []; f.progress = 0; }
        if (!f.path.length) f.retreat = false;
        f.mission = 'repair'; f.area = pz >= 0 ? pz : f.zone;
      }
    }
    for (const s of ['a', 'b']) b[s] = b[s].filter(id => { const f = fleet(id); return f && f.battle === b.id; });
    if (!b.a.length || !b.b.length) {
      const pl = g.player;
      const winA = b.a.length > 0;
      const winner = winA ? b.sideA : b.sideB, loser = winA ? b.sideB : b.sideA;
      if (friendlyTo(pl, winner) || friendlyTo(pl, loser)) Sim.notify((friendlyTo(pl, winner) ? 'Victory' : 'Defeat') + ' at sea in the ' + Seas.zone(b.zone).name + ': ' + (b.sunkA + b.sunkB) + ' ships sunk.', -1, friendlyTo(pl, winner) ? 'win' : 'loss', false);
      nav(g.countries[winner]).sunk += winA ? b.sunkB : b.sunkA;
      endBattle(b);
    }
  }

  // ---------- daily: repair, missions, convoys, production, AI ----------
  let raidCache = { day: -1, z: {} };
  function daily() {
    const g = G();
    if (!g.fleets) return;
    computeControl();
    const pz = {};
    for (const f of g.fleets) {
      if (f.battle) continue;
      if (f.retreat && !f.path.length) f.retreat = false;
      if (!pz[f.owner]) pz[f.owner] = portZones(f.owner);
      const inPort = pz[f.owner].has(f.zone) && !f.path.length;
      const c = g.countries[f.owner];
      if (inPort && (f.mission === 'hold' || f.mission === 'repair')) {
        const yard = Seas.zone(f.zone).coast.reduce((m, pid) => friendlyTo(f.owner, g.owner[pid]) ? Math.max(m, infra(pid, 'dock')) : m, 0);
        for (const s of f.ships) {
          s.org = Math.min(1, s.org + 0.12);
          if (s.str < 1) {
            const need = Math.min(1 - s.str, 0.015 * (1 + yard * 0.6));
            const eq = need * stat(s.type, 'eq') * 0.5;
            if (c.equipment >= eq) { c.equipment -= eq; s.str += need; }
          }
        }
        if (f.mission === 'repair' && fleetStats(f).str > 0.95 && fleetStats(f).org > 0.9) f.mission = 'hold';
      } else for (const s of f.ships) s.org = Math.min(1, s.org + (f.path.length ? 0 : 0.02));
      // a fleet on a mission away from its area heads back there
      if (!f.path.length && f.area !== undefined && f.area !== f.zone && f.mission !== 'hold') { const r = Seas.route(f.zone, f.area, f.owner); if (r) { f.path = r; f.progress = 0; } }
    }
    raidDaily();
    for (const c of Object.values(g.countries)) if (c.alive && c.navy) stepYards(c);
    const day = Math.floor(g.hour / DAY);
    for (const c of Object.values(g.countries)) {
      if (!c.alive || c.tag === g.player) continue;
      if ((day + c.tag.charCodeAt(1)) % 3 === 0) ai(c);
    }
    // armies at sea
    for (const a of g.armies) if (a.sea && a.sea.phase === 'sail') seaLosses(a);
  }

  // Raiders sink convoys in their zone; escorts there shield convoys and hunt the raiders.
  function raidersIn(z) {
    const out = [];
    for (const f of G().fleets) if (f.zone === z && f.mission === 'raid' && !f.battle && !f.path.length) out.push(f);
    return out;
  }
  function raidPower(f) { let v = 0; for (const s of f.ships) v += stat(s.type, 'raid') * (stat(s.type, 'torp') + stat(s.type, 'atk')) * s.str * (0.5 + 0.5 * s.org); return v * (1 + mod(f.owner, 'raiding')); }
  function escortPower(tag, z) {
    let v = 0;
    for (const f of G().fleets) {
      if (f.zone !== z || f.battle || !friendlyTo(tag, f.owner)) continue;
      const m = f.mission === 'escort' ? 1 : f.mission === 'patrol' || f.mission === 'hunt' ? 0.5 : 0.1;
      for (const s of f.ships) v += (stat(s.type, 'asw') + stat(s.type, 'atk') * 0.2 + stat(s.type, 'air') * 0.5) * s.str * m;
    }
    return v * (1 + mod(tag, 'escort'));
  }
  function raidDaily() {
    const g = G();
    raidCache = { day: Math.floor(g.hour / DAY), z: {} };
    const zones = new Set();
    for (const f of g.fleets) if (f.mission === 'raid' && !f.battle && !f.path.length) zones.add(f.zone);
    if (typeof Air !== 'undefined') for (const [z] of Air.seaPresence()) zones.add(z);
    for (const z of zones) {
      const list = raidersIn(z);
      const by = {};
      for (const f of list) by[f.owner] = (by[f.owner] || 0) + raidPower(f);
      if (typeof Air !== 'undefined') for (const [zz, tag, v] of Air.seaPresence()) if (zz === z) by[tag] = (by[tag] || 0) + v * 0.3;
      raidCache.z[z] = by;
      // escorts fight back against raiding fleets
      for (const f of list) {
        let esc = 0;
        for (const t of Object.keys(g.countries)) if (g.countries[t].alive && Sim.atWar(t, f.owner)) { esc = Math.max(esc, escortPower(t, z)); }
        if (esc <= 0) continue;
        const dmg = esc * 0.03;
        for (const s of f.ships) { s.str -= dmg / stat(s.type, 'hp') * (0.5 + Sim.rng()) / f.ships.length * 3; s.org = Math.max(0, s.org - 0.05); }
        const sunk = f.ships.filter(s => s.str <= 0.02).length;
        f.ships = f.ships.filter(s => s.str > 0.02);
        if (sunk) {
          nav(g.countries[f.owner]).lost += sunk;
          if (f.owner === g.player) Sim.notify('Escorts sank ' + sunk + ' of our raiders in the ' + Seas.zone(z).name + '.', -1, 'loss', false);
        }
        if (!f.ships.length) removeFleet(f);
        else if (fleetStats(f).str < 0.4) setMission(f, 'repair');
      }
    }
  }
  // share of a convoy lost in one zone to raiders at war with the nation
  function lossIn(tag, z) {
    const by = raidCache.z[z];
    if (!by) return 0;
    let raid = 0;
    for (const t in by) if (Sim.atWar(tag, t)) raid += by[t];
    if (raid <= 0) return 0;
    const esc = escortPower(tag, z);
    return Math.min(0.7, raid / (raid + esc * 1.5 + 25)) * Math.max(0.3, 1 + mod(tag, 'convoyLoss'));
  }
  // the sea lane a trade deal uses (null when the partners share a land border)
  const laneCache = new Map();
  function tradeZone(tag) {
    const c = G().countries[tag];
    if (c.capital >= 0 && Seas.isCoastal(c.capital)) return Seas.zonesOf(c.capital)[0];
    const h = homeZone(tag);
    if (h >= 0) return h;
    const p = MAP().provs.find(q => G().owner[q.id] === tag && q.city && Seas.isCoastal(q.id));
    return p ? Seas.zonesOf(p.id)[0] : -1;
  }
  function lane(from, to) {
    const key = from + '>' + to + ':' + Math.floor(G().hour / (DAY * 10));
    if (laneCache.has(key)) return laneCache.get(key);
    let out = null;
    // overland only when the two capitals share a continent and the nations share a border
    const ca = G().countries[from].capital, cb = G().countries[to].capital;
    const land = ca >= 0 && cb >= 0 && MAP().provs[ca].lm === MAP().provs[cb].lm && typeof Diplo !== 'undefined' && Diplo.borders && Diplo.borders(from, to);
    if (!land) {
      const a = tradeZone(from), b = tradeZone(to);
      if (a >= 0 && b >= 0) { const r = Seas.route(a, b, to); out = r ? [a, ...r] : null; }
    }
    if (laneCache.size > 4000) laneCache.clear();
    laneCache.set(key, out);
    return out;
  }
  // share of a deal's goods that arrive; the rest is sunk on the way
  function convoyFactor(d) {
    const l = lane(d.from, d.to);
    if (!l) return 1;
    let f = 1;
    for (const z of l) f *= 1 - Math.max(lossIn(d.to, z), lossIn(d.from, z));
    return f;
  }
  function recordConvoy(d, shipped, arrived) {
    const g = G(), lost = shipped - arrived;
    d.sunk = lost > 0.01 ? lost : 0;
    if (lost <= 0.01) return;
    const l = lane(d.from, d.to) || [];
    for (const z of l) {
      const by = raidCache.z[z]; if (!by) continue;
      for (const t in by) if (Sim.atWar(d.to, t) || Sim.atWar(d.from, t)) { nav(g.countries[t]).convoysSunk += lost / l.length; }
    }
    nav(g.countries[d.to]).convoysLost += lost;
  }

  // ---------- supply over the sea ----------
  // zones a nation's supply ships can reach from its home ports, and how much gets through
  let reachCache = {};
  function seaReach(tag) {
    const g = G(), key = tag + ':' + Math.floor(g.hour / DAY);
    if (reachCache[key]) return reachCache[key];
    if (Object.keys(reachCache).length > 400) reachCache = {};
    const out = new Map();
    const start = new Set();
    for (const p of MAP().provs) if (g.owner[p.id] === tag && p.core === tag && p.home && isPort(p.id)) for (const z of Seas.zonesOf(p.id)) start.add(z);
    let front = [...start];
    for (const z of front) out.set(z, 1 - lossIn(tag, z));
    while (front.length) {
      const next = [];
      for (const z of front) for (const [n] of Seas.neighbours(z, tag)) {
        const q = out.get(z) * (1 - lossIn(tag, n)) * (superiority(tag, n) < 0.3 ? 0 : 0.98);
        if (q > 0.05 && q > (out.get(n) || 0)) { out.set(n, q); next.push(n); }
      }
      front = next;
    }
    reachCache[key] = out;
    return out;
  }
  // how well a port feeds armies (0 = cut off); used as a supply source by the land supply model
  function portSupply(tag, pid) {
    if (!isPort(pid)) return 0;
    const g = G(), o = g.owner[pid];
    if (!friendlyTo(tag, o)) return 0;
    const r = seaReach(tag);
    let best = 0;
    for (const z of Seas.zonesOf(pid)) best = Math.max(best, r.get(z) || 0);
    return best * (0.7 + 0.1 * infra(pid, 'port')) * (typeof Air !== 'undefined' ? 1 - Air.bombDamage(pid) * 0.5 : 1);
  }

  // ---------- naval invasions and sea transport ----------
  function freeTransports(tag) {
    const c = G().countries[tag];
    const used = G().armies.filter(a => a.owner === tag && a.sea).reduce((s, a) => s + a.sea.ships, 0);
    return Math.max(0, nav(c).transports - used);
  }
  function planInvasion(a, target) {
    const g = G(), tag = a.owner;
    const from = MAP().provs[a.prov], to = MAP().provs[target];
    if (!to) return { ok: false, why: 'Pick a coastal province.' };
    if (a.sea) return { ok: false, why: 'This army is already at sea.' };
    if (a.battle) return { ok: false, why: 'The army is in battle.' };
    if (!Seas.isCoastal(a.prov)) return { ok: false, why: 'The army must stand in a coastal province to embark.' };
    if (!friendlyTo(tag, g.owner[a.prov])) return { ok: false, why: 'Troops can only embark on friendly shores.' };
    if (!Seas.isCoastal(target)) return { ok: false, why: to.name + ' has no coast.' };
    if (target === a.prov) return { ok: false, why: 'The army is already there.' };
    const o = g.owner[target];
    const hostile = Sim.atWar(tag, o) || !!(COUNTRY_BY_TAG[o] && COUNTRY_BY_TAG[o].unclaimed);
    if (!hostile && !friendlyTo(tag, o)) return { ok: false, why: 'You need to be at war with ' + g.countries[o].name + ' or allied to land there.' };
    const need = a.units.length;
    if (freeTransports(tag) < need) return { ok: false, why: 'Needs ' + need + ' ' + typeName('transport').toLowerCase() + (need > 1 ? 's' : '') + '; ' + freeTransports(tag) + ' free.' };
    // the best pair of zones: embark where the army stands, land where the target touches the sea
    let best = null;
    for (const za of Seas.zonesOf(a.prov)) for (const zb of Seas.zonesOf(target)) {
      const r = za === zb ? [] : Seas.route(za, zb, tag, z => superiority(tag, z) < 0.2);
      if (!r) continue;
      const km = Seas.routeKm(za, r) + 150;
      if (!best || km < best.km) best = { za, zb, route: r, km };
    }
    if (!best) return { ok: false, why: 'No open sea route: enemy fleets or a closed strait block the way.' };
    const port = infra(a.prov, 'port');
    const prep = Math.round(DAY * (hostile ? 12 : 2) * (port ? 0.6 : 1) * Math.max(0.3, 1 + mod(tag, 'invasionPrep')));
    const sail = Math.max(12, Math.round(best.km / stat('transport', 'spd')));
    return { ok: true, hostile, prep, sail, need, from: best.za, zone: best.zb, route: best.route, km: best.km, sup: superiority(tag, best.zb) };
  }
  function invade(a, target) {
    const plan = planInvasion(a, target);
    if (!plan.ok) return plan;
    if (a.battle) return { ok: false, why: 'The army is in battle.' };
    a.path = []; a.progress = 0; a.order = 'hold'; a.target = -1;
    a.sea = { target, hostile: plan.hostile, phase: 'prep', t: 0, prep: plan.prep, sail: plan.sail, ships: plan.need, from: plan.from, zone: plan.zone, route: plan.route, origin: a.prov, wait: 0 };
    return { ok: true, plan, text: (plan.hostile ? 'Invasion of ' : 'Sea transport to ') + MAP().provs[target].name + ' is being prepared: ' + Math.ceil(plan.prep / DAY) + ' days to plan, then about ' + Math.ceil(plan.sail / DAY) + ' at sea.' };
  }
  function cancelInvasion(a) {
    if (!a.sea) return;
    if (a.sea.phase === 'prep') { a.sea = null; return; }
    // turn back to the port they left, or the nearest friendly coast
    a.sea.phase = 'return'; a.sea.t = 0;
  }
  function progress(a) {
    const s = a.sea; if (!s) return 0;
    const total = s.prep + s.sail;
    if (s.phase === 'prep') return 0.9 * s.t / total;
    if (s.phase === 'sail') return 0.9 * (s.prep + s.t) / total;
    return 0.95;
  }
  function phaseText(a) {
    const s = a.sea; if (!s) return '';
    const to = MAP().provs[s.target].name;
    if (s.phase === 'prep') return (s.hostile ? 'Planning the invasion of ' : 'Embarking for ') + to + ' · ' + Math.ceil((s.prep - s.t) / DAY) + ' days';
    if (s.phase === 'sail') return 'At sea to ' + to + ' · ' + Math.ceil((s.sail - s.t) / DAY) + ' days';
    if (s.phase === 'wait') return 'Waiting off ' + to + ' for naval superiority (' + Math.round(superiority(a.owner, s.zone) * 100) + '%, needs 40%)';
    if (s.phase === 'return') return 'Returning to port';
    return '';
  }
  function seaLosses(a) {
    // transports crossing waters the enemy controls lose men
    let risk = 0;
    for (const z of [a.sea.from, ...a.sea.route]) { const s = superiority(a.owner, z); if (s < 0.5) risk += (0.5 - s) * 0.1; risk += lossIn(a.owner, z) * 0.05; }
    if (risk <= 0) return;
    for (const u of a.units) u.str = Math.max(0.05, u.str - risk * (0.5 + Sim.rng()));
    if (a.owner === G().player && risk > 0.02) Sim.notify('Our transports to ' + MAP().provs[a.sea.target].name + ' are under attack at sea.', a.sea.target, 'loss', false);
  }
  // called every hour for an army with a.sea; returns true when the army should skip its land movement
  function stepArmy(a) {
    const g = G(), s = a.sea;
    if (!s) return false;
    if (s.phase === 'prep') {
      if (a.battle || a.path.length) { a.sea = null; return false; }
      if (!friendlyTo(a.owner, g.owner[a.prov])) { a.sea = null; return false; }
      s.t++;
      if (s.t >= s.prep) { s.phase = 'sail'; s.t = 0; if (a.owner === g.player) Sim.notify(a.name + ' has set sail for ' + MAP().provs[s.target].name + '.', s.target, 'info', false); }
      return false;
    }
    if (s.phase === 'sail') { s.t++; if (s.t >= s.sail) s.phase = 'wait'; else return true; }
    if (s.phase === 'return') {
      s.t++;
      if (s.t < Math.max(12, s.sail / 2)) return true;
      const back = friendlyTo(a.owner, g.owner[s.origin]) ? s.origin : MAP().provs.filter(p => g.owner[p.id] === a.owner && Seas.isCoastal(p.id)).sort((x, y) => Sim.distKm(s.origin, x.id) - Sim.distKm(s.origin, y.id))[0]?.id;
      a.sea = null;
      if (back === undefined) { Sim.notify(g.countries[a.owner].name + ' ' + a.name + ' was lost at sea.', -1, 'loss', false); Sim.removeArmy(a); return true; }
      a.prov = back; a.path = []; a.progress = 0; a.lead = null;
      return true;
    }
    // landing
    const o = g.owner[s.target];
    const hostile = Sim.atWar(a.owner, o) || !!(COUNTRY_BY_TAG[o] && COUNTRY_BY_TAG[o].unclaimed);
    if (!hostile && !friendlyTo(a.owner, o)) { cancelInvasion(a); return true; }
    if (hostile && superiority(a.owner, s.zone) < 0.4) {
      s.wait++;
      if (s.wait > DAY * 15) { cancelInvasion(a); if (a.owner === g.player) Sim.notify('The landing at ' + MAP().provs[s.target].name + ' was called off: the enemy holds the sea.', s.target, 'loss', false); }
      return true;
    }
    const target = s.target;
    a.sea = null;
    const defenders = hostile ? Sim.hostilesAt(a.owner, target) : [];
    if (defenders.length) {
      a.landing = true;
      a.target = target; a.order = 'move';
      a.path = [target]; a.progress = Math.max(0, Sim.distKm(a.prov, target) - 0.01);
      Sim.startBattle(a, target);
      if (a.owner === g.player || defenders.some(d => d.owner === g.player)) Sim.notify('Troops are storming the beaches at ' + MAP().provs[target].name + '.', target, 'battle', false);
    } else {
      a.prov = target; a.path = []; a.progress = 0; a.lead = null; a.order = 'hold'; a.entrench = 0;
      for (const u of a.units) u.org = Math.max(0.2, u.org * 0.7);
      if (hostile) Sim.capture(target, a.owner);
      if (a.owner === g.player) Sim.notify(a.name + (hostile ? ' landed unopposed at ' : ' came ashore at ') + MAP().provs[target].name + '.', target, hostile ? 'win' : 'info', false);
    }
    return true;
  }
  // naval guns off the coast help friendly troops in a coastal battle
  function shoreSupport(tag, pid) {
    let v = 0;
    for (const z of Seas.zonesOf(pid)) for (const f of G().fleets) {
      if (f.zone !== z || f.battle || f.path.length || f.mission !== 'support' || !friendlyTo(tag, f.owner)) continue;
      for (const s of f.ships) v += stat(s.type, 'atk') * s.str;
    }
    return Math.min(0.3, v / 250);
  }

  // ---------- AI ----------
  function ai(c) {
    const g = G(), tag = c.tag;
    const mine = g.fleets.filter(f => f.owner === tag);
    const war = Sim.isAtWar(tag);
    const home = homeZone(tag);
    // build: keep a navy in proportion to coast and industry
    if (docks(tag) && c.eco && c.eco.gold > 50) {
      const want = Math.round((COUNTRY_BY_TAG[tag]?.mil || 1) * 1.2 + (war ? 4 : 0));
      const have = mine.reduce((s, f) => s + f.ships.length, 0) + nav(c).queue.length;
      if (have < want && nav(c).queue.length < 3) {
        const r = roles();
        const pick = war && r.includes('submarine') && Sim.rng() < 0.4 ? 'submarine' : r.includes('destroyer') && Sim.rng() < 0.5 ? 'destroyer' : r.includes('cruiser') ? 'cruiser' : r[0];
        if (c.equipment > stat(pick, 'eq') * 3) build(tag, pick);
      }
      if (war && nav(c).transports < 6 && nav(c).queue.length < 3 && c.equipment > 600) build(tag, 'transport');
    }
    if (!mine.length || home < 0) return;
    const enemies = [...Sim.enemiesOf(tag)];
    for (const f of mine) {
      if (f.battle || f.retreat) continue;
      const st = fleetStats(f);
      if (st.str < 0.5 || st.org < 0.3) { if (f.mission !== 'repair') setMission(f, 'repair'); continue; }
      if (f.mission === 'repair') continue;
      if (!war) { if (f.mission !== 'hold' || f.zone !== home) { if (f.zone !== home) orderMove(f, home, 'hold'); else f.mission = 'hold'; } continue; }
      const subs = f.ships.every(s => s.type === 'submarine');
      // targets: enemy home waters within reach
      const targets = [];
      for (const e of enemies) { const z = tradeZone(e); if (z >= 0) targets.push(z); }
      let best = -1, bd = Infinity;
      for (const z of targets) { const r = Seas.route(f.zone, z, tag); if (!r) continue; const km = Seas.routeKm(f.zone, r); if (km < bd && km < 6000) { bd = km; best = z; } }
      if (subs) { if (best >= 0) { if (f.area !== best || f.mission !== 'raid') setMission(f, 'raid', best); } else if (f.mission !== 'patrol') setMission(f, 'patrol', home); continue; }
      const mine2 = power(f), there = best >= 0 ? enemyPower(tag, best) : Infinity;
      if (best >= 0 && mine2 > there * 1.3) { if (f.area !== best || f.mission !== 'hunt') setMission(f, 'hunt', best); }
      else if (f.mission !== 'patrol' || f.area !== home) setMission(f, 'patrol', home);
    }
    if (war) aiInvade(c);
  }
  function aiInvade(c) {
    const g = G(), tag = c.tag;
    const day = Math.floor(g.hour / DAY);
    if ((day + tag.charCodeAt(0)) % 15 !== 0) return;
    if (g.armies.some(a => a.owner === tag && a.sea)) return;
    if (freeTransports(tag) < 2) return;
    // only when some enemy can't be reached over land
    const enemies = [...Sim.enemiesOf(tag)];
    const armies = g.armies.filter(a => a.owner === tag && !a.battle && !a.path.length && !a.sea && a.units.length >= 2 && a.units.length <= freeTransports(tag) && Seas.isCoastal(a.prov) && g.owner[a.prov] === tag);
    if (!armies.length) return;
    let best = null;
    for (const p of MAP().provs) {
      const o = g.owner[p.id];
      if (!enemies.includes(o) || !Seas.isCoastal(p.id)) continue;
      const def = Sim.hostilesAt(tag, p.id).reduce((s, h) => s + h.units.length, 0);
      for (const a of armies) {
        const km = GEO.haversineKm(MAP().provs[a.prov].lon, MAP().provs[a.prov].lat, p.lon, p.lat);
        if (km > 2500) continue;
        const score = (a.units.length - def * 1.5) * 10 - km / 200 + (p.city ? 5 : 0) + (p.capital ? 10 : 0);
        if (score > 5 && (!best || score > best.score)) best = { a, p: p.id, score };
      }
    }
    if (!best) return;
    const plan = planInvasion(best.a, best.p);
    if (!plan.ok || plan.sup < 0.5) return;
    invade(best.a, best.p);
    // send the strongest fleet to cover it
    const cover = g.fleets.filter(f => f.owner === tag && !f.battle && !f.ships.every(s => s.type === 'submarine')).sort((x, y) => power(y) - power(x))[0];
    if (cover) setMission(cover, 'support', plan.zone);
  }

  // ---------- after capture or capitulation ----------
  function restore() { Seas.build(MAP()); ctl = {}; ctlHour = -1; raidCache = { day: -1, z: {} }; reachCache = {}; }
  function dropNation(tag) {
    const g = G();
    if (!g.fleets) return;
    // a beaten nation's ships are scuttled
    for (const f of g.fleets.filter(x => x.owner === tag)) removeFleet(f);
  }

  return {
    restore, ROLES, ROLE_KEYS, MISSIONS, ERA_NAVY, roles, warRoles, typeName, stat, setup, hour, daily, fleet, newFleet, removeFleet,
    fleetSpeed, fleetStats, power, comp, compLong, control, superiority, controller, enemyPower, orderMove, setMission, splitFleet, mergeFleets,
    canBuild, build, cancelBuild, docks, upkeep, convoyFactor, recordConvoy, lane, lossIn, seaReach, portSupply, portZones, homeZone, isPort,
    freeTransports, planInvasion, invade, cancelInvasion, progress, phaseText, stepArmy, shoreSupport, dropNation, nav, computeControl,
    raidPowerIn: z => raidCache.z[z] || {}, escortPower
  };
})();
