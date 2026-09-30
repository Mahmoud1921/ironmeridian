// Research: an era tree (4 branches, a locked choice at tier 3), a national or culture branch,
// two research slots, date gates, and the modifiers every other system asks for with Tech.mod().
// Data comes from tech-data.js (TECH_DATA, TECH_CULTURE, TECH_CULTURE_MAP, TECH_CULTURE_OVERRIDE).
'use strict';
const Tech = (function () {
  const G = () => Sim.G, MAP = () => Sim.MAP;
  const DAY = 24;
  const TIER_COST = [60, 120, 200, 320];
  const SLOTS = 2;
  const BRANCH_ORDER = ['mil', 'ind', 'trade', 'state'];

  const eraId = () => (typeof Eras !== 'undefined' && Eras.info()) ? Eras.info().id : 'ww2-1936';
  const data = () => (typeof TECH_DATA !== 'undefined' && TECH_DATA[eraId()]) || null;

  // ---------- the trees ----------
  // index[id] = { t, branch, tier, alt (the other tier-3 option), prev: [ids that unlock it], cost, kind: 'era'|'nat'|'cul' }
  let index = {}, indexEra = null;
  function tiersToIndex(branchId, tiers, kind) {
    let prev = [];
    tiers.forEach((tier, i) => {
      const list = Array.isArray(tier) ? tier : [tier];
      for (const t of list) {
        index[t.id] = { t, branch: branchId, tier: i, alt: list.length > 1 ? list.find(x => x !== t).id : null, prev: prev.slice(), cost: TIER_COST[Math.min(i, 3)], kind };
      }
      prev = list.map(t => t.id);
    });
  }
  function buildIndex() {
    const id = eraId();
    if (indexEra === id) return;
    indexEra = id; index = {};
    const D = data();
    if (!D) return;
    for (const b of D.branches) tiersToIndex(b.id, b.tiers, 'era');
    for (const tag in (D.national || {})) tiersToIndex('nat:' + tag, D.national[tag].techs, 'nat');
    if (typeof TECH_CULTURE !== 'undefined') for (const k in TECH_CULTURE) tiersToIndex('cul:' + k, TECH_CULTURE[k].techs, 'cul');
  }
  function cultureGroup(tag) {
    const d = COUNTRY_BY_TAG[tag];
    if (!d) return null;
    const ov = typeof TECH_CULTURE_OVERRIDE !== 'undefined' && TECH_CULTURE_OVERRIDE[eraId()] && TECH_CULTURE_OVERRIDE[eraId()][tag];
    return ov || (typeof TECH_CULTURE_MAP !== 'undefined' && TECH_CULTURE_MAP[d.culture]) || null;
  }
  // the fifth column: the nation's own branch, else its culture's
  function ownBranch(tag) {
    const D = data();
    if (D && D.national && D.national[tag]) return { id: 'nat:' + tag, name: D.national[tag].name || G().countries[tag].name, tiers: D.national[tag].techs, national: true };
    const cg = cultureGroup(tag);
    if (cg && typeof TECH_CULTURE !== 'undefined' && TECH_CULTURE[cg]) return { id: 'cul:' + cg, name: TECH_CULTURE[cg].name, tiers: TECH_CULTURE[cg].techs, national: false };
    return null;
  }
  function branchesFor(tag) {
    const D = data();
    if (!D) return [];
    const out = BRANCH_ORDER.map(id => D.branches.find(b => b.id === id)).filter(Boolean).map(b => ({ id: b.id, name: b.name, tiers: b.tiers }));
    const own = ownBranch(tag);
    if (own) out.push(own);
    return out;
  }
  const info = id => { buildIndex(); return index[id] || null; };

  // ---------- modifiers ----------
  // fxOf[tag][mod] = [fx...], rebuilt when a nation finishes a tech
  let fxCache = {}, fxGame = null, memo = new Map(), memoHour = -1;
  function fxFor(tag) {
    const g = G();
    if (fxGame !== g) { fxGame = g; fxCache = {}; memo.clear(); }
    let f = fxCache[tag];
    if (!f) {
      f = fxCache[tag] = {};
      const c = g.countries[tag];
      for (const id of (c && c.techs) || []) {
        const x = info(id);
        if (!x) continue;
        for (const e of x.t.fx || []) (f[e.mod] || (f[e.mod] = [])).push(e);
      }
      // timed effects from events and decisions use the same vocabulary
      for (const m of (c && c.mods) || []) if (m.until > g.hour) for (const e of m.fx) (f[e.mod] || (f[e.mod] = [])).push(e);
    }
    return f;
  }
  function invalidate(tag) { delete fxCache[tag]; memo.clear(); }
  function unitClass(type) {
    const u = UNIT_TYPES[type];
    if (!u) return null;
    if (type === 'motorized' || type === 'mechanized' || u.symbol === 'mot' || u.symbol === 'mec') return 'motorised';
    return { inf: 'infantry', par: 'infantry', rec: 'cavalry', arm: 'armor', art: 'artillery', mar: 'marines' }[u.symbol] || 'infantry';
  }
  function whereOK(where, tag, p) {
    const g = G();
    switch (where) {
      case 'home': return p.core === tag;
      case 'border': return p.nb.some(n => g.owner[n] !== g.owner[p.id]);
      case 'coast': return typeof Economy !== 'undefined' ? Economy.coastal(p) : false;
      case 'capital': return !!p.capital && g.owner[p.id] === tag;
    }
    return true;
  }
  function match(e, tag, ctx) {
    ctx = ctx || {};
    if (e.when) { const w = Sim.isAtWar(tag); if ((e.when === 'war') !== w) return false; }
    if (e.good && ctx.good && e.good !== ctx.good) return false;
    if (e.good && !ctx.good && (e.mod === 'sellPrice' || e.mod === 'arsenalInputs' || e.mod === 'synthetic')) return false;
    if (e.unit || (e.cls && e.cls !== 'all')) {
      if (!ctx.unit) return false;
      if (e.unit && !e.unit.includes(ctx.unit)) { if (!e.cls || e.cls === 'all' || unitClass(ctx.unit) !== e.cls) return false; }
      else if (!e.unit && e.cls !== unitClass(ctx.unit)) return false;
    }
    if (e.region || e.where || e.terrain) {
      if (ctx.prov === undefined || ctx.prov < 0) return false;
      const p = MAP().provs[ctx.prov];
      if (e.region) { const r = e.region; if (p.lon < r[0] || p.lat < r[1] || p.lon > r[2] || p.lat > r[3]) return false; }
      if (e.terrain && !e.terrain.includes(ctx.terrain || p.terrain)) return false;
      if (e.where && !whereOK(e.where, tag, p)) return false;
    }
    return true;
  }
  // sum of a modifier for a nation in a context { prov, terrain, unit, good }
  function mod(tag, name, ctx) {
    const list = fxFor(tag)[name];
    if (!list) return 0;
    let v = 0;
    for (const e of list) if (match(e, tag, ctx)) v += +e.value || 0;
    return v;
  }
  // memoised for the hot paths (combat, movement): same answer within an hour
  function modFast(tag, name, unit, prov) {
    const g = G();
    if (memoHour !== g.hour) { memoHour = g.hour; memo.clear(); }
    const k = tag + name + unit + '|' + prov;
    let v = memo.get(k);
    if (v === undefined) { v = mod(tag, name, { unit, prov }); memo.set(k, v); }
    return v;
  }
  function unlocked(tag, unitKey) {
    const list = fxFor(tag).unlock;
    return !!(list && list.some(e => e.unit === unitKey));
  }
  // units a later tech unlocks, added to the era's catalogue (locked until researched)
  function registerUnlocks() {
    const D = data();
    if (!D) return;
    const scan = tiers => tiers.forEach(t => (Array.isArray(t) ? t : [t]).forEach(x => (x.fx || []).forEach(e => {
      if (e.mod === 'unlock' && e.def && !UNIT_TYPES[e.unit]) UNIT_TYPES[e.unit] = Object.assign({}, e.def, { locked: true });
    })));
    D.branches.forEach(b => scan(b.tiers));
    for (const k in D.national || {}) scan(D.national[k].techs);
    if (typeof LAND_TYPES !== 'undefined') { LAND_TYPES.length = 0; Object.keys(UNIT_TYPES).forEach(k => LAND_TYPES.push(k)); }
  }

  // ---------- research ----------
  function setup() {
    buildIndex();
    fxGame = null;
    for (const c of Object.values(G().countries)) { c.techs = []; c.rs = { slots: new Array(SLOTS).fill(null), saved: {} }; }
  }
  function has(tag, id) { const c = G().countries[tag]; return !!(c.techs && c.techs.includes(id)); }
  function researching(tag, id) { const c = G().countries[tag]; return !!(c.rs && c.rs.slots.some(s => s && s.id === id)); }
  function inBranchOf(tag, x) {
    if (x.kind === 'era') return true;
    const own = ownBranch(tag);
    return !!own && own.id === x.branch;
  }
  // state of a tech for a nation: 'done' | 'active' | 'open' | 'locked' | 'closed' (the other tier-3 option was taken)
  function state(tag, id) {
    const x = info(id);
    if (!x || !inBranchOf(tag, x)) return 'closed';
    if (has(tag, id)) return 'done';
    if (researching(tag, id)) return 'active';
    if (x.alt && (has(tag, x.alt) || researching(tag, x.alt))) return 'closed';
    if (x.prev.length && !x.prev.some(p => has(tag, p))) return 'locked';
    return 'open';
  }
  function dateReady(x) {
    if (!x.t.from) return true;
    const [y, m, d] = x.t.from;
    const t = new Date(Date.UTC(2000, (m || 1) - 1, d || 1)); t.setUTCFullYear(y);
    return Sim.dateTime() >= t.getTime();
  }
  function fromLabel(x) {
    if (!x.t.from) return '';
    const [y, m] = x.t.from;
    const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return (m ? MON[m - 1] + ' ' : '') + (typeof Eras !== 'undefined' ? Eras.yearLabel(y) : y);
  }
  function rate(tag) {
    const c = G().countries[tag], e = c.eco || {};
    const shops = e.shops || c.civ || 0;
    const health = e.health === undefined ? 1 : e.health;
    const luxBoost = e.need && e.prod && (e.prod.luxuries + e.imp.luxuries - e.exp.luxuries) > e.need.luxuries * 1.3 ? 0.05 : 0;
    const know = typeof Economy !== 'undefined' ? Economy.tradeKnowledge(tag) : 0;
    return (0.4 + 0.25 * Math.sqrt(shops)) * (0.6 + 0.6 * c.stab) * (0.6 + 0.4 * health) * (1 + know + luxBoost + mod(tag, 'research'));
  }
  function start(tag, id, slot) {
    const c = G().countries[tag], x = info(id);
    if (!x) return { ok: false, why: 'Unknown technology' };
    const st = state(tag, id);
    if (st !== 'open') return { ok: false, why: st === 'done' ? 'Already researched' : st === 'active' ? 'Already being researched' : st === 'closed' ? 'You chose the other path' : 'Research the tier before it first' };
    let i = slot !== undefined ? slot : c.rs.slots.findIndex(s => !s);
    if (i < 0) return { ok: false, why: 'Both research slots are busy' };
    if (c.rs.slots[i]) stop(tag, i);
    c.rs.slots[i] = { id, pts: c.rs.saved[id] || 0 };
    delete c.rs.saved[id];
    return { ok: true };
  }
  function stop(tag, i) {
    const c = G().countries[tag], s = c.rs.slots[i];
    if (!s) return;
    c.rs.saved[s.id] = s.pts;   // progress is kept for later
    c.rs.slots[i] = null;
  }
  function complete(c, id) {
    const g = G(), x = info(id);
    c.techs.push(id);
    invalidate(c.tag);
    if (x.alt) delete c.rs.saved[x.alt];
    if (Sim.isHuman(c.tag)) Sim.tell(c.tag, 'Research complete: ' + x.t.name + '.', -1, 'win', false);
    else if (x.tier >= 3 && (x.kind === 'nat' || (x.t.fx || []).some(e => e.mod === 'unlock')) && (c.civ + c.mil >= 15)) Sim.notify(c.name + ' has developed ' + x.t.name + '.', -1, 'info', false);
  }
  function daily() {
    const g = G();
    buildIndex();
    const day = Math.floor(g.hour / DAY);
    for (const c of Object.values(g.countries)) {
      if (!c.alive || !c.rs || (c.eco && c.eco.none)) continue;
      const r = rate(c.tag);
      c.rs.rate = r;
      for (let i = 0; i < c.rs.slots.length; i++) {
        const s = c.rs.slots[i];
        if (!s) continue;
        const x = info(s.id);
        if (!x) { c.rs.slots[i] = null; continue; }
        s.pts = Math.min(x.cost, s.pts + r);
        if (s.pts >= x.cost && dateReady(x)) { c.rs.slots[i] = null; complete(c, s.id); }
      }
      if (!Sim.isHuman(c.tag) && (day + c.tag.charCodeAt(1)) % 5 === 0) aiPick(c);
    }
  }
  function openTechs(tag) {
    buildIndex();
    const out = [];
    for (const b of branchesFor(tag)) for (const tier of b.tiers) for (const t of (Array.isArray(tier) ? tier : [tier])) if (state(tag, t.id) === 'open') out.push({ id: t.id, branch: b.id, x: info(t.id) });
    return out;
  }
  function aiPick(c) {
    const free = c.rs.slots.findIndex(s => !s);
    if (free < 0) return;
    const opts = openTechs(c.tag).filter(o => dateReady(o.x) || o.x.tier < 3 || Sim.rng() < 0.3);
    if (!opts.length) return;
    const war = Sim.isAtWar(c.tag) || (typeof Diplo !== 'undefined' && Diplo.threatOf(c.tag));
    const e = c.eco || {};
    const short = typeof Economy !== 'undefined' && Economy.anyShort(c.tag);
    const W = { mil: war ? 3 : 1, ind: (e.health !== undefined && e.health < 0.9) || short ? 2.5 : 1.2, trade: short || (e.gold !== undefined && e.gold < 0) ? 2 : 1, state: c.stab < 0.45 ? 2 : 1 };
    let best = null, bw = -1;
    for (const o of opts) {
      const w = (W[o.branch] || 1.4) * (1 + Sim.rng()) / (1 + o.x.tier * 0.3);
      if (w > bw) { bw = w; best = o; }
    }
    if (best) start(c.tag, best.id, free);
  }
  return { setup, daily, mod, modFast, unlocked, registerUnlocks, branchesFor, ownBranch, state, info, start, stop, rate, fromLabel, dateReady, unitClass, invalidate, TIER_COST, SLOTS };
})();
