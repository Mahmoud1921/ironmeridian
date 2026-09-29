// Sea zones: named stretches of ocean that fleets move through and fight over.
// Water is split on a 1-degree grid, flood-filled from each zone's centre so a zone never
// leaks across land; coastal provinces learn which zones they touch. Deterministic, built once.
'use strict';
const SEA_ZONES = [
  // [name, lon, lat]
  ['North Sea', 3, 56], ['English Channel', -2.5, 50.1], ['Baltic Sea', 18.5, 56.5], ['Gulf of Bothnia', 20.5, 62.5],
  ['Norwegian Sea', 5, 67], ['Barents Sea', 40, 73], ['Celtic Sea', -8.5, 49.5], ['Bay of Biscay', -5, 45.5],
  ['Western Approaches', -20, 52], ['Iberian Coast', -12, 39], ['Western Mediterranean', 4, 39.5], ['Tyrrhenian Sea', 12, 40],
  ['Adriatic Sea', 15.5, 43], ['Central Mediterranean', 17.5, 35.5], ['Aegean Sea', 25, 38.5], ['Eastern Mediterranean', 31, 33.5],
  ['Black Sea', 34, 43.5], ['Caspian Sea', 51, 42], ['Red Sea', 38.5, 20], ['Gulf of Aden', 48, 12.5],
  ['Persian Gulf', 51.5, 27], ['Arabian Sea', 64, 16], ['Bay of Bengal', 88, 14], ['Central Indian Ocean', 78, -5],
  ['Mozambique Channel', 41, -18], ['South Indian Ocean', 75, -35], ['Andaman Sea', 95.5, 9], ['South China Sea', 113, 13],
  ['Java Sea', 110, -5], ['Timor Sea', 125, -10], ['Philippine Sea', 132, 18], ['East China Sea', 125, 29],
  ['Yellow Sea', 122.5, 36], ['Sea of Japan', 135, 40], ['Sea of Okhotsk', 148, 53], ['Northwest Pacific', 160, 38],
  ['Bering Sea', 178, 58], ['Coral Sea', 155, -18], ['Tasman Sea', 160, -38], ['Central Pacific', -157, 20],
  ['South Pacific', -140, -20], ['Gulf of Alaska', -140, 52], ['California Coast', -125, 32], ['Eastern Pacific', -100, 8],
  ['Chilean Coast', -80, -25], ['Cape Horn', -60, -52], ['South Atlantic', -30, -15], ['Gulf of Guinea', 2, 0],
  ['Cape of Good Hope', 10, -32], ['Central Atlantic', -38, 28], ['West African Coast', -22, 16], ['Caribbean Sea', -75, 15],
  ['Gulf of Mexico', -90, 25], ['US East Coast', -70, 36], ['Newfoundland Banks', -48, 45], ['Labrador Sea', -56, 59],
  ['Hudson Bay', -85, 60], ['Denmark Strait', -25, 65], ['Arctic Ocean', 60, 80], ['Southern Ocean', 20, -58],
  ['Argentine Sea', -55, -40], ['Brazilian Coast', -38, -5]
];

