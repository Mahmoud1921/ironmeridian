// Economy: six goods, industries in provinces, stockpiles, gold, construction, trade deals,
// dependence, supply shocks and embargoes. Arms are the old "equipment" number (c.equipment).
// Everything lives in G (G.ind, G.eco, c.eco, G.dip.trade, G.dip.embargo) so a save is plain data.
'use strict';
const Economy = (function () {
  const G = () => Sim.G, MAP = () => Sim.MAP;
  const DAY = 24, YEAR = 24 * 365;
  const GOODS = ['food', 'metal', 'fuel', 'strategic', 'luxuries'];
  const BASE_PRICE = { food: 1, metal: 2, fuel: 2, strategic: 4, luxuries: 1 };
  const STOCK_DAYS = 90, START_DAYS = 60;
  const FOOD_PER_DIV = 0.25, STRAT_PER_DIV = 0.25;
  const foodPerM = () => E().foodPerM || 0.5, luxPerM = () => foodPerM() / 2;
  // industries: what they make, what they cost to build (construction points and gold)
  const KINDS = {
    farm:    { good: 'food',      cp: 120, gold: 40 },
    mine:    { good: 'metal',     cp: 150, gold: 60 },
    fuel:    { good: 'fuel',      cp: 150, gold: 60 },
    strat:   { good: 'strategic', cp: 200, gold: 80 },
    shop:    { good: 'luxuries',  cp: 240, gold: 100 },
    arsenal: { good: 'arms',      cp: 300, gold: 120 }
  };
  const KIND_KEYS = Object.keys(KINDS);
  // military works: ports, dockyards, airbases, supply hubs, forts and radar. They use no industry slot.
  const INFRA = {
    port:  { cp: 150, gold: 60, max: 3, coast: true },
    dock:  { cp: 260, gold: 110, max: 5, coast: true },
    air:   { cp: 150, gold: 60, max: 3, needs: 'air' },
    hub:   { cp: 220, gold: 90, max: 1 },
    fort:  { cp: 180, gold: 70, max: 3 },
    radar: { cp: 160, gold: 90, max: 1, needs: 'radar' }
  };
  const INFRA_KEYS = Object.keys(INFRA);
  const INFRA_NAMES = {
    'ww2-1936': { port: 'Port', dock: 'Naval dockyard', air: 'Airbase', hub: 'Supply hub', fort: 'Fort', radar: 'Radar station' },
    'modern-2026': { port: 'Port', dock: 'Naval shipyard', air: 'Air base', hub: 'Logistics hub', fort: 'Defensive line', radar: 'Air-defence radar' },
    'greatwar-1917': { port: 'Harbour', dock: 'Naval dockyard', air: 'Airfield', hub: 'Railhead depot', fort: 'Trench line' },
    'napoleonic-1805': { port: 'Harbour', dock: 'Naval yard', hub: 'Supply depot', fort: 'Fortress' },
    'medieval-1200': { port: 'Harbour', dock: 'Shipyard', hub: 'Supply depot', fort: 'Castle' },
    'rome-117': { port: 'Harbour', dock: 'Navalia', hub: 'Supply depot', fort: 'Fort' },
    'greece-431bc': { port: 'Harbour', dock: 'Shipsheds', hub: 'Supply depot', fort: 'Walls' }
  };
  const isInfra = k => !!INFRA[k];
  function infraKinds() { const n = INFRA_NAMES[eraId()] || INFRA_NAMES['ww2-1936']; return INFRA_KEYS.filter(k => n[k]); }
  function infra(pid, k) { const I = G().inf && G().inf[pid]; return (I && I[k]) || 0; }
  function setInfra(pid, k, v) { const g = G(); if (!g.inf) g.inf = MAP().provs.map(() => null); if (!g.inf[pid]) g.inf[pid] = {}; g.inf[pid][k] = v; }
  const MOD_OF = { farm: 'farms', mine: 'mines', fuel: 'fuelworks', strat: 'stratworks', shop: 'workshops', arsenal: 'arsenals' };
  const FARM_TERRAIN = { plains: 1.5, forest: 0.8, hills: 0.9, mountains: 0.5, desert: 0.5, jungle: 0.7, marsh: 0.7, tundra: 0.3, urban: 0.8 };

  // Names change with the era; the rules don't.
  const ERA_ECO = {
    'greece-431bc': { foodPerM: 1.5, taxK: 0.5, coin: 'talents', year: -430, arsenalStrat: 0.5, forestFuel: true,
      goods: { food: 'Grain', metal: 'Copper and iron', fuel: 'Timber', strategic: 'Tin', luxuries: 'Silver and wine', arms: 'Bronze arms' },
      kinds: { farm: 'Estate', mine: 'Mine', fuel: 'Charcoal burners', strat: 'Tin mine', shop: 'Potters', arsenal: 'Smithy' } },
    'rome-117': { foodPerM: 1.5, taxK: 0.45, coin: 'denarii', year: 117, forestFuel: true, stratUnits: 'mounted',
      goods: { food: 'Grain and wine', metal: 'Iron', fuel: 'Timber', strategic: 'Horses', luxuries: 'Silk and spices', arms: 'Arms and armour' },
      kinds: { farm: 'Latifundium', mine: 'Mine', fuel: 'Charcoal burners', strat: 'Stud farm', shop: 'Glassworks', arsenal: 'Fabrica' } },
    'medieval-1200': { foodPerM: 1.5, taxK: 0.4, coin: 'bezants', year: 1200, forestFuel: true, stratUnits: 'mounted',
      goods: { food: 'Grain and livestock', metal: 'Iron', fuel: 'Timber', strategic: 'Horses', luxuries: 'Silk and cloth', arms: 'Arms and armour' },
      kinds: { farm: 'Manor', mine: 'Mine', fuel: 'Charcoal burners', strat: 'Stud farm', shop: 'Guild hall', arsenal: 'Armoury' } },
    'napoleonic-1805': { foodPerM: 1.0, taxK: 0.3, coin: 'ducats', year: 1805, arsenalStrat: 0.25, stratUnits: 'guns',
      goods: { food: 'Grain', metal: 'Iron', fuel: 'Coal and timber', strategic: 'Saltpetre', luxuries: 'Sugar, tea and textiles', arms: 'Muskets and cannon' },
      kinds: { farm: 'Farm', mine: 'Mine', fuel: 'Coal pit', strat: 'Saltpetre works', shop: 'Manufactory', arsenal: 'Arsenal' } },
    'greatwar-1917': { foodPerM: 0.6, taxK: 0.2, coin: 'marks', year: 1917, arsenalStrat: 0.25, stratUnits: 'guns',
      goods: { food: 'Grain and meat', metal: 'Steel', fuel: 'Coal', strategic: 'Nitrates', luxuries: 'Consumer goods', arms: 'Rifles and shells' },
      kinds: { farm: 'Farm', mine: 'Mine', fuel: 'Coal pit', strat: 'Nitrate works', shop: 'Factory', arsenal: 'Munitions works' } },
    'ww2-1936': { foodPerM: 0.5, taxK: 0.15, coin: 'dollars', year: 1936, stratUnits: 'motor', oilFuel: true,
      goods: { food: 'Food', metal: 'Steel', fuel: 'Oil', strategic: 'Rubber', luxuries: 'Consumer goods', arms: 'Equipment' },
      kinds: { farm: 'Farm', mine: 'Mine', fuel: 'Oil wells', strat: 'Rubber plantation', shop: 'Civilian factory', arsenal: 'Military factory' } },
    // 2026: microchips are the strategic good. Every modern weapon and most units need them, and the
    // defence plants that build arms eat them too, so a nation cut off from chips cannot fight for long.
    'modern-2026': { foodPerM: 0.3, taxK: 0.1, coin: 'dollars', year: 2026, stratUnits: 'chips', arsenalStrat: 0.5, oilFuel: true,
      goods: { food: 'Food', metal: 'Metals and rare earths', fuel: 'Oil and gas', strategic: 'Microchips', luxuries: 'Consumer goods', arms: 'Weapons systems' },
      kinds: { farm: 'Agribusiness', mine: 'Mine', fuel: 'Oil and gas field', strat: 'Chip fab', shop: 'Tech industry', arsenal: 'Defence plant' } }
  };
  // how self-sufficient in food a nation starts in 1936 (1 = exactly fed); other eras follow the land
  const FOOD_1936 = { ENG: 0.55, BEL: 0.6, SWI: 0.6, NOR: 0.7, GER: 0.85, JAP: 0.8, ITA: 0.9, GRE: 0.8, HOL: 1.4, DEN: 1.5, USA: 1.3, CAN: 1.6, ARG: 2.0, URU: 1.6, AST: 1.6, NZL: 1.8,
    ROM: 1.4, HUN: 1.4, YUG: 1.2, BUL: 1.2, SOV: 1.15, POL: 1.1, BRA: 1.2, SIA: 1.3, RAJ: 1.0, CHI: 0.95, EGY: 1.0, FRA: 1.0, SPA: 0.95 };

  const eraId = () => (typeof Eras !== 'undefined' && Eras.info()) ? Eras.info().id : 'ww2-1936';
  const E = () => ERA_ECO[eraId()] || ERA_ECO['ww2-1936'];
  const goodName = g => g === 'gold' ? 'Gold' : (E().goods[g] || g);
  const kindName = k => INFRA[k] ? ((INFRA_NAMES[eraId()] || INFRA_NAMES['ww2-1936'])[k] || k) : (E().kinds[k] || k);
  const coin = () => E().coin;
  // eras where motor vehicles and aircraft run on oil, and slow down without it
  const oilEra = () => !!E().oilFuel;
  const mod = (tag, name, ctx) => typeof Tech !== 'undefined' ? Tech.mod(tag, name, ctx) : 0;

  // ---------- static map facts: coasts and deposits ----------
  let depo = [], depoEra = null, coastMap = null;
  function coastal(p) {
    if (coastMap !== MAP()) {
      coastMap = MAP();
      const M = MAP();
      for (const q of M.provs) {
        let c = false;
        const poly = q.poly || [];
        for (let i = 0; i < poly.length && !c; i++) {
          const v = poly[i], w = poly[(i + 1) % poly.length];
          for (const t of [0, 0.5]) { if (M.landmassAt(v.x + (w.x - v.x) * t, v.y + (w.y - v.y) * t) !== q.lm) { c = true; break; } }
        }
        q.coastal = c;
      }
    }
    return p.coastal;
  }
  function nearestProv(lon, lat, maxKm) {
    let best = null, bd = maxKm || 450;
    for (const p of MAP().provs) { const d = GEO.haversineKm(lon, lat, p.lon, p.lat); if (d < bd) { bd = d; best = p; } }
    return best;
  }
  function buildDeposits() {
    const id = eraId(), e = E(), M = MAP();
    if (depoEra === id && depo.length === M.provs.length) return;
    depoEra = id;
    depo = M.provs.map(() => ({}));
    const add = (i, g, n) => { depo[i][g] = (depo[i][g] || 0) + n; };
    for (const p of M.provs) {
      const r = p.res || {}, d = p.id;
      if (r.steel) add(d, 'metal', r.steel);
      if (id === 'ww2-1936' || id === 'modern-2026') {
        if (r.aluminium) add(d, 'metal', r.aluminium);
        if (r.rare) add(d, 'metal', r.rare);
        if (r.oil) add(d, 'fuel', r.oil);
        if (r.rubber && id === 'ww2-1936') add(d, 'strategic', r.rubber);
      }
      if (r.coal) add(d, 'fuel', r.coal);
      if (e.forestFuel && p.terrain === 'forest') add(d, 'fuel', 2);
    }
    const list = (typeof ERA_DEPOSITS !== 'undefined' && ERA_DEPOSITS[id]) || [];
    for (const [g, lon, lat, size] of list) { const p = nearestProv(lon, lat); if (p && GOODS.includes(g)) add(p.id, g, size); }
  }
  const dep = (pid, g) => (depo[pid] && depo[pid][g]) || 0;
  function slots(p) { return Math.min(12, 2 + (p.infra || 1) + (p.city ? 1 : 0) + (p.capital ? 2 : 0)); }
  function built(pid) { const I = G().ind[pid]; return I ? KIND_KEYS.reduce((s, k) => s + (I[k] || 0), 0) : 0; }
  function freeSlots(pid) { return Math.max(0, slots(MAP().provs[pid]) - built(pid)); }
  function ind(pid) { const g = G(); return g.ind[pid] || (g.ind[pid] = {}); }

  // output of one industry of a kind in a province, before shortages and modifiers
  function baseOut(kind, p) {
    switch (kind) {
      case 'farm': return 4 * FARM_TERRAIN[p.terrain] * (dep(p.id, 'food') ? 2 : 1);
      case 'mine': return dep(p.id, 'metal') ? 3 : 1;
      case 'fuel': return dep(p.id, 'fuel') ? 3 : 1;
      case 'strat': { const d = dep(p.id, 'strategic'); return d ? 2 * (1 + Math.min(d, 30) / 15) : 0; }
      case 'shop': return 2 * (dep(p.id, 'luxuries') ? 1.5 : 1);
      case 'arsenal': return 12;
    }
    return 0;
  }
  function canHost(kind, p, tag) {
    if (kind === 'strat') return dep(p.id, 'strategic') > 0 || mod(tag, 'synthetic', { good: 'strategic' }) > 0;
    if (kind === 'farm') return FARM_TERRAIN[p.terrain] >= 0.3;
    return true;
  }
  // province output multiplier for the owner: technology and occupation
  function provMul(kind, p, tag) {
    const ctx = { prov: p.id, terrain: p.terrain };
    let m = 1 + mod(tag, MOD_OF[kind], ctx) + mod(tag, 'industry', ctx);
    if (kind === 'strat') m += mod(tag, 'strategic', ctx);
    if (kind === 'shop') m += mod(tag, 'luxuries', ctx);
    if (typeof Air !== 'undefined') m *= 1 - Air.bombDamage(p.id);
    if (typeof Routes !== 'undefined' && G().owner[p.id] === tag) m *= Routes.outMul(p.id);
    if (p.core !== tag) {
      const coreAlive = G().countries[p.core] && G().countries[p.core].alive;
      m *= coreAlive ? Math.min(1, 0.5 + mod(tag, 'occupied')) : 0.85;
    }
    return Math.max(0, m);
  }

  // ---------- setup at game start ----------
  function popOf(d) { return d.pop || 1; }
  // after loading a save: rebuild what is derived from the map and era, not stored in the game
  function restore() { const M = MAP(); buildDeposits(); M.provs.forEach(p => coastal(p)); avgT = null; }
  function setup() {
    const g = G(), M = MAP();
    buildDeposits();
    M.provs.forEach(p => coastal(p));
    g.ind = M.provs.map(() => null);
    seedInfra();
    g.eco = { nextDeal: 1, spike: {}, price: Object.assign({}, BASE_PRICE), era: eraId() };
    g.dip.trade = []; g.dip.embargo = [];
    for (const p of M.provs) {
      if (p.civ) ind(p.id).shop = p.civ;
      if (p.mil) ind(p.id).arsenal = p.mil;
    }
    const byOwner = {};
    M.provs.forEach(p => { (byOwner[g.owner[p.id]] = byOwner[g.owner[p.id]] || []).push(p); });
    const base = eraId() === 'ww2-1936';
    for (const d of COUNTRY_DEFS) {
      const c = g.countries[d.tag];
      const list = byOwner[d.tag] || [];
      if (!c || d.unclaimed) { if (c) { c.eco = blankEco(0); c.eco.none = true; } continue; }
      const divs = G().armies.filter(a => a.owner === d.tag).reduce((s, a) => s + a.units.length, 0);
      const foodNeed = popOf(d) * foodPerM() + divs * FOOD_PER_DIV;
      // food: how much the land can grow decides whether a nation starts short or with a surplus
      const land = list.reduce((s, p) => s + FARM_TERRAIN[p.terrain] * (p.home ? 1 : 0.4) * (dep(p.id, 'food') ? 2 : 1), 0);
      const ratio = base && FOOD_1936[d.tag] ? FOOD_1936[d.tag] : Math.max(0.6, Math.min(1.6, land * 2.2 / Math.max(1, foodNeed)));
      place('farm', list, foodNeed * ratio, d.tag);
      // metal, fuel and the strategic good follow the deposits the nation owns
      let arsenals = list.reduce((s, p) => s + ((g.ind[p.id] && g.ind[p.id].arsenal) || 0), 0);
      for (const [kind, good, per] of [['mine', 'metal', 10], ['fuel', 'fuel', 10], ['strat', 'strategic', 8]]) {
        for (const p of list) {
          const size = dep(p.id, good);
          if (size < (good === 'strategic' ? 1 : 4)) continue;
          const n = Math.min(freeSlots(p.id), Math.ceil(size / per), 3);
          if (n > 0) ind(p.id)[kind] = (ind(p.id)[kind] || 0) + n;
        }
      }
      // every nation with arsenals digs and burns a little of its own, so it isn't wholly dependent
      const have = good => list.reduce((s, p) => s + ((g.ind[p.id] && g.ind[p.id][good === 'metal' ? 'mine' : 'fuel']) || 0) * baseOut(good === 'metal' ? 'mine' : 'fuel', p), 0);
      if (have('metal') < arsenals * 0.35) place('mine', list, arsenals * 0.35 - have('metal'), d.tag);
      if (have('fuel') < arsenals * 0.35) place('fuel', list, arsenals * 0.35 - have('fuel'), d.tag);
      c.eco = blankEco(Math.round(150 + popOf(d) * 4));
    }
    // opening trade: nations short of something already buy it from neighbours with a surplus
    daily(true);
    seedDeals();
    daily(true);
    // opening stockpiles: two months of what each nation needs
    for (const c of Object.values(g.countries)) {
      if (!c.eco || !c.eco.need) continue;
      for (const k of GOODS) c.eco.stock[k] = Math.round(c.eco.need[k] * START_DAYS);
    }
  }
  // opening harbours on every coastal city, bigger at capitals; forts where history built them
  function seedInfra() {
    const g = G(), M = MAP(), id = eraId();
    g.inf = M.provs.map(() => null);
    const coast = pid => typeof Seas !== 'undefined' ? Seas.isCoastal(pid) : coastal(M.provs[pid]);
    for (const p of M.provs) {
      const d = COUNTRY_BY_TAG[g.owner[p.id]];
      if (!d || d.unclaimed) continue;
      if (p.city && coast(p.id)) setInfra(p.id, 'port', p.capital ? 2 : 1);
      if (p.capital && id !== 'ww2-1936' && id !== 'greatwar-1917' && id !== 'modern-2026') setInfra(p.id, 'fort', id === 'napoleonic-1805' ? 1 : 2);
    }
    // nations with a coast but no coastal city still get one harbour
    const hasPort = new Set();
    for (const p of M.provs) if (infra(p.id, 'port')) hasPort.add(g.owner[p.id]);
    for (const p of M.provs.slice().sort((a, b) => b.pop - a.pop)) {
      const o = g.owner[p.id], d = COUNTRY_BY_TAG[o];
      if (!d || d.unclaimed || hasPort.has(o) || !coast(p.id)) continue;
      setInfra(p.id, 'port', 1); hasPort.add(o);
    }
    const wall = (tag, vs, lvl) => { for (const p of M.provs) if (g.owner[p.id] === tag && p.home && p.nb.some(n => g.owner[n] === vs)) setInfra(p.id, 'fort', lvl); };
    if (id === 'ww2-1936') { wall('FRA', 'GER', 3); wall('CZE', 'GER', 2); wall('GER', 'FRA', 1); wall('FIN', 'SOV', 2); wall('BEL', 'GER', 1); }
    // a front: every province one side holds next to the other's, home soil or occupied, is dug in
    const front = (a, b, lvl) => { wall(a, b, lvl); for (const p of M.provs) if (g.owner[p.id] === a && p.nb.some(n => g.owner[n] === b)) setInfra(p.id, 'fort', Math.max(infra(p.id, 'fort'), lvl)); };
    if (id === 'greatwar-1917') {
      // the Western Front after two and a half years of digging, the Hindenburg Line behind it
      front('GER', 'FRA', 3); front('FRA', 'GER', 3); front('GER', 'BEL', 3); front('BEL', 'GER', 3);
      front('GER', 'RUS', 1); front('RUS', 'GER', 1); front('AUH', 'RUS', 1); front('RUS', 'AUH', 1);
      front('AUH', 'ITA', 2); front('ITA', 'AUH', 2); front('BUL', 'SRB', 2); front('SRB', 'BUL', 2); front('GER', 'ROM', 1); front('ROM', 'GER', 1);
    }
    if (id === 'modern-2026') {
      front('RUS', 'UKR', 3); front('UKR', 'RUS', 3);
      wall('KOR', 'PRK', 3); wall('PRK', 'KOR', 3); wall('IND', 'PAK', 1); wall('PAK', 'IND', 1); wall('ISR', 'LBN', 1); wall('ISR', 'SYR', 1);
    }
  }
  function seedDeals() {
    const g = G();
    const live = Object.values(g.countries).filter(c => c.alive && c.eco && !c.eco.none && c.eco.need);
    const bal = {};
    for (const c of live) bal[c.tag] = Object.fromEntries(GOODS.map(k => [k, c.eco.prod[k] - c.eco.need[k]]));
    const want = [];
    for (const c of live) for (const k of GOODS) if (bal[c.tag][k] < -0.5) want.push({ t: c.tag, k, gap: -bal[c.tag][k] / Math.max(1, c.eco.need[k]) });
    want.sort((a, b) => b.gap - a.gap);
    for (const w of want) {
      let need = -bal[w.t][w.k];
      const sellers = live.filter(o => o.tag !== w.t && bal[o.tag][w.k] > 0.5 && canDeal(w.t, o.tag, null).ok && !Sim.atWar(w.t, o.tag))
        .sort((a, b) => (Diplo.borders(w.t, b.tag) - Diplo.borders(w.t, a.tag)) || (bal[b.tag][w.k] - bal[a.tag][w.k]));
      for (const o of sellers) {
        if (need < 0.5 || dealsOf(w.t).length >= tradeSlots(w.t)) break;
        if (dealsOf(o.tag).length >= tradeSlots(o.tag)) continue;
        const amt = +Math.min(need, bal[o.tag][w.k] * 0.8).toFixed(1);
        if (amt < 0.5) continue;
        sign(o.tag, w.t, { good: w.k, amount: amt, price: fairPrice(w.k, amt), sell: true });
        bal[o.tag][w.k] -= amt; bal[w.t][w.k] += amt; need -= amt;
      }
    }
  }
  function blankEco(gold) {
    const z = () => Object.fromEntries(GOODS.map(k => [k, 0]));
    return { gold, stock: z(), sat: Object.fromEntries(GOODS.map(k => [k, 1])), health: 1, prod: z(), need: z(), imp: z(), exp: z(), sold: z(),
      income: {}, goldDelta: 0, arms: 0, cp: 0, queue: [], shocks: [], debtDays: 0, stabAdj: 0, trust: 0 };
  }
  // put `kind` industries into the best provinces of a list until they make `amount` a day
  function place(kind, list, amount, tag) {
    let made = 0, guard = 0;
    while (made < amount && guard++ < 400) {
      let best = null, bs = 0;
      for (const p of list) {
        if (!freeSlots(p.id) || !canHost(kind, p, tag)) continue;
        const out = baseOut(kind, p), have = (G().ind[p.id] && G().ind[p.id][kind]) || 0;
        const s = out * (p.home ? 1 : 0.8) / (1 + have * 0.35);
        if (s > bs) { bs = s; best = p; }
      }
      if (!best) break;
      ind(best.id)[kind] = (ind(best.id)[kind] || 0) + 1;
      made += baseOut(kind, best);
    }
  }

  // ---------- prices ----------
  function worldPrice(good) {
    const g = G();
    let p = (g.eco.price && g.eco.price[good]) || BASE_PRICE[good];
    if (g.eco.spike[good] > g.hour) p *= 1.2;
    return p;
  }
  function updatePrices(totProd, totNeed) {
    const g = G();
    for (const k of GOODS) {
      const r = totNeed[k] / Math.max(1, totProd[k]);
      const target = BASE_PRICE[k] * Math.max(0.5, Math.min(2, Math.pow(r, 0.7)));
      g.eco.price[k] = +(g.eco.price[k] + (target - g.eco.price[k]) * 0.1).toFixed(3);
    }
  }

  // ---------- the daily economy step ----------
  function stratUnit(type) {
    const u = UNIT_TYPES[type]; if (!u) return false;
    const rule = E().stratUnits;
    if (rule === 'mounted') return (u.symbol === 'rec' || u.symbol === 'arm') && u.look !== 'elephant';
    if (rule === 'guns') return u.symbol === 'art' && u.look !== 'archer' && u.look !== 'crossbow';
    if (rule === 'chips') return !!u.chips;
    if (rule === 'motor') return ['motorized', 'mechanized', 'tanks', 'recon'].includes(type) || u.symbol === 'mot' || u.symbol === 'mec';
    return false;
  }
  function daily(setupOnly) {
    const g = G(), M = MAP(), cs = g.countries;
    const acc = {};
    const A = tag => acc[tag] || (acc[tag] = { prod: { food: 0, metal: 0, fuel: 0, strategic: 0, luxuries: 0 }, arsenals: 0, shops: 0, pop: 0, coastCities: 0 });
    for (const p of M.provs) {
      const owner = g.owner[p.id], c = cs[owner];
      if (!c || !c.alive) continue;
      const a = A(owner);
      a.pop += (p.pop || 0) * (p.core === owner ? 1 : 0.5);
      if (p.city && coastal(p)) a.coastCities++;
      const I = g.ind[p.id];
      if (!I) continue;
      for (const k of KIND_KEYS) {
        const n = I[k]; if (!n) continue;
        const out = n * baseOut(k, p) * provMul(k, p, owner);
        if (k === 'arsenal') a.arsenals += out / 12;
        else a.prod[KINDS[k].good] += out;
        if (k === 'shop') a.shops += n;
      }
    }
    const divsOf = {}, stratDivs = {}, upk = {};
    for (const ar of g.armies) for (const u of ar.units) { divsOf[ar.owner] = (divsOf[ar.owner] || 0) + 1; upk[ar.owner] = (upk[ar.owner] || 0) + 0.1 + (UNIT_TYPES[u.type] ? UNIT_TYPES[u.type].eq : 100) / 500; if (stratUnit(u.type)) stratDivs[ar.owner] = (stratDivs[ar.owner] || 0) + 1; }
    for (const c of Object.values(cs)) if (c.alive) for (const q of c.queue) if (stratUnit(q.type)) stratDivs[c.tag] = (stratDivs[c.tag] || 0) + 1;
    for (const c of Object.values(cs)) if (c.alive) upk[c.tag] = (upk[c.tag] || 0) + (typeof Navy !== 'undefined' && g.fleets ? Navy.upkeep(c.tag) : 0) + (typeof Air !== 'undefined' && g.wings ? Air.upkeep(c.tag) : 0);
    const aStrat = E().arsenalStrat || 0;
    // needs
    const totProd = { food: 0, metal: 0, fuel: 0, strategic: 0, luxuries: 0 }, totNeed = Object.assign({}, totProd);
    for (const c of Object.values(cs)) {
      if (!c.alive || !c.eco || c.eco.none) continue;
      const a = A(c.tag), e = c.eco, t = c.tag;
      const popM = a.pop / 1e6;
      e.popM = popM; e.arsenals = a.arsenals; e.shops = a.shops; e.coastCities = a.coastCities;
      e.prod = a.prod;
      e.need = {
        food: (popM * foodPerM() + (divsOf[t] || 0) * FOOD_PER_DIV) * Math.max(0.3, 1 + mod(t, 'foodNeed')),
        metal: a.arsenals * Math.max(0.2, 1 + mod(t, 'arsenalInputs', { good: 'metal' })),
        fuel: a.arsenals * Math.max(0.2, 1 + mod(t, 'arsenalInputs', { good: 'fuel' })),
        strategic: a.arsenals * aStrat * Math.max(0.2, 1 + mod(t, 'arsenalInputs', { good: 'strategic' })) + (stratDivs[t] || 0) * STRAT_PER_DIV,
        luxuries: popM * luxPerM()
      };
      e.imp = { food: 0, metal: 0, fuel: 0, strategic: 0, luxuries: 0 }; e.exp = Object.assign({}, e.imp); e.sold = Object.assign({}, e.imp);
      e.dealIn = 0; e.dealOut = 0; e.bonus = 0;
      for (const k of GOODS) { totProd[k] += a.prod[k]; totNeed[k] += e.need[k]; }
    }
    // trade deals deliver what the seller has
    for (const d of g.dip.trade) {
      const s = cs[d.from], b = cs[d.to];
      if (!s || !b || !s.alive || !b.alive || !s.eco || !b.eco) continue;
      const avail = s.eco.prod[d.good] + s.eco.stock[d.good] + s.eco.imp[d.good] - s.eco.exp[d.good];
      const q = Math.max(0, Math.min(d.amount, avail));
      // goods shipped by sea can be sunk on the way; the buyer pays only for what arrives
      const arrive = !setupOnly && typeof Navy !== 'undefined' && g.fleets ? q * Navy.convoyFactor(d) : q;
      // a road or railway to the partner delivers more for the same price
      const boost = typeof Routes !== 'undefined' && g.routes ? 1 + Routes.tradeBoost(d.from, d.to) : 1;
      if (!setupOnly && typeof Navy !== 'undefined' && g.fleets) Navy.recordConvoy(d, q, arrive);
      d.delivered = arrive;
      s.eco.exp[d.good] += q; b.eco.imp[d.good] += arrive * boost;
      const paid = d.price * (arrive / d.amount);
      b.eco.dealOut += paid; s.eco.dealIn += paid;
      const bonus = paid * tradeBonusRate(d.from);
      const bonusB = paid * tradeBonusRate(d.to);
      s.eco.bonus += bonus; b.eco.bonus += bonusB;
    }
    // stockpiles, shortages and effects
    const offered = { food: 0, metal: 0, fuel: 0, strategic: 0, luxuries: 0 };
    const live = Object.values(cs).filter(c => c.alive && c.eco && !c.eco.none);
    for (const c of live) {
      const e = c.eco, t = c.tag;
      const cap = STOCK_DAYS + mod(t, 'stockDays');
      for (const k of GOODS) {
        const supply = e.prod[k] + e.imp[k] - e.exp[k], need = e.need[k];
        if (supply >= need) {
          e.stock[k] += supply - need;
          const max = Math.max(20, need * cap);
          if (e.stock[k] > max) {
            // what nobody buys is offered on the world market
            e.sold[k] = e.stock[k] - max; e.stock[k] = max;
            offered[k] += e.sold[k];
          }
          e.sat[k] = 1;
        } else {
          const take = Math.min(e.stock[k], need - supply);
          e.stock[k] -= take;
          e.sat[k] = need > 0 ? Math.max(0, Math.min(1, (supply + take) / need)) : 1;
        }
      }
      e.health = (e.sat.food + e.sat.metal + e.sat.fuel) / 3;
    }
    if (setupOnly) return;
    // the world market takes only so much (a fifth of the world's need) and pays half the world price
    const take = {};
    for (const k of GOODS) take[k] = offered[k] > 0 ? Math.min(1, totNeed[k] * 0.2 / offered[k]) : 1;
    for (const c of live) {
      const e = c.eco, t = c.tag;
      let sales = 0;
      for (const k of GOODS) if (e.sold[k]) { e.sold[k] *= take[k]; sales += e.sold[k] * worldPrice(k) * Math.min(1, 0.5 + mod(t, 'worldMarket')) * (1 + mod(t, 'sellPrice', { good: k })); }
      // arms from arsenals, slowed by missing metal, fuel and (in some eras) the strategic good
      const inputs = Math.min(e.sat.metal, e.sat.fuel, aStrat ? e.sat.strategic : 1);
      e.arms = e.arsenals * 12 * (0.7 + 0.5 * c.stab) * inputs;
      c.equipment += e.arms;
      c.mil = Math.round(e.arsenals); c.civ = e.shops;
      // construction
      e.cp = (2 + e.shops) * (1 + mod(t, 'construction')) * (0.4 + 0.6 * Math.min(e.sat.metal, e.sat.fuel)) * (e.gold < 0 ? 0.5 : 1);
      stepQueue(c);
      // gold
      const war = Sim.isAtWar(t);
      // taxes grow with development: a rich industrial nation taxes more per head than a peasant one
      const dev = Math.min(1.3, (c.tech || 1) / avgTech());
      const tax = (e.popM * (E().taxK || 0.15) * dev * dev + e.shops * 0.4) * (0.5 + c.stab) * (0.6 + 0.4 * e.health) * (1 + mod(t, 'tax') + mod(t, 'gold'));
      const upkeep = (upk[t] || 0) * Math.max(0.3, 1 + mod(t, 'upkeep'));
      const fac = Sim.factionOf(t);
      const facGold = fac ? mod(t, 'factionGold') * (fac.members.length - 1) : 0;
      const flat = mod(t, 'goldPerDay');
      e.income = { tax, trade: e.dealIn, bonus: e.bonus, market: sales, other: facGold + flat, upkeep: -upkeep, imports: -e.dealOut };
      e.goldDelta = tax + e.dealIn + e.bonus + sales + facGold + flat - upkeep - e.dealOut;
      e.gold += e.goldDelta;
      e.debtDays = e.gold < 0 ? e.debtDays + 1 : 0;
      // effects on stability: hunger, luxuries, debt and supply shocks
      e.shocks = e.shocks.filter(s => s.until > g.hour);
      const lux = e.prod.luxuries + e.imp.luxuries - e.exp.luxuries;
      e.stabAdj = -(1 - e.sat.food) * 0.25 - (1 - e.sat.luxuries) * 0.08 + (lux > e.need.luxuries * 1.3 ? 0.03 : 0)
        - (e.gold < 0 ? 0.05 : 0) - e.shocks.reduce((s, x) => s + x.stab, 0) + mod(t, 'stability');
      if (e.sat.food < 0.5) c.stab = Math.max(0, c.stab - 0.002 * (0.5 - e.sat.food) * 2);   // famine
      if (e.gold < 0) c.stab = Math.max(0, c.stab - 0.0005);
      // units that need the strategic good waste away without it
      if (e.sat.strategic < 0.6) for (const ar of g.armies) if (ar.owner === t) for (const u of ar.units) if (stratUnit(u.type)) u.str = Math.max(0.2, u.str - 0.003 * (0.6 - e.sat.strategic));
      if (war) e.warDays = (e.warDays || 0) + 1;
    }
    {
      updatePrices(totProd, totNeed);
      // a buyer that can't pay loses the deal after a month in debt
      for (const d of g.dip.trade.slice()) {
        const b = cs[d.to];
        if (b && b.eco && b.eco.debtDays > 30 && !Sim.isHuman(d.from)) cancel(d.id, d.from, 'unpaid');
      }
    }
  }
  let avgT = null, avgTEra = null;
  function avgTech() {
    if (avgTEra !== eraId()) { const l = COUNTRY_DEFS.filter(d => !d.unclaimed && d.tech); avgTEra = eraId(); avgT = l.reduce((s, d) => s + d.tech, 0) / Math.max(1, l.length) || 1; }
    return avgT;
  }
  function tradeBonusRate(tag) { return 0.10 + mod(tag, 'tradeBonus') * 0.5; }

  // ---------- construction ----------
  function buildCost(kind, tag, pid) {
    if (INFRA[kind]) {
      const k = INFRA[kind], lvl = pid >= 0 ? infra(pid, kind) : 0;
      return { cp: Math.round(k.cp * (1 + lvl * 0.5)), gold: Math.round(k.gold * (1 + lvl * 0.5)) };
    }
    const k = KINDS[kind];
    const n = G().ind.reduce((s, I, i) => s + (I && I[kind] && G().owner[i] === tag ? I[kind] : 0), 0);
    return { cp: Math.round(k.cp * (1 + n * 0.004)), gold: Math.round(k.gold * (1 + n * 0.01)) };
  }
  function canInfra(tag, kind, pid) {
    const g = G(), c = g.countries[tag], k = INFRA[kind];
    if (!infraKinds().includes(kind) || (k.needs === 'air' && !(typeof Air !== 'undefined' && Air.available()))) return { ok: false, why: 'Not available in this era' };
    if (!c || !c.eco || c.eco.none) return { ok: false, why: 'No economy' };
    if (pid === undefined || pid < 0) { const p = bestInfra(tag, kind); if (!p) return { ok: false, why: k.coast ? 'No coastal province with room' : 'No province with room' }; pid = p.id; }
    const cost = buildCost(kind, tag, pid);
    if (c.eco.gold < cost.gold) return { ok: false, why: 'Needs ' + cost.gold + ' gold' };
    if (c.eco.queue.length >= 6) return { ok: false, why: 'The construction queue is full (6)' };
    if (g.owner[pid] !== tag) return { ok: false, why: 'Not your province' };
    const p = MAP().provs[pid];
    if (k.coast && !(typeof Seas !== 'undefined' ? Seas.isCoastal(pid) : coastal(p))) return { ok: false, why: 'Needs a coast' };
    if (kind === 'dock' && !infra(pid, 'port')) return { ok: false, why: 'Needs a ' + kindName('port').toLowerCase() + ' first' };
    const queued = c.eco.queue.filter(q => q.prov === pid && q.kind === kind).length;
    if (infra(pid, kind) + queued >= k.max) return { ok: false, why: k.max > 1 ? 'Already at level ' + k.max : 'Already built' };
    return { ok: true, prov: pid, cost };
  }
  function bestInfra(tag, kind) {
    const g = G(), c = g.countries[tag], k = INFRA[kind];
    const cap = c.capital >= 0 ? MAP().provs[c.capital] : null;
    let best = null, bs = -Infinity;
    for (const p of MAP().provs) {
      if (g.owner[p.id] !== tag) continue;
      const queued = c.eco.queue.filter(q => q.prov === p.id && q.kind === kind).length;
      if (infra(p.id, kind) + queued >= k.max) continue;
      if (k.coast && !(typeof Seas !== 'undefined' ? Seas.isCoastal(p.id) : coastal(p))) continue;
      if (kind === 'dock' && !infra(p.id, 'port')) continue;
      const far = cap ? GEO.haversineKm(p.lon, p.lat, cap.lon, cap.lat) : 0;
      const front = enemyNear(tag, p) ? 1 : 0;
      const lvl = infra(p.id, kind);
      let s;
      if (kind === 'port') s = (p.city ? 5 : 0) + p.pop / 5e5 + (p.home ? 2 : 0) - lvl * 3;
      else if (kind === 'dock') s = infra(p.id, 'port') * 2 + (p.home ? 3 : 0) + lvl - front * 5;
      else if (kind === 'air') s = (p.city ? 3 : 0) + (p.home ? 2 : 0) + front * 2 - lvl * 3 - far / 3000;
      else if (kind === 'hub') s = far / 400 + (p.city ? 2 : 0) + front * 3 - (p.core === tag ? 0 : 1);
      else if (kind === 'fort') s = front * 6 + (p.capital ? 3 : 0) + (p.city ? 1 : 0) - lvl * 2 + (({ mountains: 2, hills: 1 })[p.terrain] || 0);
      else s = (p.capital ? 4 : 0) + (p.city ? 2 : 0) + (typeof Seas !== 'undefined' && Seas.isCoastal(p.id) ? 1 : 0) + front * 2;
      if (s > bs) { bs = s; best = p; }
    }
    return best;
  }
  function canBuild(tag, kind, pid) {
    const g = G(), c = g.countries[tag];
    if (INFRA[kind]) return canInfra(tag, kind, pid);
    if (!KINDS[kind]) return { ok: false, why: 'Unknown industry' };
    if (!c || !c.eco) return { ok: false, why: 'No economy' };
    const cost = buildCost(kind, tag);
    if (c.eco.gold < cost.gold) return { ok: false, why: 'Needs ' + cost.gold + ' gold' };
    if (c.eco.queue.length >= 6) return { ok: false, why: 'The construction queue is full (6)' };
    if (pid === undefined || pid < 0) {
      const p = bestProvince(tag, kind);
      return p ? { ok: true, prov: p.id, cost } : { ok: false, why: kind === 'strat' ? 'You own no ' + goodName('strategic').toLowerCase() + ' deposit with room' : 'No province has a free slot' };
    }
    const p = MAP().provs[pid];
    if (g.owner[pid] !== tag) return { ok: false, why: 'Not your province' };
    const queued = c.eco.queue.filter(q => q.prov === pid).length;
    if (freeSlots(pid) - queued <= 0) return { ok: false, why: 'No free slot here' };
    if (!canHost(kind, p, tag)) return { ok: false, why: kind === 'strat' ? 'No ' + goodName('strategic').toLowerCase() + ' deposit here' : 'The land here cannot be farmed' };
    return { ok: true, prov: pid, cost };
  }
  function bestProvince(tag, kind) {
    const g = G(), c = g.countries[tag];
    let best = null, bs = 0;
    for (const p of MAP().provs) {
      if (g.owner[p.id] !== tag) continue;
      const queued = c.eco.queue.filter(q => q.prov === p.id).length;
      if (freeSlots(p.id) - queued <= 0 || !canHost(kind, p, tag)) continue;
      const out = kind === 'strat' && !dep(p.id, 'strategic') ? 2 : baseOut(kind, p);
      const s = out * provMul(kind, p, tag) * (p.core === tag ? 1 : 0.5) * (1 + (p.infra || 1) * 0.05) - ((kind === 'arsenal' || kind === 'shop') && enemyNear(tag, p) ? 1 : 0);
      if (s > bs) { bs = s; best = p; }
    }
    return best;
  }
  function enemyNear(tag, p) { return p.nb.some(n => Sim.atWar(tag, G().owner[n])); }
  function build(tag, kind, pid) {
    const chk = canBuild(tag, kind, pid);
    if (!chk.ok) return chk;
    const c = G().countries[tag];
    c.eco.gold -= chk.cost.gold;
    c.eco.queue.push({ kind, prov: chk.prov, left: chk.cost.cp, total: chk.cost.cp, gold: chk.cost.gold });
    return { ok: true, prov: chk.prov, text: kindName(kind) + ' started in ' + MAP().provs[chk.prov].name + '.' };
  }
  function cancelBuild(tag, i) {
    const c = G().countries[tag], q = c.eco.queue[i];
    if (!q) return;
    c.eco.queue.splice(i, 1);
    c.eco.gold += Math.round((q.gold || buildCost(q.kind, tag).gold) * 0.5);
  }
  function stepQueue(c) {
    const g = G(), e = c.eco;
    let cp = e.cp;
    // the first three projects share the construction points
    const active = e.queue.slice(0, 3);
    for (const q of active) {
      if (g.owner[q.prov] !== c.tag) { q.lost = true; continue; }
      const share = cp / active.length;
      q.left -= share;
      if (q.left <= 0) {
        if (INFRA[q.kind]) setInfra(q.prov, q.kind, infra(q.prov, q.kind) + 1);
        else ind(q.prov)[q.kind] = (ind(q.prov)[q.kind] || 0) + 1;
        q.done = true;
        Sim.tell(c.tag, kindName(q.kind) + ' completed in ' + MAP().provs[q.prov].name + '.', q.prov, 'info', false);
      }
    }
    e.queue = e.queue.filter(q => !q.done && !q.lost);
  }

  // ---------- trade deals ----------
  const deals = () => G().dip.trade;
  function dealsOf(tag) { return deals().filter(d => d.from === tag || d.to === tag); }
  function dealBetween(a, b) { return deals().filter(d => (d.from === a && d.to === b) || (d.from === b && d.to === a)); }
  function trading(a, b) { return deals().some(d => (d.from === a && d.to === b) || (d.from === b && d.to === a)); }
  function tradeSlots(tag) {
    const c = G().countries[tag];
    return Math.max(1, 2 + Math.floor(((c.eco && c.eco.coastCities) || 0) / 3) + Math.round(mod(tag, 'tradeSlots')));
  }
  function hasCoast(tag) {
    const g = G();
    return MAP().provs.some(p => g.owner[p.id] === tag && coastal(p));
  }
  function routeOK(a, b) { return (typeof Diplo !== 'undefined' && Diplo.borders(a, b)) || (hasCoast(a) && hasCoast(b)); }
  function embargoed(a, b) { return G().dip.embargo.some(x => (x.by === a && x.of === b) || (x.by === b && x.of === a)); }
  // what a nation has left over (positive) or lacks (negative) per day, before deals it doesn't have yet
  function balance(tag, good) {
    const e = G().countries[tag].eco;
    if (!e || !e.need) return 0;
    return e.prod[good] + e.imp[good] - e.exp[good] - e.need[good];
  }
  function daysLeft(tag, good) {
    const e = G().countries[tag].eco, b = balance(tag, good);
    return b >= 0 ? Infinity : Math.floor(e.stock[good] / -b);
  }
  // share of a good's need that comes from one seller (or all imports when seller is omitted)
  function dependence(buyer, good, seller) {
    const e = G().countries[buyer].eco;
    if (!e || !e.need || !e.need[good]) return 0;
    const q = deals().filter(d => d.to === buyer && d.good === good && (!seller || d.from === seller)).reduce((s, d) => s + (d.delivered ?? d.amount), 0);
    return Math.min(1, q / e.need[good]);
  }
  function fairPrice(good, amount) { return Math.max(1, Math.round(worldPrice(good) * amount * 10) / 10); }

  // ---------- what each nation will pay or take, from its own needs ----------
  // every nation haggles a little differently: a fixed lean per nation, -0.08 to +0.08
  function temper(tag) { let h = 7; for (const ch of tag) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return ((h % 1000) / 1000 - 0.5) * 0.16; }
  const WAR_GOODS = { metal: 1, fuel: 1, strategic: 1 };
  // how badly a nation wants more of a good: 1 = about to run out, 0 = just enough, -0.8 = far more than it can use
  function needOf(tag, good) {
    const e = G().countries[tag].eco;
    if (!e || !e.need) return 0;
    const need = e.need[good];
    if (!(need > 0.05)) return -0.8;
    const b = balance(tag, good), sd = e.stock[good] / need;
    if (b < -0.05) { const d = e.stock[good] / -b; return d < 30 ? 1 : d < 90 ? 0.7 : d < 180 ? 0.4 : 0.15; }
    return sd < 30 ? 0.1 : sd < 60 ? -0.2 : sd < 85 ? -0.5 : -0.8;
  }
  // a factor on the world price: the most `tag` pays when buying, or the least it takes when selling, dealing with `other`
  function priceMul(tag, good, buying, other) {
    const g = G(), c = g.countries[tag], e = c.eco;
    if (!e || !e.need) return 1;
    const n = needOf(tag, good);
    // desperate buyers pay up to half again; glutted ones only buy cheap. Sellers short themselves ask more, glutted ones take less.
    let m = buying ? (n >= 0 ? 1 + n * 0.5 : 1 + n * 0.3) : (n > 0.3 ? 1.3 : n >= 0 ? 1.05 : 1 + n * 0.25);
    const rich = e.gold > 800 && e.goldDelta >= 0, poor = e.gold < 120 || e.goldDelta < -1;
    if (buying) m += rich ? 0.08 : poor ? (n >= 0.7 ? -0.03 : -0.12) : 0;
    else m += rich ? 0.05 : poor ? -0.08 : 0;          // a poor seller wants cash now
    if (WAR_GOODS[good] && Sim.isAtWar(tag)) m += 0.15;  // war makes metal, fuel and the strategic good dear
    m += buying ? -temper(tag) : temper(tag);
    if (other) {
      const r = typeof Diplo !== 'undefined' ? Diplo.rel(tag, other) : 0;
      m += (buying ? 1 : -1) * (r > 40 ? 0.06 : r < 0 ? -0.06 : 0);
      if ((g.countries[other].eco.untrusted || 0) > g.hour) m += buying ? -0.15 : 0.15;
    }
    return buying ? Math.max(0.6, Math.min(1.8, m)) : Math.max(0.6, Math.min(1.6, m));
  }
  // per unit, in gold: the most `tag` would pay, and the least it would sell for
  function bidAsk(tag, good, other) { const w = worldPrice(good); return { bid: +(w * priceMul(tag, good, true, other)).toFixed(2), ask: +(w * priceMul(tag, good, false, other)).toFixed(2), need: needOf(tag, good) }; }
  const perUnit = t => t.price / Math.max(0.1, t.amount);
  // terms: { good, amount, price, sell }  (sell: `from` sells to `to`)
  function canDeal(from, to, t) {
    const g = G(), A = g.countries[from], B = g.countries[to];
    const need = why => ({ ok: false, why });
    if (!A || !B || !A.eco || !B.eco || A.eco.none || B.eco.none) return need('Nobody to trade with there');
    if (Sim.atWar(from, to)) return need('You are at war');
    if (embargoed(from, to)) return need('An embargo is in force');
    if (!routeOK(from, to)) return need('No trade route: no shared border and no coast on both sides');
    if (dealsOf(from).length >= tradeSlots(from)) return need('All ' + tradeSlots(from) + ' of your trade slots are in use');
    if (dealsOf(to).length >= tradeSlots(to)) return need('They have no free trade slot');
    if (t) {
      if (!GOODS.includes(t.good)) return need('Pick a good');
      if (!(t.amount > 0)) return need('Pick an amount');
      const buyer = t.sell ? to : from;
      if (g.countries[buyer].eco.gold < 0) return need((buyer === from ? 'You are' : 'They are') + ' in debt');
      if (deals().some(d => d.good === t.good && ((d.from === from && d.to === to) || (d.from === to && d.to === from)))) return need('You already trade ' + goodName(t.good).toLowerCase() + ' with them');
    }
    return { ok: true };
  }
  // the AI's answer to a deal, from `to`'s side
  function answerDeal(from, to, t) {
    const g = G(), r = typeof Diplo !== 'undefined' ? Diplo.rel(to, from) : 0;
    const say = (yes, why) => ({ yes, why });
    if (r < -10) return say(false, 'Relations are too poor (' + r + ')');
    const fa = Sim.factionOf(from), ft = Sim.factionOf(to);
    if (fa && ft && fa !== ft && [...Sim.enemiesOf(fa.leader)].some(e => ft.members.includes(e))) return say(false, 'Your faction is at war with theirs');
    if (g.wars.some(w => Sim.sideOf(w, to) && [...Sim.enemiesOf(to)].some(e => Sim.allied(e, from)))) return say(false, 'You are allied with their enemies');
    const w = worldPrice(t.good), unit = perUnit(t), gname = goodName(t.good).toLowerCase();
    if (t.sell) {
      // they buy: what they pay depends on how badly they need it
      const b = balance(to, t.good), e = g.countries[to].eco;
      if (e.stock[t.good] >= e.need[t.good] * (STOCK_DAYS + mod(to, 'stockDays')) * 0.95 && b >= 0) return say(false, 'Their stores of ' + gname + ' are full');
      if (t.amount > Math.max(3, -b * 1.5 + e.need[t.good] * 0.3)) return say(false, 'That is more than they need');
      const bid = w * priceMul(to, t.good, true, from);
      if (unit > bid + 0.005) return say(false, 'They would pay at most ' + bid.toFixed(2) + ' a unit' + (needOf(to, t.good) < 0 ? ', as they have plenty' : ''));
      if (e.gold + e.goldDelta * 30 < t.price * 30) return say(false, 'They cannot afford it');
      return say(true, needOf(to, t.good) >= 0.7 ? 'They badly need it' : needOf(to, t.good) >= 0 ? 'They need it' : 'It is cheap enough for them');
    }
    // they sell: they must have it to spare, and the price must beat what they ask
    const b = balance(to, t.good), e = g.countries[to].eco;
    const spare = b + (e.stock[t.good] > e.need[t.good] * 60 ? e.need[t.good] * 0.2 : 0);
    if (spare < t.amount * 0.9) return say(false, spare > 0.5 ? 'They can spare only ' + spare.toFixed(1) + ' a day' : 'They have none to spare');
    const ask = w * priceMul(to, t.good, false, from);
    if (unit < ask - 0.005) return say(false, 'They want at least ' + ask.toFixed(2) + ' a unit');
    return say(true, 'They have it to spare');
  }
  function sign(from, to, t) {
    const g = G();
    const seller = t.sell ? from : to, buyer = t.sell ? to : from;
    const d = { id: g.eco.nextDeal++, from: seller, to: buyer, good: t.good, amount: +(+t.amount).toFixed(1), price: +(+t.price).toFixed(1), since: g.hour };
    deals().push(d);
    return d;
  }
  // cancel a deal: the buyer loses supply (a shock), the seller loses income and trust
  function cancel(id, by, reason) {
    const g = G(), d = deals().find(x => x.id === id);
    if (!d) return null;
    g.dip.trade = deals().filter(x => x !== d);
    const buyer = g.countries[d.to], seller = g.countries[d.from];
    const depn = buyer && buyer.eco && buyer.eco.need[d.good] ? Math.min(1, (d.delivered ?? d.amount) / buyer.eco.need[d.good]) : 0;
    if (buyer && buyer.alive && buyer.eco && by !== d.to) {
      buyer.eco.shocks.push({ good: d.good, until: g.hour + 60 * DAY, stab: +(depn * 0.10).toFixed(3), from: d.from });
      g.eco.spike[d.good] = g.hour + 60 * DAY;
    }
    if (reason !== 'war' && reason !== 'gone' && typeof Diplo !== 'undefined' && buyer && seller) {
      if (by === d.from) {
        Diplo.addRel(d.from, d.to, -20);
        seller.eco.untrusted = g.hour + 180 * DAY;
      } else Diplo.addRel(d.from, d.to, -5);
    }
    d.cutAt = g.hour; d.cutBy = by;
    g.eco.cut = (g.eco.cut || []).filter(x => x.cutAt > g.hour - 60 * DAY).concat([d]);
    if (buyer && seller && (d.to === g.player || d.from === g.player) && by !== g.player && reason !== 'gone') {
      const txt = reason === 'war' ? 'War ended the ' + goodName(d.good).toLowerCase() + ' deal between ' + seller.name + ' and ' + buyer.name + '.'
        : seller.name + ' cut its ' + goodName(d.good).toLowerCase() + ' deal with ' + buyer.name + (depn > 0.05 ? ': ' + buyer.name + ' got ' + Math.round(depn * 100) + '% of its ' + goodName(d.good).toLowerCase() + ' from it.' : '.');
      Sim.notify(txt, buyer.capital, 'loss', false);
    }
    return { d, depn };
  }
  function endDealsBetween(a, b, reason) {
    for (const d of deals().slice()) if ((d.from === a && d.to === b) || (d.from === b && d.to === a)) cancel(d.id, null, reason);
  }
  function dropNation(tag) {
    for (const d of deals().slice()) if (d.from === tag || d.to === tag) cancel(d.id, null, 'gone');
    G().dip.embargo = G().dip.embargo.filter(x => x.by !== tag && x.of !== tag);
  }
  // embargo: cut every deal with them and refuse new ones. Strangling one gives the victim a reason for war.
  function embargo(by, of) {
    const g = G();
    let strangled = false;
    for (const good of ['food', 'fuel']) if (dependence(of, good, by) > 0.5) strangled = true;
    for (const d of deals().slice()) if ((d.from === by && d.to === of) || (d.from === of && d.to === by)) cancel(d.id, by);
    if (!g.dip.embargo.some(x => x.by === by && x.of === of)) g.dip.embargo.push({ by, of, since: g.hour });
    if (strangled) g.dip.claims[of + '>' + by] = g.hour + YEAR;
    return { strangled };
  }
  function liftEmbargo(by, of) { G().dip.embargo = G().dip.embargo.filter(x => !(x.by === by && x.of === of)); }

  // ---------- AI trade, once a month ----------
  function aiTrade(c) {
    const g = G(), t = c.tag, e = c.eco;
    if (!e || !e.need || !c.alive || e.none) return;
    const others = Object.values(g.countries).filter(o => o.alive && o.tag !== t && o.eco && o.eco.need && !o.eco.none);
    // drop deals with a nation it plans to attack
    const plan = g.dip.plan && g.dip.plan[t];
    if (plan) for (const d of dealsOf(t).slice()) if (d.from === plan.victim || d.to === plan.victim) aiCancel(d, t);
    // buy what it no longer needs? stop paying for it (unless it is a war good and war is near)
    const wary = Sim.isAtWar(t) || (typeof Diplo !== 'undefined' && Diplo.threatOf(t));
    for (const d of dealsOf(t).filter(d => d.to === t)) {
      const without = balance(t, d.good) - (d.delivered ?? d.amount);
      const glut = without >= 0 && e.stock[d.good] > e.need[d.good] * 75 && !(wary && WAR_GOODS[d.good]);
      // in debt: drop the least needed import first (luxuries before food)
      if (glut || (e.gold < 0 && e.debtDays > 20 && d.good === 'luxuries' && needOf(t, d.good) < 0.7)) { aiCancel(d, t); break; }
    }
    // shortages, most urgent first: buy from whoever sells cheapest, then the friendliest
    const short = GOODS.map(k => ({ k, b: balance(t, k), n: needOf(t, k) }))
      .filter(x => x.b < -0.5 ? x.n >= 0.15 : (wary && WAR_GOODS[x.k] && x.n >= 0.1))
      .sort((a, b) => b.n - a.n || a.b - b.b);
    for (const s of short.slice(0, 2)) {
      if (dealsOf(t).length >= tradeSlots(t) || e.gold < 0) break;
      const want = s.b < -0.5 ? -s.b * 1.05 : Math.max(1, e.need[s.k] * 0.25);
      const cands = others.filter(o => balance(o.tag, s.k) > 1 && canDeal(t, o.tag, null).ok && !deals().some(d => d.good === s.k && d.from === o.tag && d.to === t))
        .map(o => ({ o, ask: Sim.isHuman(o.tag) ? worldPrice(s.k) : worldPrice(s.k) * priceMul(o.tag, s.k, false, t) }))
        .sort((a, b) => a.ask - b.ask || Diplo.rel(t, b.o.tag) - Diplo.rel(t, a.o.tag));
      for (const { o, ask } of cands.slice(0, 3)) {
        const bid = worldPrice(s.k) * priceMul(t, s.k, true, o.tag);
        if (ask > bid) continue;                                  // too dear: it will build its own instead
        const amt = +Math.max(1, Math.min(want, balance(o.tag, s.k) * 0.9)).toFixed(1);
        // meet halfway between their price and its limit; the player gets a bit over the world price
        const unit = Sim.isHuman(o.tag) ? Math.min(bid, worldPrice(s.k) * (1.05 + Math.max(0, s.n) * 0.2)) : (ask + bid) / 2;
        const terms = { good: s.k, amount: amt, price: Math.max(1, +(unit * amt).toFixed(1)), sell: false };
        const r = Diplo.act('trade', t, o.tag, terms);
        if (r.ok && r.accepted !== false) break;
      }
    }
    // surpluses: sell to whoever bids highest (the player sometimes)
    for (const k of GOODS) {
      const b = balance(t, k);
      if (b < 2 || e.stock[k] < e.need[k] * 30 || dealsOf(t).length >= tradeSlots(t)) continue;
      if (wary && WAR_GOODS[k] && e.stock[k] < e.need[k] * 60) continue;   // keeps war goods when war is near
      const ask = worldPrice(k) * priceMul(t, k, false);
      const buyer = others.filter(o => balance(o.tag, k) < -1 && canDeal(t, o.tag, null).ok && Diplo.rel(t, o.tag) >= 0)
        .map(o => ({ o, bid: Sim.isHuman(o.tag) ? worldPrice(k) * 1.1 : worldPrice(k) * priceMul(o.tag, k, true, t) }))
        .filter(x => x.bid >= ask).sort((a, b2) => b2.bid - a.bid)[0];
      if (!buyer || (Sim.isHuman(buyer.o.tag) && Sim.rng() > 0.35)) continue;
      const amt = +Math.max(1, Math.min(b * 0.9, -balance(buyer.o.tag, k))).toFixed(1);
      const unit = Sim.isHuman(buyer.o.tag) ? Math.max(ask, worldPrice(k)) : (ask + buyer.bid) / 2;
      Diplo.act('trade', t, buyer.o.tag, { good: k, amount: amt, price: Math.max(1, +(unit * amt).toFixed(1)), sell: true });
      break;
    }
    // stop selling what it now lacks itself
    for (const d of dealsOf(t).filter(d => d.from === t)) if (balance(t, d.good) < -0.5 && daysLeft(t, d.good) < 45) aiCancel(d, t);
    // embargo requests from the faction leader
    // (handled in Diplo when the leader embargoes)
    // build what it is most short of, else arsenals when it expects war
    aiBuild(c);
  }
  function aiCancel(d, t) { if (typeof Diplo !== 'undefined') Diplo.act('canceltrade', t, d.from === t ? d.to : d.from, { id: d.id }); else cancel(d.id, t); }
  // builds what pays best: a shortage first (dearer goods sooner), then goods the world pays well for, arsenals when war looms
  function aiBuild(c) {
    const e = c.eco, t = c.tag;
    if (e.queue.length >= 2) return;
    // keep a reserve: two months of any running loss, never below 150
    if (e.gold < Math.max(150, -e.goldDelta * 60)) return;
    const war = Sim.isAtWar(t), threat = typeof Diplo !== 'undefined' && Diplo.threatOf(t);
    const opts = [['farm', 'food'], ['mine', 'metal'], ['fuel', 'fuel'], ['strat', 'strategic'], ['shop', 'luxuries']].map(([kind, good]) => {
      const n = needOf(t, good), rel = worldPrice(good) / BASE_PRICE[good];
      let s = (n > 0 ? 0.8 + n : 0) * Math.max(0.8, rel);                 // short: build it, sooner when importing is dear
      if (n > -0.5) s += Math.max(0, rel - 1.15) * 0.8;                  // the world pays well: build to sell
      if ((war || threat) && WAR_GOODS[good] && n > -0.5) s += 0.3;
      if (kind === 'shop') s += (c.stab < 0.5 ? 0.3 : 0) + (e.goldDelta < 0 ? 0.3 : 0.1);   // shops add taxes and calm
      if (e.queue.some(j => j.kind === kind)) s *= 0.4;
      return { kind, s };
    });
    const inputs = Math.min(e.sat.metal, e.sat.fuel);
    opts.push({ kind: 'arsenal', s: (war ? 1.4 : threat ? 1.0 : 0.35) * inputs * (e.queue.some(j => j.kind === 'arsenal') ? 0.5 : 1) });
    for (const o of opts.filter(o => o.s >= 0.3).sort((a, b) => b.s - a.s)) { const r = build(t, o.kind); if (r.ok) break; }
  }
  // AI answer to being asked to join an embargo: yes if it costs little
  function joinsEmbargo(tag, of) {
    const loss = GOODS.reduce((s, k) => s + dependence(tag, k, of), 0);
    const sells = dealsOf(tag).filter(d => d.from === tag && d.to === of).reduce((s, d) => s + d.price, 0);
    const e = G().countries[tag].eco;
    return loss < 0.2 && sells < Math.max(5, (e.goldDelta || 0) * 0.5);
  }

  // research knowledge from trade partners that are ahead
  function tradeKnowledge(tag) {
    const g = G(), mine = (g.countries[tag].techs || []).length;
    const partners = new Set(dealsOf(tag).map(d => d.from === tag ? d.to : d.from));
    let n = 0;
    for (const p of partners) if ((g.countries[p].techs || []).length > mine) n++;
    return Math.min(0.15, n * 0.03);
  }
  // world prices a month ago, for the trend arrows (kept for a year)
  function priceTrend(good) {
    const h = G().eco.hist && G().eco.hist[good];
    if (!h || !h.length) return 0;
    const was = h.length > 1 ? h[h.length - 2] : h[0];
    return (worldPrice(good) - was) / was;
  }
  function monthly() {
    // relations grow between partners
    const g = G();
    const hist = g.eco.hist || (g.eco.hist = {});
    for (const k of GOODS) { const h = hist[k] || (hist[k] = []); h.push(+worldPrice(k).toFixed(3)); if (h.length > 12) h.shift(); }
    if (typeof Diplo === 'undefined') return;
    const seen = new Set();
    for (const d of deals()) {
      const k = Sim.pairKey(d.from, d.to);
      if (seen.has(k)) continue; seen.add(k);
      Diplo.addRel(d.from, d.to, 2 * (1 + mod(d.from, 'relGrowth')));
    }
  }
  function recruitRate(tag, type) {
    const c = G().countries[tag];
    return stratUnit(type) && c.eco ? Math.max(0.1, c.eco.sat.strategic) : 1;
  }
  function anyShort(tag) {
    const c = G().countries[tag];
    return !!(c.eco && c.eco.need && GOODS.some(k => balance(tag, k) < -0.05 && daysLeft(tag, k) < 60));
  }

  return {
    restore, GOODS, KINDS, KIND_KEYS, INFRA, INFRA_KEYS, infraKinds, infra, setInfra, isInfra, bestInfra, BASE_PRICE, ERA_ECO, setup, daily, monthly, goodName, kindName, coin, worldPrice, fairPrice, needOf, priceMul, bidAsk, priceTrend,
    slots, freeSlots, built, baseOut, provMul, canHost, dep, coastal, canBuild, build, cancelBuild, buildCost, bestProvince,
    dealsOf, dealBetween, trading, tradeSlots, routeOK, embargoed, balance, daysLeft, dependence, canDeal, answerDeal, sign, cancel,
    endDealsBetween, dropNation, embargo, liftEmbargo, aiTrade, joinsEmbargo, tradeKnowledge, recruitRate, stratUnit, anyShort, eraId, oilEra
  };
})();
