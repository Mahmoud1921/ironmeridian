// Procedural province map: seeds are placed on land (cities first), then each
// landmass is split into Voronoi cells. Everything is deterministic from MAP_SEED.
'use strict';
const MAP_SEED = 19360101;

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const TERRAIN = {
  plains:    { name: 'Plains',    atk: 1.00, move: 1.00, armor: 1.0, color: '#9aa56a', pop: 1.0 },
  forest:    { name: 'Forest',    atk: 0.85, move: 0.80, armor: 0.75, color: '#4f6b3e', pop: 0.7 },
  hills:     { name: 'Hills',     atk: 0.80, move: 0.75, armor: 0.85, color: '#a08a5c', pop: 0.7 },
  mountains: { name: 'Mountains', atk: 0.60, move: 0.50, armor: 0.6, color: '#7d6f63', pop: 0.35 },
  desert:    { name: 'Desert',    atk: 0.95, move: 0.85, armor: 1.0, color: '#d2bd84', pop: 0.12 },
  jungle:    { name: 'Jungle',    atk: 0.70, move: 0.60, armor: 0.6, color: '#3d6b45', pop: 0.5 },
  marsh:     { name: 'Marsh',     atk: 0.70, move: 0.55, armor: 0.6, color: '#6b8577', pop: 0.4 },
  tundra:    { name: 'Tundra',    atk: 0.85, move: 0.70, armor: 0.85, color: '#b8bfb6', pop: 0.08 },
  urban:     { name: 'Urban',     atk: 0.70, move: 0.90, armor: 0.7, color: '#8d8a86', pop: 3.0 }
};