const Seas = (function () {
  const RES = 1, X0 = -180, Y0 = -125, NX = 360, NY = 197;
  // Narrow crossings the grid can't see: [zone A, zone B, controlling point lon/lat, name, opens (year)]
  const STRAITS = [
    ['Aegean Sea', 'Black Sea', 29.0, 41.1, 'Bosporus'],
    ['North Sea', 'Baltic Sea', 12.6, 55.7, 'Danish Straits'],
    ['Iberian Coast', 'Western Mediterranean', -5.4, 36.1, 'Strait of Gibraltar'],
    ['Red Sea', 'Gulf of Aden', 43.4, 12.6, 'Bab-el-Mandeb'],
    ['Persian Gulf', 'Arabian Sea', 56.3, 26.5, 'Strait of Hormuz'],
    ['Andaman Sea', 'Java Sea', 103.8, 1.3, 'Strait of Malacca'],
    ['Andaman Sea', 'South China Sea', 103.8, 1.3, 'Strait of Malacca'],
    ['Eastern Mediterranean', 'Red Sea', 32.4, 30.5, 'Suez Canal', 1869],
    ['Caribbean Sea', 'Eastern Pacific', -79.6, 9.1, 'Panama Canal', 1914]
  ];
  // pairs the coarse grid may join across thin land; only a strait above connects them
  const NO_TOUCH = [['Eastern Mediterranean', 'Red Sea'], ['Caribbean Sea', 'Eastern Pacific'], ['Gulf of Mexico', 'Eastern Pacific'], ['Black Sea', 'Aegean Sea'], ['Caspian Sea', 'Black Sea'], ['Caspian Sea', 'Persian Gulf'],
    ['Iberian Coast', 'Western Mediterranean'], ['Andaman Sea', 'Java Sea'], ['Andaman Sea', 'South China Sea']];
  // open-water joins the coarse grid misses
  const EXTRA = [['Central Mediterranean', 'Eastern Mediterranean'], ['Western Mediterranean', 'Central Mediterranean']];
  let built = null;

  function build(map) {
    if (built && built.map === map) return built;
    const t0 = performance.now();
    const cell = new Int16Array(NX * NY).fill(-2);  // -2 land, -1 unassigned water, >=0 zone
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
      const x = X0 + (i + 0.5) * RES, y = Y0 + (j + 0.5) * RES;
      if (map.landmassAt(x, y) < 0) cell[j * NX + i] = -1;
    }
    const zones = SEA_ZONES.map((z, id) => { const [x, y] = GEO.project(z[1], z[2]); return { id, name: z[0], lon: z[1], lat: z[2], x, y, nb: [], coast: [], cells: 0 }; });
    const idx = (x, y) => { let i = Math.floor((x - X0) / RES), j = Math.floor((y - Y0) / RES); i = (i % NX + NX) % NX; return j < 0 || j >= NY ? -1 : j * NX + i; };
    // flood fill from every centre at once (the map wraps east-west)
    let front = [];
    for (const z of zones) {
      let k = idx(z.x, z.y);
      if (k < 0 || cell[k] !== -1) {  // centre on land at this resolution: nudge to the nearest water cell
        let best = -1, bd = Infinity;
        for (let dj = -4; dj <= 4; dj++) for (let di = -4; di <= 4; di++) {
          const kk = idx(z.x + di, z.y + dj); if (kk >= 0 && cell[kk] === -1 && di * di + dj * dj < bd) { bd = di * di + dj * dj; best = kk; }
        }
        k = best;
      }
      if (k >= 0) { cell[k] = z.id; front.push(k); }
    }
    const nbOf = k => { const i = k % NX, j = (k - i) / NX; const out = [j * NX + (i + 1) % NX, j * NX + (i + NX - 1) % NX]; if (j > 0) out.push(k - NX); if (j < NY - 1) out.push(k + NX); return out; };
    while (front.length) {
      const next = [];
      for (const k of front) for (const n of nbOf(k)) if (cell[n] === -1) { cell[n] = cell[k]; next.push(n); }
      front = next;
    }
    // water no centre could reach (inland seas, enclosed bays): nearest centre
    for (let k = 0; k < cell.length; k++) if (cell[k] === -1) {
      const x = X0 + (k % NX + 0.5) * RES, y = Y0 + (Math.floor(k / NX) + 0.5) * RES;
      let best = 0, bd = Infinity;
      for (const z of zones) { const d = (z.x - x) ** 2 + (z.y - y) ** 2; if (d < bd) { bd = d; best = z.id; } }
      cell[k] = best;
    }
    const byName = {}; zones.forEach(z => { byName[z.name] = z.id; });
    const blocked = new Set(NO_TOUCH.map(([a, b]) => Math.min(byName[a], byName[b]) + ':' + Math.max(byName[a], byName[b])));
    const link = (a, b) => { if (a === b || zones[a].nb.includes(b)) return; zones[a].nb.push(b); zones[b].nb.push(a); };
    for (let k = 0; k < cell.length; k++) {
      const a = cell[k]; if (a < 0) continue;
      zones[a].cells++;
      for (const n of nbOf(k)) { const b = cell[n]; if (b >= 0 && b !== a && !blocked.has(Math.min(a, b) + ':' + Math.max(a, b))) link(a, b); }
    }
    for (const [a, b] of EXTRA) link(byName[a], byName[b]);
    const straits = [];
    for (const [a, b, lon, lat, name, year] of STRAITS) {
      const za = byName[a], zb = byName[b]; if (za === undefined || zb === undefined) continue;
      straits.push({ a: za, b: zb, lon, lat, name, year: year || null, prov: -1 });
    }
    // coastal provinces: sample around each province outline for the water cells it touches
    const provZones = map.provs.map(() => []);
    for (const p of map.provs) {
      const cnt = {};
      const poly = p.poly || [];
      for (let i = 0; i < poly.length; i++) {
        const v = poly[i], w = poly[(i + 1) % poly.length];
        for (const t of [0, 0.25, 0.5, 0.75]) {
          const x = v.x + (w.x - v.x) * t, y = v.y + (w.y - v.y) * t;
          if ((x - p.x) ** 2 + (y - p.y) ** 2 > 36 || map.landmassAt(x, y) >= 0) continue;
          let k = idx(x, y);
          if (k < 0 || cell[k] < 0) {
            k = -1;
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) { const kk = idx(x + dx, y + dy); if (kk >= 0 && cell[kk] >= 0) { k = kk; break; } }
          }
          if (k >= 0) cnt[cell[k]] = (cnt[cell[k]] || 0) + 1;
        }
      }
      provZones[p.id] = Object.keys(cnt).map(Number).sort((a, b) => cnt[b] - cnt[a]).slice(0, 3);
      for (const z of provZones[p.id]) zones[z].coast.push(p.id);
    }
    // the province that controls each strait
    for (const s of straits) {
      const [sx, sy] = GEO.project(s.lon, s.lat);
      let best = -1, bd = Infinity;
      for (const p of map.provs) { if (!provZones[p.id].length) continue; const d = (p.x - sx) ** 2 + (p.y - sy) ** 2; if (d < bd) { bd = d; best = p.id; } }
      s.prov = best;
    }
    // distances between neighbouring zone centres, km
    for (const z of zones) z.dist = z.nb.map(n => GEO.haversineKm(z.lon, z.lat, zones[n].lon, zones[n].lat));
    built = { map, cell, zones, straits, provZones, byName, ms: performance.now() - t0 };
    return built;
  }
  const B = () => built || build(Sim.MAP);

  function zoneAt(x, y) { const b = B(); let i = Math.floor((x - X0) / RES), j = Math.floor((y - Y0) / RES); if (j < 0 || j >= NY) return -1; i = (i % NX + NX) % NX; const v = b.cell[j * NX + i]; return v >= 0 ? v : -1; }
  function zonesOf(pid) { return B().provZones[pid] || []; }
  function isCoastal(pid) { return zonesOf(pid).length > 0; }
  function zone(id) { return B().zones[id]; }
  function all() { return B().zones; }
  const yearNow = () => typeof Sim !== 'undefined' && Sim.G ? new Date(Sim.dateTime()).getUTCFullYear() : 1936;
  // a strait or canal is shut to anyone at war with whoever holds its shore
  function straitOpen(s, tag) {
    if (s.year && yearNow() < s.year) return false;
    if (!tag || s.prov < 0 || !Sim.G) return true;
    const o = Sim.G.owner[s.prov];
    return !Sim.atWar(tag, o);
  }
  function straitBetween(a, b) { return B().straits.find(s => (s.a === a && s.b === b) || (s.a === b && s.b === a)) || null; }
  // neighbours of a zone for a nation, including straits it may pass
  function neighbours(z, tag) {
    const b = B(), out = b.zones[z].nb.map((n, i) => [n, b.zones[z].dist[i]]);
    for (const s of b.straits) {
      if (s.a !== z && s.b !== z) continue;
      const o = s.a === z ? s.b : s.a;
      if (!straitOpen(s, tag)) continue;
      if (!out.some(e => e[0] === o)) out.push([o, GEO.haversineKm(b.zones[z].lon, b.zones[z].lat, b.zones[o].lon, b.zones[o].lat)]);
    }
    return out;
  }
  // cheapest route between zones; avoid(z) returns true for zones that can't be crossed
  function route(from, to, tag, avoid) {
    if (from === to) return [];
    const b = B(), dist = new Map([[from, 0]]), came = new Map(), open = [[0, from]], done = new Set();
    while (open.length) {
      let bi = 0; for (let i = 1; i < open.length; i++) if (open[i][0] < open[bi][0]) bi = i;
      const [d, cur] = open.splice(bi, 1)[0];
      if (cur === to) break;
      if (done.has(cur)) continue; done.add(cur);
      for (const [n, km] of neighbours(cur, tag)) {
        if (done.has(n) || (avoid && n !== to && avoid(n))) continue;
        const nd = d + km;
        if (nd < (dist.has(n) ? dist.get(n) : Infinity)) { dist.set(n, nd); came.set(n, cur); open.push([nd, n]); }
      }
    }
    if (!came.has(to)) return null;
    const path = [to]; let c = to;
    while (came.get(c) !== from) { c = came.get(c); path.unshift(c); }
    return path;
  }
  function routeKm(from, path) {
    let km = 0, cur = from;
    for (const z of path) { km += GEO.haversineKm(zone(cur).lon, zone(cur).lat, zone(z).lon, zone(z).lat); cur = z; }
    return km;
  }
  return { build, zoneAt, zonesOf, isCoastal, zone, all, neighbours, route, routeKm, straitOpen, straitBetween, get straits() { return B().straits; }, get grid() { return { cell: B().cell, X0, Y0, NX, NY, RES }; } };
})();
