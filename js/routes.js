// Roads and railways between a nation's buildings, and across the border to trade partners.
// They build themselves: roads within 300 km, railways within 450 km in 1914 and 1936 between heavy works.
// At most 3 home links per building site, and no link where the network already offers a path under
// 1.5 times the straight line. Routes give output, army speed, supply and tolls, and cost upkeep.
// Everything lives in G.routes as plain data, so saves and the online game carry it.
'use strict';
const Routes = (function () {
  const ROAD_KM = 300, RAIL_KM = 450, MAX_LINKS = 3, DETOUR = 1.5;
  const HEAVY = new Set(['mine', 'fuel', 'strat', 'arsenal', 'port', 'dock', 'hub']);
  const DAYS = { road: 20, rail: 45 }, UPKEEP = { road: 0.5, rail: 1.5 }, TOLL = { road: 0.3, rail: 1 };
  const OUT = { road: 1.1, rail: 1.2 }, SPEED = { road: 1.3, rail: 2 }, TRADE = { road: 0.1, rail: 0.2 };
  const G = () => Sim.G, MAP = () => Sim.MAP;
  const railEra = () => { const e = typeof Economy !== 'undefined' ? Economy.eraId() : 'ww2-1936'; return e === 'ww2-1936' || e === 'greatwar-1914'; };
  const list = () => { const g = G(); if (!g.routes) g.routes = []; return g.routes; };
  const kindOf = r => r.rail ? 'rail' : 'road';
  function km(a, b) { const P = MAP().provs, p = P[a], q = P[b]; return GEO.haversineKm(p.lon, p.lat, q.lon, q.lat); }
  const atWar = (a, b) => a !== b && Sim.atWar(a, b);
  const friend = (a, b) => a === b || Sim.allied(a, b);

  // ---------- building sites ----------
  function sitesByOwner() {
    const g = G(), out = {};
    const ind = g.ind || [], inf = g.inf || [];
    for (let i = 0; i < g.owner.length; i++) {
      const I = ind[i], F = inf[i];
      let any = false, heavy = false;
      if (I) for (const k in I) if (I[k] > 0) { any = true; if (HEAVY.has(k)) heavy = true; }
      if (F) for (const k in F) if (F[k] > 0) { any = true; if (HEAVY.has(k)) heavy = true; }
      if (!any) continue;
      const o = g.owner[i];
      (out[o] || (out[o] = [])).push({ pid: i, heavy });
    }
    return out;
  }
  // the chain of province centres from a to b through provinces ok() allows, by the shortest distance
  function pathThrough(a, b, ok, maxKm) {
    const P = MAP().provs, best = new Map([[a, 0]]), prev = new Map(), open = [a];
    while (open.length) {
      let bi = 0; for (let i = 1; i < open.length; i++) if (best.get(open[i]) < best.get(open[bi])) bi = i;
      const u = open.splice(bi, 1)[0];
      if (u === b) break;
      for (const n of P[u].nb) {
        if (n !== b && !ok(n)) continue;
        const d = best.get(u) + km(u, n);
        if (d > maxKm) continue;
        if (!best.has(n) || d < best.get(n)) { best.set(n, d); prev.set(n, u); open.push(n); }
      }
    }
    if (!best.has(b)) return null;
    const path = [b]; while (path[0] !== a) path.unshift(prev.get(path[0]));
    return path;
  }
  function netLen(adj, from, to) {
    const best = new Map([[from, 0]]), open = [from];
    while (open.length) {
      let bi = 0; for (let i = 1; i < open.length; i++) if (best.get(open[i]) < best.get(open[bi])) bi = i;
      const u = open.splice(bi, 1)[0];
      if (u === to) return best.get(u);
      for (const [v, w] of adj.get(u) || []) { const d = best.get(u) + w; if (!best.has(v) || d < best.get(v)) { best.set(v, d); open.push(v); } }
    }
    return Infinity;
  }
  const newRoute = (tag, a, b, rail, path, open, trade) => {
    const g = G(), r = { id: g.routeNext = (g.routeNext || 0) + 1, tag, a, b, rail, path, km: Math.round(km(a, b)), state: open ? 'open' : 'building', born: open ? -1e9 : g.hour };
    if (!open) r.left = r.total = DAYS[kindOf(r)];
    if (trade) { r.trade = trade; r.cross = path.findIndex(p => g.owner[p] === trade); }
    return r;
  };

  // ---------- the network of one nation ----------
  const keys = {};
  function rebuild(tag, sites, open) {
    const g = G(), R = list(), rail = railEra();
    const S = new Map((sites || []).map(s => [s.pid, s]));
    const mine = R.filter(r => r.tag === tag && !r.trade);
    const deg = new Map(), adj = new Map();
    const link = (a, b, d) => { deg.set(a, (deg.get(a) || 0) + 1); deg.set(b, (deg.get(b) || 0) + 1); (adj.get(a) || adj.set(a, []).get(a)).push([b, d]); (adj.get(b) || adj.set(b, []).get(b)).push([a, d]); };
    const have = new Set();
    for (const r of mine) {
      link(r.a, r.b, r.km); have.add(Math.min(r.a, r.b) + '-' + Math.max(r.a, r.b));
      // a road between two heavy works becomes a railway once railways exist
      if (!r.rail && rail && S.get(r.a)?.heavy && S.get(r.b)?.heavy && r.km <= RAIL_KM) { r.rail = true; r.state = 'building'; r.left = r.total = DAYS.rail; r.born = g.hour; }
    }
    const L = sites || [], pairs = [];
    for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
      const a = L[i], b = L[j];
      if (have.has(Math.min(a.pid, b.pid) + '-' + Math.max(a.pid, b.pid))) continue;
      const P = MAP().provs, pa = P[a.pid], pb = P[b.pid];
      if (Math.abs(pa.lat - pb.lat) > 5 || Math.abs(pa.lon - pb.lon) > 9) continue;   // quick reject before the exact distance
      const d = km(a.pid, b.pid), isRail = rail && a.heavy && b.heavy;
      if (d <= (isRail ? RAIL_KM : ROAD_KM)) pairs.push({ a: a.pid, b: b.pid, d, rail: isRail });
    }
    pairs.sort((p, q) => p.d - q.d);
    for (const p of pairs) {
      if ((deg.get(p.a) || 0) >= MAX_LINKS || (deg.get(p.b) || 0) >= MAX_LINKS) continue;
      if (netLen(adj, p.a, p.b) < DETOUR * p.d) continue;
      const path = pathThrough(p.a, p.b, n => g.owner[n] === tag, p.d * 2.2);
      if (!path) continue;
      link(p.a, p.b, p.d);
      R.push(newRoute(tag, p.a, p.b, p.rail, path, open));
    }
  }
  // routes whose ends or land changed hands are dropped (a route through enemy-held land is only cut)
  function valid(r, sites) {
    const g = G(), own = g.owner;
    const isSite = (t, pid) => own[pid] === t && (sites[t] || []).some(s => s.pid === pid);
    const held = (pid, t) => own[pid] === t || atWar(t, own[pid]);
    if (!r.trade) {
      const endOk = pid => (own[pid] === r.tag && isSite(r.tag, pid)) || atWar(r.tag, own[pid]);
      return endOk(r.a) && endOk(r.b) && r.path.every(p => held(p, r.tag));
    }
    if (!g.countries[r.tag]?.alive || !g.countries[r.trade]?.alive) return false;
    return r.path.every(p => own[p] === r.tag || own[p] === r.trade || atWar(r.tag, own[p]) || atWar(r.trade, own[p]));
  }
  // trade routes: one per land neighbour we trade with, between the nearest pair of buildings in range
  function tradeRoutes(sites, open) {
    const g = G(), R = list(), rail = railEra(), seen = new Set();
    const dealsBetween = new Set();
    for (const d of g.dip.trade) dealsBetween.add(Sim.pairKey(d.from, d.to));
    // routes of ended deals go quiet; after a year without a new deal they fade away
    for (const r of R) if (r.trade) {
      const live = dealsBetween.has(Sim.pairKey(r.tag, r.trade));
      if (live) { if (r.idle !== undefined) delete r.idle; }
      else if (r.idle === undefined) r.idle = g.hour;
    }
    for (let i = R.length - 1; i >= 0; i--) if (R[i].trade && R[i].idle !== undefined && g.hour - R[i].idle > 24 * 365) R.splice(i, 1);
    for (const k of dealsBetween) {
      if (seen.has(k)) continue; seen.add(k);
      const [A, B] = k.split('|');
      if (!A || !B || !g.countries[A] || !g.countries[B]) continue;
      if (R.some(r => r.trade && Sim.pairKey(r.tag, r.trade) === k)) continue;
      if (typeof Diplo !== 'undefined' && Diplo.borders && !Diplo.borders(A, B)) continue;
      let best = null;
      for (const a of sites[A] || []) for (const b of sites[B] || []) {
        const P = MAP().provs, pa = P[a.pid], pb = P[b.pid];
        if (Math.abs(pa.lat - pb.lat) > 5 || Math.abs(pa.lon - pb.lon) > 9) continue;
        const d = km(a.pid, b.pid), isRail = rail && a.heavy && b.heavy;
        if (d <= (isRail ? RAIL_KM : ROAD_KM) && (!best || d < best.d)) best = { a: a.pid, b: b.pid, d, rail: isRail };
      }
      if (!best) continue;
      const path = pathThrough(best.a, best.b, n => g.owner[n] === A || g.owner[n] === B, best.d * 2.2);
      if (path) R.push(newRoute(A, best.a, best.b, best.rail, path, open, B));
    }
  }

  // ---------- state ----------
  function cut(r) {
    const g = G(), own = g.owner;
    if (r.trade && atWar(r.tag, r.trade)) return true;
    for (const p of r.path) {
      const o = own[p];
      if (atWar(r.tag, o) || (r.trade && atWar(r.trade, o))) return true;
      // bombers can put a railway out of action
      if (r.rail && typeof Air !== 'undefined' && Air.bombDamage(p) > 0.2) return true;
    }
    return false;
  }
  const working = r => r.state === 'open' && r.idle === undefined && !cut(r);

  // bonuses are looked up many times an hour, so they are indexed once a day
  let idx = null;
  function index() {
    const R = list(), out = new Map(), edge = new Map(), onRoute = new Map();
    for (const r of R) {
      const w = working(r);
      r.cutNow = r.state === 'open' && r.idle === undefined && !w;
      const k = kindOf(r);
      if (w) {
        for (const pid of [r.a, r.b]) out.set(pid, Math.max(out.get(pid) || 1, OUT[k]));
        for (const pid of r.path) { const l = onRoute.get(pid) || []; l.push(r); onRoute.set(pid, l); }
      }
      if (r.state === 'open' && r.idle === undefined) for (let i = 1; i < r.path.length; i++) {
        const a = r.path[i - 1], b = r.path[i], key = Math.min(a, b) * 100000 + Math.max(a, b);
        (edge.get(key) || edge.set(key, []).get(key)).push(r);
      }
    }
    idx = { out, edge, onRoute };
  }
  const I = () => { if (!idx) index(); return idx; };

  function daily(open) {
    const g = G(); if (!g || !g.ind) return;
    const sites = sitesByOwner(), R = list();
    // drop routes that no longer make sense
    for (let i = R.length - 1; i >= 0; i--) if (!valid(R[i], sites)) R.splice(i, 1);
    // rebuild a nation's network only when its buildings, land or era changed
    const rail = railEra() ? 'r' : '';
    for (const t in g.countries) {
      const c = g.countries[t];
      if (!c.alive) { if (keys[t]) delete keys[t]; continue; }
      const S = sites[t] || [];
      const key = rail + S.length + ':' + S.reduce((h, s) => (h * 31 + s.pid * 2 + (s.heavy ? 1 : 0)) >>> 0, 7) + ':' + R.filter(r => r.tag === t && !r.trade).length;
      if (keys[t] === key) continue;
      rebuild(t, S, open);
      keys[t] = rail + S.length + ':' + S.reduce((h, s) => (h * 31 + s.pid * 2 + (s.heavy ? 1 : 0)) >>> 0, 7) + ':' + R.filter(r => r.tag === t && !r.trade).length;
    }
    if (g.dip && g.dip.trade) tradeRoutes(sites, open);
    // construction goes on by itself, but not while an enemy holds part of the way
    for (const r of R) if (r.state === 'building' && !cut(r)) {
      r.left -= 1;
      if (r.left <= 0) { r.state = 'open'; delete r.left; delete r.total; r.opened = g.hour; }
    }
    index();
  }
  // a network for the nations as they start, already built
  function setup() { const g = G(); g.routes = []; g.routeNext = 0; for (const k in keys) delete keys[k]; daily(true); }
  function restore() { for (const k in keys) delete keys[k]; idx = null; if (G()) list(); }

  function monthly() {
    const g = G();
    const add = (t, v) => { const c = g.countries[t]; if (c && c.alive && c.eco && !c.eco.none) c.eco.gold += v; };
    const rel = new Set();
    for (const r of list()) {
      if (r.idle !== undefined) continue;
      const k = kindOf(r), w = working(r);
      const share = r.trade ? 0.5 : 1;
      add(r.tag, (w ? TOLL[k] : 0) - UPKEEP[k] * share);
      if (r.trade) {
        add(r.trade, (w ? TOLL[k] : 0) - UPKEEP[k] * share);
        const key = Sim.pairKey(r.tag, r.trade);
        if (w && !rel.has(key) && typeof Diplo !== 'undefined') { rel.add(key); Diplo.addRel(r.tag, r.trade, 1); }
      }
    }
  }

  // ---------- what routes give ----------
  // output of the buildings at either end of a working route
  function outMul(pid) { return I().out.get(pid) || 1; }
  // armies moving from one province to the next along a route
  function speedMul(tag, from, to) {
    const l = I().edge.get(Math.min(from, to) * 100000 + Math.max(from, to));
    if (!l) return 1;
    let m = 1;
    for (const r of l) {
      const k = kindOf(r), mine = friend(tag, r.tag) || (r.trade && friend(tag, r.trade));
      if (mine && !r.cutNow) m = Math.max(m, SPEED[k]);
      else if (!mine && !r.rail && atWar(tag, r.tag)) m = Math.max(m, SPEED.road);   // captured roads, but not railways
    }
    return m;
  }
  // provinces along a working route count one more level of infrastructure for supply
  function infraAt(pid, tag) { const l = I().onRoute.get(pid); return l && l.some(r => friend(tag, r.tag) || (r.trade && friend(tag, r.trade))) ? 1 : 0; }
  // supply loses less over a railway
  function railEdge(tag, a, b) {
    const l = I().edge.get(Math.min(a, b) * 100000 + Math.max(a, b));
    return !!l && l.some(r => r.rail && !r.cutNow && (friend(tag, r.tag) || (r.trade && friend(tag, r.trade))));
  }
  // extra goods a deal delivers over a working trade route
  function tradeBoost(from, to) {
    let b = 0;
    for (const r of list()) if (r.trade && ((r.tag === from && r.trade === to) || (r.tag === to && r.trade === from)) && working(r)) b = Math.max(b, TRADE[kindOf(r)]);
    return b;
  }
  const any = () => list().length > 0;
  function of(pid) { return list().filter(r => r.a === pid || r.b === pid); }
  function summary(tag) {
    let open = 0, building = 0, cutN = 0, idle = 0, up = 0, toll = 0, rails = 0;
    for (const r of list()) {
      if (r.tag !== tag && r.trade !== tag) continue;
      const k = kindOf(r);
      if (r.idle !== undefined) { idle++; continue; }
      if (r.rail) rails++;
      if (r.state === 'building') building++; else if (r.cutNow) cutN++; else open++;
      up += UPKEEP[k] * (r.trade ? 0.5 : 1);
      if (working(r)) toll += TOLL[k];
    }
    return { open, building, cut: cutN, idle, rails, upkeep: up, tolls: toll };
  }
  return { setup, restore, daily, monthly, outMul, speedMul, infraAt, railEdge, tradeBoost, any, of, summary, working, isCut: r => !!r.cutNow, kindOf, HEAVY, ROAD_KM, RAIL_KM, reindex: () => { idx = null; } };
})();
