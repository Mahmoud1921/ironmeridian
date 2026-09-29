// Historical eras. The province map is always the one MapGen builds for 1936
// (it is seeded from the 1936 cities), so an era never changes province shapes:
// it only re-assigns owners, capitals, city names, population and industry,
// and swaps the nation list, unit catalogue and name pools.
//
// Load order: geo.js, countries.js, units.js, mapgen.js, then eras-flags.js, era-*.js, eras.js.
// Then:  const map = MapGen.generate();  Eras.apply(map, 'rome-117');
'use strict';
// ERA_DEFS is declared in eras-flags.js and filled by the era-*.js files.

// Government types used by the eras. stab/ws follow GOV_BASE in units.js.
// bloc: which of the game's four diplomatic blocs (GOV_REL in diplo.js) the form of rule behaves as
const ERA_GOVS = {
  'Empire':                  { stab: 0.62, ws: 0.40, bloc: 'Authoritarian' },
  'Kingdom':                 { stab: 0.60, ws: 0.35, bloc: 'Neutral' },
  'Constitutional monarchy': { stab: 0.68, ws: 0.25, bloc: 'Democratic' },
  'Republic':                { stab: 0.65, ws: 0.25, bloc: 'Democratic' },
  'City-state':              { stab: 0.62, ws: 0.30, bloc: 'Democratic' },
  'League':                  { stab: 0.58, ws: 0.40, bloc: 'Democratic' },
  'Diarchy':                 { stab: 0.66, ws: 0.60, bloc: 'Authoritarian' },
  'Principality':            { stab: 0.58, ws: 0.33, bloc: 'Neutral' },
  'Sultanate':               { stab: 0.58, ws: 0.38, bloc: 'Authoritarian' },
  'Caliphate':               { stab: 0.60, ws: 0.42, bloc: 'Authoritarian' },
  'Khanate':                 { stab: 0.52, ws: 0.50, bloc: 'Authoritarian' },
  'Shogunate':               { stab: 0.62, ws: 0.40, bloc: 'Authoritarian' },
  'Theocracy':               { stab: 0.62, ws: 0.40, bloc: 'Neutral' },
  'Confederacy':             { stab: 0.52, ws: 0.35, bloc: 'Neutral' },
  'Tribal peoples':          { stab: 0.48, ws: 0.40, bloc: 'Neutral' },
  'Chiefdom':                { stab: 0.50, ws: 0.35, bloc: 'Neutral' },
  'Dominion':                { stab: 0.70, ws: 0.20, bloc: 'Democratic' },
  'Colony':                  { stab: 0.50, ws: 0.15, bloc: 'Neutral' },
  'Company rule':            { stab: 0.55, ws: 0.30, bloc: 'Neutral' },
  'Revolutionary':           { stab: 0.45, ws: 0.55, bloc: 'Neutral' },
  'Unclaimed':               { stab: 0.50, ws: 0.00, bloc: 'Neutral' }
};