const MapGen = (function () {
  const P = GEO.project;

  function polyFromLonLat(arr) {
    const pts = [];
    for (let i = 0; i < arr.length; i += 2) { const p = P(arr[i], arr[i + 1]); pts.push(p[0], p[1]); }
    return pts;
  }
  function bboxOf(pts) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < pts.length; i += 2) {
      if (pts[i] < x0) x0 = pts[i]; if (pts[i] > x1) x1 = pts[i];
      if (pts[i + 1] < y0) y0 = pts[i + 1]; if (pts[i + 1] > y1) y1 = pts[i + 1];
    }
    return [x0, y0, x1, y1];
  }
  function pip(pts, x, y) {
    let inside = false;
    for (let i = 0, j = pts.length - 2; i < pts.length; j = i, i += 2) {
      const xi = pts[i], yi = pts[i + 1], xj = pts[j], yj = pts[j + 1];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }

  // Desired province spacing (world units) by region.
  function spacing(lon, lat) {
    if (lon > -11 && lon < 42 && lat > 35 && lat < 62) return 1.45;
    if (lat > 68) return 5.0;
    if (lon > 42 && lon < 146 && lat > -11 && lat < 56) return 2.7;
    if (lon > -125 && lon < -66 && lat > 25 && lat < 50) return 2.9;
    return 3.6;
  }

  function andesLon(lat) {
    const pts = [[10, -73], [5, -75.5], [-5, -78.5], [-10, -76.5], [-17, -69], [-25, -68], [-33, -70], [-45, -72], [-55, -71]];
    for (let i = 0; i < pts.length - 1; i++) {
      const [la, lo] = pts[i], [lb, lob] = pts[i + 1];
      if (lat <= la && lat >= lb) return lo + (lob - lo) * (la - lat) / (la - lb);
    }
    return null;
  }

  function terrainAt(lon, lat, rnd) {
    const inB = (a, b, c, d) => lon >= a && lon <= b && lat >= c && lat <= d;
    if (inB(24, 30.5, 51, 52.8) || inB(29, 32, 6, 9.5)) return 'marsh';
    const al = andesLon(lat);
    if (al !== null && Math.abs(lon - al) < 2.6 && lat < 10 && lat > -52) return 'mountains';
    if (inB(6, 14, 45.6, 47.6) || inB(-1.5, 2.5, 42.3, 43) || inB(39, 48, 41.8, 43.6) || inB(75, 99, 28, 36) ||
        inB(68, 76, 34, 39.5) || inB(74, 88, 41, 43.8) || inB(98, 104, 24, 33) || inB(36.5, 40.5, 7.5, 13.5) ||
        inB(-121, -105, 36, 49) || inB(-130, -116, 49, 60) || inB(46, 54, 29.5, 34.5) || inB(-6.5, 1, 31, 33.5)) return 'mountains';
    if (inB(-17, 33, 16, 30.5) || inB(35, 58, 16, 30) || inB(53, 66, 37, 46) || inB(69, 73, 24, 29) ||
        inB(78, 112, 37, 45) || inB(118, 146, -30, -19) || inB(-117, -108, 31, 37) || inB(-71, -68, -27, -18) ||
        inB(14, 24, -27, -19) || inB(42, 51, 2, 11) || inB(92, 105, 36, 42)) return 'desert';
    if (inB(-75, -45, -12, 5) || inB(10, 30, -6, 5) || inB(-13, 10, 4, 8) || inB(95, 110, 8, 22) ||
        inB(95, 155, -10, 8) || inB(-92, -77, 7, 18)) return 'jungle';
    if (lat > 66 || (lat > 60 && lon > 95) || (lat > 58 && lon < -60 && lon > -170)) return 'tundra';
    if (inB(18, 27, 42, 48.5) || inB(38, 44.5, 37, 41) || inB(26, 38, 37, 40) || inB(56, 61, 51, 66) ||
        inB(-83, -76, 35, 41) || inB(130, 142, 33, 42)) return rnd < 0.6 ? 'hills' : 'forest';
    if ((lat > 52 && lat < 66 && lon > 28) || (lat > 48 && lat < 60 && lon < -55 && lon > -135) || (lat > 58 && lon > 5 && lon < 32))
      return rnd < 0.75 ? 'forest' : (rnd < 0.85 ? 'marsh' : 'plains');
    if (inB(-95, -68, 30, 47)) return rnd < 0.45 ? 'forest' : (rnd < 0.6 ? 'hills' : 'plains');
    if (rnd < 0.18) return 'hills';
    if (rnd < 0.32) return 'forest';
    return 'plains';
  }

  // Clip convex polygon (array of {x,y,n}) to the half-plane nearer s than q.
  function clipHalf(poly, sx, sy, qx, qy, qi) {
    const nx = qx - sx, ny = qy - sy, mx = (sx + qx) / 2, my = (sy + qy) / 2;
    const out = [];
    const n = poly.length;
    for (let i = 0; i < n; i++) {
      const c = poly[i], d = poly[(i + 1) % n];
      const fc = (c.x - mx) * nx + (c.y - my) * ny;
      const fd = (d.x - mx) * nx + (d.y - my) * ny;
      if (fc <= 0) {
        out.push(c);
        if (fd > 0) { const t = fc / (fc - fd); out.push({ x: c.x + (d.x - c.x) * t, y: c.y + (d.y - c.y) * t, n: qi }); }
      } else if (fd <= 0) {
        const t = fc / (fc - fd); out.push({ x: c.x + (d.x - c.x) * t, y: c.y + (d.y - c.y) * t, n: c.n });
      }
    }
    return out;
  }

  function generate() {
    const t0 = performance.now();
    const rnd = mulberry32(MAP_SEED);
    const lms = [];
    for (const key in GEO.landmasses) {
      const pts = polyFromLonLat(GEO.landmasses[key]);
      lms.push({ key, pts, bbox: bboxOf(pts) });
    }
    const lakes = GEO.lakes.map(l => { const pts = polyFromLonLat(l); return { pts, bbox: bboxOf(pts) }; });

    function landmassAt(x, y) {
      for (const l of lakes) if (x >= l.bbox[0] && x <= l.bbox[2] && y >= l.bbox[1] && y <= l.bbox[3] && pip(l.pts, x, y)) return -1;
      for (let i = 0; i < lms.length; i++) {
        const b = lms[i].bbox;
        if (x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3] && pip(lms[i].pts, x, y)) return i;
      }
      return -1;
    }

    // --- seeds ---
    const seeds = []; // {x,y,lm,city,tag,capital}
    const GRID = 2;
    const grid = new Map();
    const gkey = (gx, gy) => gx * 100000 + gy;
    function addSeed(s) { seeds.push(s); const k = gkey(Math.floor(s.x / GRID), Math.floor(s.y / GRID)); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(s); }
    function nearestSeedDist(x, y, maxR) {
      const r = Math.ceil(maxR / GRID); const gx = Math.floor(x / GRID), gy = Math.floor(y / GRID);
      let best = Infinity;
      for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) {
        const arr = grid.get(gkey(gx + i, gy + j)); if (!arr) continue;
        for (const s of arr) { const d = Math.hypot(s.x - x, s.y - y); if (d < best) best = d; }
      }
      return best;
    }
    function snapToLand(x, y) {
      let lm = landmassAt(x, y);
      if (lm >= 0) return [x, y, lm];
      for (let r = 0.25; r <= 2.5; r += 0.25) {
        for (let a = 0; a < 16; a++) {
          const xx = x + Math.cos(a * Math.PI / 8) * r, yy = y + Math.sin(a * Math.PI / 8) * r;
          lm = landmassAt(xx, yy);
          if (lm >= 0) return [xx, yy, lm];
        }
      }
      return null;
    }

    // City anchors (also ownership anchors)
    const anchors = [];
    for (const c of COUNTRY_DEFS) {
      c.cities.forEach((ct, idx) => {
        const p = P(ct[1], ct[2]);
        const s = snapToLand(p[0], p[1]);
        if (!s) return;
        anchors.push({ x: s[0], y: s[1], lm: s[2], tag: c.tag, name: ct[0], capital: idx === 0, lon: ct[1], lat: ct[2] });
      });
    }
    // capitals first, then other cities, so capitals always become seeds
    anchors.sort((a, b) => (b.capital ? 1 : 0) - (a.capital ? 1 : 0));
    for (const a of anchors) {
      const r = spacing(a.lon, a.lat);
      if (nearestSeedDist(a.x, a.y, r) < r * 0.55) continue;
      addSeed({ x: a.x, y: a.y, lm: a.lm, city: a.name, capital: a.capital, cityTag: a.tag });
    }
    // Poisson-ish fill per landmass
    lms.forEach((lm, li) => {
      const b = lm.bbox;
      const area = (b[2] - b[0]) * (b[3] - b[1]);
      const tries = Math.ceil(area * 3.2);
      let placed = 0;
      for (let t = 0; t < tries; t++) {
        const x = b[0] + rnd() * (b[2] - b[0]), y = b[1] + rnd() * (b[3] - b[1]);
        if (landmassAt(x, y) !== li) continue;
        const ll = GEO.unproject(x, y);
        const r = spacing(ll[0], ll[1]);
        if (nearestSeedDist(x, y, r) < r) continue;
        addSeed({ x, y, lm: li }); placed++;
      }
      // ensure every landmass has at least one seed
      if (!seeds.some(s => s.lm === li)) {
        let cx = 0, cy = 0, n = lm.pts.length / 2;
        for (let i = 0; i < lm.pts.length; i += 2) { cx += lm.pts[i]; cy += lm.pts[i + 1]; }
        const s = snapToLand(cx / n, cy / n) || [lm.pts[0], lm.pts[1], li];
        addSeed({ x: s[0], y: s[1], lm: li });
      }
    });

    // --- Voronoi per landmass ---
    const provs = seeds.map((s, i) => ({ id: i, x: s.x, y: s.y, lm: s.lm, city: s.city || null, capital: !!s.capital, cityTag: s.cityTag || null, nb: [], poly: null }));
    const edges = []; // {a,b,x1,y1,x2,y2}
    const byLm = lms.map(() => []);
    provs.forEach(p => byLm[p.lm].push(p));
    byLm.forEach((list, li) => {
      const b = lms[li].bbox;
      const box = [b[0] - 1, b[1] - 1, b[2] + 1, b[3] + 1];
      for (const p of list) {
        let poly = [{ x: box[0], y: box[1], n: -1 }, { x: box[2], y: box[1], n: -1 }, { x: box[2], y: box[3], n: -1 }, { x: box[0], y: box[3], n: -1 }];
        const all = list.filter(q => q !== p).map(q => ({ q, d: Math.hypot(q.x - p.x, q.y - p.y) }));
        let others = all.filter(o => o.d < 14).sort((u, v) => u.d - v.d);
        let complete = others.length === all.length;
        for (let k = 0; k < others.length || !complete; k++) {
          if (k >= others.length) { others = all.sort((u, v) => u.d - v.d); complete = true; if (k >= others.length) break; }
          const o = others[k];
          let maxR = 0;
          for (const v of poly) { const d = Math.hypot(v.x - p.x, v.y - p.y); if (d > maxR) maxR = d; }
          if (o.d > 2 * maxR) break;
          if (!complete && 2 * maxR > 14 && k === others.length - 1) { /* may need farther seeds */ }
          poly = clipHalf(poly, p.x, p.y, o.q.x, o.q.y, o.q.id);
          if (poly.length < 3) break;
        }
        p.poly = poly;
      }
    });
    // edges & adjacency (shared edges whose samples lie on land)
    for (const p of provs) {
      const poly = p.poly;
      for (let i = 0; i < poly.length; i++) {
        const v = poly[i], w = poly[(i + 1) % poly.length];
        if (v.n < 0 || v.n < p.id) continue;
        const q = provs[v.n];
        let land = false;
        for (const t of [0.15, 0.35, 0.5, 0.65, 0.85]) {
          const x = v.x + (w.x - v.x) * t, y = v.y + (w.y - v.y) * t;
          if (landmassAt(x, y) === p.lm) { land = true; break; }
        }
        edges.push({ a: p.id, b: q.id, x1: v.x, y1: v.y, x2: w.x, y2: w.y, land });
        if (land) { p.nb.push(q.id); q.nb.push(p.id); }
      }
    }
    // provinces left without land neighbours on a multi-province landmass join their nearest ones
    for (const p of provs) {
      if (p.nb.length) continue;
      const cand = byLm[p.lm].filter(q => q !== p).sort((u, v) => Math.hypot(u.x - p.x, u.y - p.y) - Math.hypot(v.x - p.x, v.y - p.y)).slice(0, 2);
      for (const q of cand) if (!p.nb.includes(q.id)) { p.nb.push(q.id); q.nb.push(p.id); }
    }
    // straits
    function nearestProv(lon, lat) {
      const pp = P(lon, lat); let best = null, bd = Infinity;
      for (const p of provs) { const d = Math.hypot(p.x - pp[0], p.y - pp[1]); if (d < bd) { bd = d; best = p; } }
      return best;
    }
    const straits = [];
    for (const l of GEO.links) {
      const a = nearestProv(l[0], l[1]), b = nearestProv(l[2], l[3]);
      if (a && b && a !== b && !a.nb.includes(b.id)) { a.nb.push(b.id); b.nb.push(a.id); straits.push([a.id, b.id]); }
    }

    // --- province attributes ---
    for (const p of provs) {
      const ll = GEO.unproject(p.x, p.y);
      p.lon = ll[0]; p.lat = ll[1];
      p.terrain = terrainAt(p.lon, p.lat, rnd());
      if (p.capital) p.terrain = 'urban';
      p.spacing = spacing(p.lon, p.lat);
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const v of p.poly) { x0 = Math.min(x0, v.x); y0 = Math.min(y0, v.y); x1 = Math.max(x1, v.x); y1 = Math.max(y1, v.y); }
      p.bbox = [x0, y0, x1, y1];
      p.res = {};
    }
    // ownership: nearest anchor on the same landmass (fallback: any)
    for (const p of provs) {
      let best = null, bd = Infinity, bestAny = null, bdAny = Infinity;
      for (const a of anchors) {
        const d = Math.hypot(a.x - p.x, a.y - p.y);
        if (a.lm === p.lm && d < bd) { bd = d; best = a; }
        if (d < bdAny) { bdAny = d; bestAny = a; }
      }
      p.owner = (best || bestAny).tag;
      if (p.cityTag) p.owner = p.cityTag;
      p.core = p.owner;
    }
    // names
    const TERRAIN_WORD = { plains: 'Plains', forest: 'Woods', hills: 'Hills', mountains: 'Highlands', desert: 'Wastes', jungle: 'Jungle', marsh: 'Marshes', tundra: 'Tundra', urban: 'District' };
    const cityProvs = provs.filter(p => p.city);
    const used = {};
    for (const p of provs) {
      if (p.city) { p.name = p.city; continue; }
      let best = null, bd = Infinity;
      for (const c of cityProvs) {
        if (c.owner !== p.owner) continue;
        const d = Math.hypot(c.x - p.x, c.y - p.y); if (d < bd) { bd = d; best = c; }
      }
      if (!best) for (const c of cityProvs) { const d = Math.hypot(c.x - p.x, c.y - p.y); if (d < bd) { bd = d; best = c; } }
      const dx = p.x - best.x, dy = p.y - best.y;
      const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'East' : 'West') : (dy > 0 ? 'South' : 'North');
      let name = best.city + ' ' + TERRAIN_WORD[p.terrain];
      if (used[name]) name = dir + ' ' + name;
      if (used[name]) name = 'Upper ' + best.city + ' ' + TERRAIN_WORD[p.terrain];
      if (used[name]) name = best.city + ' ' + TERRAIN_WORD[p.terrain] + ' ' + (used[name] + 1);
      used[name] = (used[name] || 0) + 1;
      p.name = name;
    }
    // resources
    for (const r of RESOURCE_SITES) {
      const p = nearestProv(r[1], r[2]);
      if (p) p.res[r[0]] = (p.res[r[0]] || 0) + r[3];
    }
    for (const p of provs) {
      if (p.terrain === 'hills' || p.terrain === 'mountains') { if (rnd() < 0.35) p.res.steel = (p.res.steel || 0) + 1 + Math.floor(rnd() * 3); if (rnd() < 0.25) p.res.coal = (p.res.coal || 0) + 1 + Math.floor(rnd() * 3); }
      else if (rnd() < 0.08) p.res.coal = (p.res.coal || 0) + 1 + Math.floor(rnd() * 2);
    }
    // population, infrastructure, factories
    const byOwner = {};
    provs.forEach(p => { (byOwner[p.owner] = byOwner[p.owner] || []).push(p); });
    for (const c of COUNTRY_DEFS) {
      const list = byOwner[c.tag] || [];
      if (!list.length) continue;
      // Homeland = provinces on the capital's landmass within reach; colonies weigh less.
      const cap = list.find(p => p.capital) || list[0];
      let wsum = 0;
      for (const p of list) {
        const home = p.lm === cap.lm && Math.hypot(p.x - cap.x, p.y - cap.y) < 25;
        p.home = home;
        p.w = TERRAIN[p.terrain].pop * (p.capital ? 6 : p.city ? 2.5 : 1) * (home ? 1 : 0.35) * (0.7 + rnd() * 0.6);
        wsum += p.w;
      }
      for (const p of list) {
        p.pop = Math.max(5000, Math.round(c.pop * 1e6 * p.w / wsum / 1000) * 1000);
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
    }
    for (const p of provs) { delete p.w; if (p.pop === undefined) { p.pop = 20000; p.infra = 1; p.civ = 0; p.mil = 0; } }

    // Path2D data in world coords
    const flat = p => { const a = []; for (const v of p.poly) a.push(v.x, v.y); return a; };
    provs.forEach(p => { p.flat = flat(p); });

    const dt = performance.now() - t0;
    return { provs, edges, lms, lakes, straits, landmassAt, genMs: dt };
  }

  return { generate, pip };
})();