const Eras = (function () {
  const BASE_ID = 'ww2-1936';
  let current = BASE_ID, snap = null, era = null;

  function haversineKm(lon1, lat1, lon2, lat2) {
    const R = 6371, r = Math.PI / 180;
    const dLat = (lat2 - lat1) * r, dLon = (lon2 - lon1) * r;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  }
  function rngFor(seed) {
    let a = seed | 0;
    return function () { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  function strSeed(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

  const PROV_KEYS = ['owner', 'core', 'city', 'capital', 'cityTag', 'name', 'home', 'pop', 'infra', 'civ', 'mil'];
  function takeSnapshot(map) {
    snap = {
      defs: COUNTRY_DEFS.slice(),
      units: Object.assign({}, UNIT_TYPES),
      pools: Object.assign({}, NAME_POOLS),
      prov: map.provs.map(p => PROV_KEYS.map(k => p[k]))
    };
  }
  function replaceArray(arr, items) { arr.length = 0; for (const x of items) arr.push(x); }
  function replaceObject(obj, src) { for (const k of Object.keys(obj)) delete obj[k]; Object.assign(obj, src); }

  function list() {
    return [{ id: BASE_ID, name: 'The Gathering Storm', year: 1936, label: '1936', blurb: 'The world on the eve of the Second World War.' }]
      .concat(ERA_DEFS.map(e => ({ id: e.id, name: e.name, year: e.year, label: e.label, blurb: e.blurb })))
      .sort((a, b) => a.year - b.year);
  }
  function get(id) { return ERA_DEFS.find(e => e.id === id) || null; }

  // Province that contains (lon, lat), else the nearest province centre within maxKm.
  function provinceAt(map, lon, lat, maxKm) {
    const pt = GEO.project(lon, lat);
    // Voronoi cells run past their coastlines, so only test cells of the landmass under the point
    const lm = map.landmassAt ? map.landmassAt(pt[0], pt[1]) : -1;
    for (const p of map.provs) {
      if (p.lm !== lm) continue;
      const b = p.bbox;
      if (pt[0] < b[0] || pt[0] > b[2] || pt[1] < b[1] || pt[1] > b[3]) continue;
      if (pipFlat(pt[0], pt[1], p.flat)) return p;
    }
    let best = null, bd = maxKm;
    for (const p of map.provs) { const d = haversineKm(lon, lat, p.lon, p.lat); if (d < bd) { bd = d; best = p; } }
    return best;
  }
  function pipFlat(x, y, f) {
    let inside = false;
    for (let i = 0, j = f.length - 2; i < f.length; j = i, i += 2) {
      const xi = f[i], yi = f[i + 1], xj = f[j], yj = f[j + 1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  // Apply an era to the generated map and to the global catalogues.
  // Returns a report: { era, nations, dropped: [tags], owned: {tag: provinces}, unclaimed }.
  function apply(map, id) {
    if (!snap) takeSnapshot(map);
    // always start from the 1936 state
    replaceArray(COUNTRY_DEFS, snap.defs);
    replaceObject(UNIT_TYPES, snap.units);
    replaceObject(NAME_POOLS, snap.pools);
    map.provs.forEach((p, i) => PROV_KEYS.forEach((k, j) => { p[k] = snap.prov[i][j]; }));
    replaceObject(COUNTRY_BY_TAG, Object.fromEntries(COUNTRY_DEFS.map(c => [c.tag, c])));
    if (typeof LAND_TYPES !== 'undefined') replaceArray(LAND_TYPES, Object.keys(UNIT_TYPES));
    current = BASE_ID; era = null;
    if (id === BASE_ID || !id) return { era: BASE_ID, nations: COUNTRY_DEFS.length, dropped: [], owned: {}, unclaimed: 0 };

    const E = get(id);
    if (!E) throw new Error('Unknown era ' + id);
    era = E; current = id;
    Object.assign(GOV_BASE, ERA_GOVS);
    const rnd = rngFor(strSeed(id));

    // --- 1. pin cities to provinces (capitals of every nation first, then other cities) ---
    const nations = E.nations.map(n => Object.assign({ reach: E.reach || 700 }, n));
    const pinned = new Map(); // prov id -> { tag, city, capital }
    const anchors = [];
    const dropped = [];
    for (const p of map.provs) { p.city = undefined; p.capital = false; p.cityTag = undefined; }
    const order = [];
    nations.forEach(n => order.push([n, 0]));
    const maxCities = Math.max(...nations.map(n => n.cities.length));
    for (let i = 1; i < maxCities; i++) nations.forEach(n => { if (i < n.cities.length) order.push([n, i]); });
    const capProv = {};
    for (const [n, i] of order) {
      const [name, lon, lat, reach] = n.cities[i];
      if (i > 0 && capProv[n.tag] === undefined) continue; // nation already dropped
      let p = provinceAt(map, lon, lat, 350);
      if (p && pinned.has(p.id) && i === 0) {
        // capital collides: take the nearest free neighbour, if close
        const alt = p.nb.map(q => map.provs[q]).filter(q => !pinned.has(q.id) && q.lm === p.lm)
          .sort((a, b) => haversineKm(lon, lat, a.lon, a.lat) - haversineKm(lon, lat, b.lon, b.lat))[0];
        p = alt && haversineKm(lon, lat, alt.lon, alt.lat) < 450 ? alt : null;
      }
      if (!p) { if (i === 0) dropped.push(n.tag); continue; }
      if (pinned.has(p.id)) continue; // a larger claim got there first; the city still anchors nothing
      pinned.set(p.id, { tag: n.tag, city: name, capital: i === 0 });
      if (i === 0) capProv[n.tag] = p.id;
      // overseas holdings (far from the capital) may use a wider colonyReach: colonial provinces are large
      const far = i > 0 && n.colonyReach && haversineKm(lon, lat, n.cities[0][1], n.cities[0][2]) > 2000;
      anchors.push({ tag: n.tag, lon, lat, lm: p.lm, reach: reach || (far ? n.colonyReach : n.reach), prov: p.id });
    }

    // --- 2. every other province goes to the nearest anchor on its landmass, within reach ---
    const UNC = 'UNC';
    const owned = {};
    let unclaimed = 0;
    for (const p of map.provs) {
      let tag = UNC;
      const pin = pinned.get(p.id);
      if (pin) {
        tag = pin.tag; p.city = pin.city; p.capital = pin.capital; p.cityTag = pin.tag;
      } else {
        let bd = Infinity;
        for (const a of anchors) {
          if (a.lm !== p.lm) continue;
          const d = haversineKm(a.lon, a.lat, p.lon, p.lat);
          if (d <= a.reach && d < bd) { bd = d; tag = a.tag; }
        }
      }
      p.owner = tag; p.core = tag;
      if (tag === UNC) unclaimed++; else owned[tag] = (owned[tag] || 0) + 1;
    }

    // --- 3. nation definitions for the sim ---
    const defs = nations.filter(n => !dropped.includes(n.tag) && owned[n.tag]).map(n => {
      const d = Object.assign({}, n);
      d.cities = n.cities.map(c => [c[0], c[1], c[2]]);
      delete d.reach; delete d.colonyReach;
      if (!d.diff) d.diff = d.divs >= 20 ? 'Normal' : d.divs >= 6 ? 'Hard' : 'Very hard';
      return d;
    });
    const unc = E.unclaimed || {};
    defs.push({ tag: UNC, name: unc.name || 'Unclaimed lands', color: unc.color || '#8e8a7c', gov: 'Unclaimed', pop: unc.pop || 5,
      civ: 0, mil: 0, divs: 0, tech: 0.5, culture: 'oth', diff: '—', unclaimed: true,
      sit: unc.sit || 'Land outside any state on this map.', cities: [] });
    replaceArray(COUNTRY_DEFS, defs);
    replaceObject(COUNTRY_BY_TAG, Object.fromEntries(defs.map(c => [c.tag, c])));
    replaceObject(UNIT_TYPES, E.units);
    if (typeof LAND_TYPES !== 'undefined') replaceArray(LAND_TYPES, Object.keys(E.units));
    replaceObject(NAME_POOLS, Object.assign({}, snap.pools, E.namePools || {}));

    // --- 4. province names: cities keep their era name, the rest take the nearest era city ---
    const TERRAIN_WORD = { plains: 'Plains', forest: 'Woods', hills: 'Hills', mountains: 'Highlands', desert: 'Wastes', jungle: 'Jungle', marsh: 'Marshes', tundra: 'Tundra', urban: 'District' };
    const regions = (E.regions || []).concat(typeof ERA_REGIONS !== 'undefined' ? ERA_REGIONS : []);
    const used = {};
    const cityProvs = map.provs.filter(p => p.city);
    for (const p of map.provs) {
      if (p.city) { p.name = p.city; used[p.name] = 1; }
    }
    for (const p of map.provs) {
      if (p.city) continue;
      if (p.terrain === 'urban') p.terrain = 'plains';
      let base = null, bd = Infinity;
      if (p.owner !== UNC) {
        for (const c of cityProvs) { if (c.owner !== p.owner) continue; const d = haversineKm(c.lon, c.lat, p.lon, p.lat); if (d < bd) { bd = d; base = c; } }
      }
      let name;
      if (base && bd < 900) {
        const dx = p.lon - base.lon, dy = p.lat - base.lat;
        const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'East' : 'West') : (dy > 0 ? 'North' : 'South');
        name = base.city + ' ' + TERRAIN_WORD[p.terrain];
        if (used[name]) name = dir + ' ' + name;
      } else {
        let r = null, rd = Infinity;
        for (const g of regions) { const d = haversineKm(g[1], g[2], p.lon, p.lat); if (d < rd) { rd = d; r = g; } }
        name = r ? r[0] : TERRAIN_WORD[p.terrain];
        if (used[name]) name = name + ' ' + TERRAIN_WORD[p.terrain];
      }
      if (used[name]) name = 'Upper ' + name;
      if (used[name]) name = name + ' ' + (used[name] + 1);
      used[name] = (used[name] || 0) + 1;
      p.name = name;
    }
    for (const p of map.provs) if (p.capital) p.terrain = 'urban';

    // --- 5. population, infrastructure and workshops (same model as mapgen.js) ---
    const byOwner = {};
    map.provs.forEach(p => { (byOwner[p.owner] = byOwner[p.owner] || []).push(p); });
    for (const c of defs) {
      const list = byOwner[c.tag] || [];
      if (!list.length) continue;
      const cap = list.find(p => p.capital) || list[0];
      let wsum = 0;
      for (const p of list) {
        const home = !c.unclaimed && p.lm === cap.lm && Math.hypot(p.x - cap.x, p.y - cap.y) < 25;
        p.home = home;
        p.w = TERRAIN[p.terrain].pop * (p.capital ? 6 : p.city ? 2.5 : 1) * (home ? 1 : 0.35) * (0.7 + rnd() * 0.6);
        wsum += p.w;
      }
      for (const p of list) {
        p.pop = Math.max(2000, Math.round(c.pop * 1e6 * p.w / wsum / 1000) * 1000);
        const rough = ['mountains', 'jungle', 'marsh', 'tundra', 'desert'].includes(p.terrain) ? 1 : 0;
        p.infra = Math.max(1, Math.min(5, Math.round(c.tech * 2.4 - 0.4 + (p.city ? 1 : 0) + (p.capital ? 1 : 0) - rough - (p.home ? 0 : 1))));
        p.civ = 0; p.mil = 0;
      }
      const ranked = list.slice().sort((a, b) => (b.pop * b.infra) - (a.pop * a.infra));
      let civ = c.civ, mil = c.mil, i = 0;
      while ((civ > 0 || mil > 0) && ranked.length) {
        const p = ranked[i % Math.min(ranked.length, Math.max(3, Math.ceil(ranked.length / 3)))];
        if (civ > 0) { p.civ++; civ--; }
        if (mil > 0 && i % 2 === 0) { p.mil++; mil--; }
        i++;
      }
      for (const p of list) delete p.w;
    }
    return { era: id, nations: defs.length - 1, dropped, owned, unclaimed };
  }

  // ---------- helpers the sim and UI call ----------
  function info() { return era; }
  function isBase() { return current === BASE_ID; }
  // Game start as UTC milliseconds. Years before 100 AD work too (Date.UTC maps 0..99 to 19xx, so set the year explicitly).
  function startTime() {
    if (!era) return Date.UTC(1936, 0, 1);
    const [y, m, d] = era.start;
    const t = new Date(Date.UTC(2000, m - 1, d));
    t.setUTCFullYear(y);
    return t.getTime();
  }
  // "12 May 431 BC", "3 Aug 117 AD", "1 Sep 1805"
  function yearLabel(y) { return y <= 0 ? (1 - y) + ' BC' : y < 1000 ? y + ' AD' : String(y); }
  // Commander rank for a culture, e.g. 'Strategos' or 'Legatus'.
  function rankFor(culture) {
    if (!era || !era.ranks) return 'Gen.';
    return era.ranks[culture] || era.ranks.default || 'Gen.';
  }
  // Unit types this nation may raise (units with `only` are national specialities).
  function unitsFor(tag) {
    return Object.keys(UNIT_TYPES).filter(t => {
      const u = UNIT_TYPES[t];
      if (u.only && !u.only.includes(tag)) return false;
      if (u.not && u.not.includes(tag)) return false;
      return true;
    });
  }
  // Starting army mix: the nation's `mix`, else the era default, filtered to units it may raise.
  function pickUnitType(def, rng) {
    if (!era) return null;
    const allowed = new Set(unitsFor(def.tag));
    const mix = Object.entries(def.mix || era.mix).filter(([t]) => allowed.has(t));
    const total = mix.reduce((s, [, w]) => s + w, 0);
    let r = rng() * total;
    for (const [t, w] of mix) { r -= w; if (r <= 0) return t; }
    return mix.length ? mix[0][0] : Object.keys(UNIT_TYPES)[0];
  }
  function wars() { return era ? (era.wars || []) : null; }
  function flagFor(tag) {
    if (!era) return null;
    const n = era.nations.find(x => x.tag === tag);
    return n && n.flag ? EraFlags.svg(n.flag) : null;
  }

  // the diplomatic bloc for a government name: 1936 names map to themselves
  function govClass(gov) { return ERA_GOVS[gov] ? ERA_GOVS[gov].bloc : gov; }
  // alliance names that fit a pre-modern world; null in 1936 so the game keeps its own
  const ERA_FACTION_NAMES = {
    Democratic: ['League of Free Cities', 'Concord of Republics', 'Common Alliance'],
    Authoritarian: ['Grand Alliance', 'Imperial Compact', 'Sacred League'],
    Neutral: ['Holy League', 'Defensive Union', 'Compact of Crowns'],
    Communist: ['Popular League', 'Common Front', 'Union of the Many'],
  };
  function factionNames(bloc) { return era ? ERA_FACTION_NAMES[bloc] || ERA_FACTION_NAMES.Neutral : null; }

  // Which 3D figure (a kind in figures.js) an era unit uses. Foot soldiers depend on the era:
  // spear and shield before gunpowder, shako and musket in 1805, the game's own soldiers in 1914.
  const LOOK_KIND = {
    horseman: 'rider', horsearcher: 'rider', cataphract: 'rider', knight: 'rider', mamluk: 'rider', samurai: 'rider',
    templar: 'rider', cuirassier: 'rider', hussar: 'rider', cossack: 'rider', horsewarrior: 'rider', chariot: 'rider', cavalry: 'rider',
    elephant: 'elephant',
    ballista: 'engine', trebuchet: 'engine', siege: 'engine',
    cannon: 'cannon', horseartillery: 'cannon', fieldgun: 'cannon', howitzer: 'cannon',
    armoredcar: 'car', landship: 'tank',
  };
  function figureKind(unitType, available) {
    const u = UNIT_TYPES[unitType];
    if (!u) return 'soldiers';
    let k = u.look && LOOK_KIND[u.look];
    if (!k) { const y = era ? era.year : 1936; k = y < 1500 ? 'warband' : y < 1880 ? 'musket' : 'soldiers'; }
    if (available && !available.includes(k)) k = k === 'cannon' || k === 'engine' ? 'gun' : k === 'car' ? 'car' : 'soldiers';
    return k;
  }

  return { list, get, apply, info, isBase, startTime, yearLabel, rankFor, unitsFor, pickUnitType, wars, flagFor, figureKind, govClass, factionNames, haversineKm, BASE_ID };
})();
