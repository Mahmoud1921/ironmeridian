// Politics: timed national effects and the decisions a government can take with political power.
'use strict';
const Politics = (function () {
  const G = () => Sim.G;
  const DAY = 24;
  const modern = () => { const e = typeof Eras !== 'undefined' && !Eras.isBase() ? Eras.info() : null; return !e || e.year >= 1790; };
  const LABEL = {
    attack: 'attack', defence: 'defence', org: 'organisation', speed: 'army speed', supply: 'supply', manpower: 'manpower growth', stability: 'stability', warSupport: 'war support',
    pp: 'political power', industry: 'industry', arsenals: 'arms output', workshops: 'workshop output', farms: 'farm output', mines: 'mine output', construction: 'construction speed',
    research: 'research speed', tax: 'taxes', tradeBonus: 'trade income', goldPerDay: 'gold a day', recruitCost: 'recruiting cost', relGrowth: 'relation growth', foodNeed: 'food needed',
    luxuries: 'luxury output', naval: 'naval strength'
  };
  const ABS = { stability: 1, warSupport: 1 };   // points on a 0-100 scale rather than a percentage change
  function fxText(fx) {
    return (fx || []).map(e => {
      const v = +e.value || 0, s = v > 0 ? '+' : '−';
      const name = e.mod === 'arsenals' && typeof Economy !== 'undefined' ? Economy.goodName('arms').toLowerCase() + ' output' : LABEL[e.mod] || e.mod;
      const where = e.where === 'border' ? ' on the borders' : e.where === 'home' ? ' at home' : '';
      const when = e.when === 'war' ? ' at war' : e.when === 'peace' ? ' in peace' : '';
      if (e.mod === 'goldPerDay') return s + Math.abs(v) + ' ' + (typeof Economy !== 'undefined' ? Economy.coin() : 'gold') + ' a day';
      return s + Math.round(Math.abs(v) * 100) + (ABS[e.mod] ? ' ' : '% ') + name + where + when;
    }).join(', ');
  }

  // ---------- timed effects ----------
  function addMod(tag, m) {
    const g = G(), c = g.countries[tag];
    if (!c) return;
    c.mods = (c.mods || []).filter(x => x.id !== m.id);
    c.mods.push({ id: m.id, name: m.name, until: g.hour + (m.days || 180) * DAY, fx: m.fx || [] });
    if (typeof Tech !== 'undefined') Tech.invalidate(tag);
  }
  function mods(tag) { const g = G(), c = g && g.countries[tag]; return c && c.mods ? c.mods.filter(m => m.until > g.hour) : []; }
  function daily() {
    const g = G();
    for (const c of Object.values(g.countries)) {
      if (!c.mods || !c.mods.length) continue;
      const n = c.mods.length;
      c.mods = c.mods.filter(m => m.until > g.hour);
      if (c.mods.length !== n && typeof Tech !== 'undefined') Tech.invalidate(c.tag);
    }
    // AI governments look at their options about once a month
    const day = Math.floor(g.hour / DAY);
    for (const c of Object.values(g.countries)) if (c.alive && c.tag !== g.player && (day + c.tag.charCodeAt(1) * 5) % 30 === 0) aiThink(c);
  }

  // ---------- decisions ----------
  const size = t => { const d = COUNTRY_BY_TAG[t]; return Math.max(1, Math.sqrt(((d && d.civ) || 0) + ((d && d.mil) || 0) + 4)); };
  const bloc = c => typeof Eras !== 'undefined' ? Eras.govClass(c.gov) : c.gov;
  const shortOf = (c, k) => !!(c.eco && c.eco.sat && c.eco.sat[k] < 0.9);
  const DECISIONS = [
    { id: 'wareco', cat: 'Economy', name: 'Mobilise the economy', old: 'Turn the forges to war', cost: 50, cd: 365, days: 180,
      desc: 'Workshops turn to making arms.', mod: [{ mod: 'arsenals', value: 0.2 }, { mod: 'workshops', value: -0.1 }], fx: { stab: -0.03 } },
    { id: 'works', cat: 'Economy', name: 'Public works programme', old: 'Build roads and aqueducts', cost: 50, gold: 250, cd: 365, days: 365,
      desc: 'Spend on roads and buildings: faster construction and a calmer people.', mod: [{ mod: 'construction', value: 0.2 }, { mod: 'stability', value: 0.03 }] },
    { id: 'austerity', cat: 'Economy', name: 'Austerity budget', old: 'Raise the tithes', cost: 25, cd: 365, days: 180,
      desc: 'Higher taxes refill the treasury at the cost of goodwill.', mod: [{ mod: 'tax', value: 0.15 }, { mod: 'stability', value: -0.05 }] },
    { id: 'ration', cat: 'Economy', name: 'Food rationing', old: 'Open the granaries', cost: 20, cd: 180, days: 180, when: c => shortOf(c, 'food'), why: 'Only when food runs short',
      desc: 'Stretch the food that is left.', mod: [{ mod: 'foodNeed', value: -0.15 }, { mod: 'stability', value: -0.03 }] },
    { id: 'research', cat: 'Economy', name: 'Research drive', old: 'Patronage of scholars', cost: 50, cd: 365, days: 365,
      desc: 'Fund the best minds of the nation.', mod: [{ mod: 'research', value: 0.15 }] },
    { id: 'trade', cat: 'Economy', name: 'Trade mission', old: 'Send merchant envoys', cost: 30, cd: 365, days: 365,
      desc: 'Merchants and envoys open doors abroad.', mod: [{ mod: 'tradeBonus', value: 0.1 }, { mod: 'relGrowth', value: 0.2 }] },
    { id: 'conscript', cat: 'Military', name: 'Emergency conscription', old: 'Call up the levies', cost: 40, cd: 180, when: c => Sim.isAtWar(c.tag), why: 'Only at war',
      desc: 'Call up more men now; the people resent it.', fx: t => ({ manpower: Math.round(COUNTRY_BY_TAG[t].pop * 1e6 * 0.004), stab: -0.05, ws: 0.02 }) },
    { id: 'drill', cat: 'Military', name: 'Officer training', old: 'Drill the troops', cost: 45, cd: 365, days: 365,
      desc: 'Better drilled troops recover and hold together.', mod: [{ mod: 'org', value: 0.1 }] },
    { id: 'fortify', cat: 'Military', name: 'Fortify the frontier', old: 'Man the border forts', cost: 40, cd: 365, days: 365,
      desc: 'Dig in along every border.', mod: [{ mod: 'defence', value: 0.1, where: 'border' }] },
    { id: 'offensive', cat: 'Military', name: 'Offensive spirit', old: 'Rouse the host', cost: 45, cd: 365, days: 120, when: c => Sim.isAtWar(c.tag), why: 'Only at war',
      desc: 'A short burst of aggression at the front.', mod: [{ mod: 'attack', value: 0.1 }, { mod: 'speed', value: 0.05 }] },
    { id: 'bonds', cat: 'Home front', name: 'Sell war bonds', old: 'Levy a war tax', cost: 30, cd: 180, when: c => Sim.isAtWar(c.tag), why: 'Only at war',
      desc: 'Borrow from your own people to pay for the war.', fx: t => ({ gold: Math.round(150 * size(t)), ws: -0.02 }) },
    { id: 'propaganda', cat: 'Home front', name: 'Propaganda campaign', old: 'Heralds and festivals', cost: 35, cd: 180, days: 180,
      desc: 'Rally the people behind the government.', mod: [{ mod: 'warSupport', value: 0.1 }], fx: { ws: 0.05 } },
    { id: 'crackdown', cat: 'Home front', name: 'Crack down on dissent', old: 'Hang the agitators', cost: 40, cd: 365, when: c => c.stab < 0.6, why: 'Only when stability is under 60%',
      desc: 'Order restored by force; some lose heart.', fx: { stab: 0.08, ws: -0.03 }, cheap: 'Authoritarian' },
    { id: 'elections', cat: 'Home front', name: 'Hold early elections', old: 'Call an assembly', cost: 30, cd: 730, when: c => bloc(c) === 'Democratic', why: 'Only for elected governments',
      desc: 'A fresh mandate steadies the country.', fx: { stab: 0.08, pp: 20, ws: -0.02 } },
    { id: 'demob', cat: 'Home front', name: 'Demobilise', old: 'Send the levies home', cost: 15, cd: 365, days: 180, when: c => !Sim.isAtWar(c.tag), why: 'Only in peace',
      desc: 'Soldiers go back to work.', mod: [{ mod: 'industry', value: 0.05 }], fx: { stab: 0.05, ws: -0.06 } }
  ];
  const byId = Object.fromEntries(DECISIONS.map(d => [d.id, d]));
  const nameOf = d => modern() ? d.name : d.old;
  const costOf = (d, c) => Math.round(d.cost * (d.cheap && bloc(c) === d.cheap ? 0.6 : 1));
  const fxOf = (d, t) => typeof d.fx === 'function' ? d.fx(t) : d.fx || {};
  function can(tag, id) {
    const g = G(), c = g.countries[tag], d = byId[id];
    if (!d || !c || !c.alive) return { ok: false, why: 'Unknown decision' };
    const cd = c.dec && c.dec[id];
    if (cd && cd > g.hour) return { ok: false, why: 'Available again in ' + Math.ceil((cd - g.hour) / DAY) + ' days' };
    if (d.when && !d.when(c)) return { ok: false, why: d.why };
    if (c.pp < costOf(d, c)) return { ok: false, why: 'Needs ' + costOf(d, c) + ' political power' };
    if (d.gold && (!c.eco || c.eco.gold < d.gold)) return { ok: false, why: 'Needs ' + d.gold + ' ' + (typeof Economy !== 'undefined' ? Economy.coin() : 'gold') };
    return { ok: true };
  }
  function take(tag, id) {
    const chk = can(tag, id);
    if (!chk.ok) return chk;
    const g = G(), c = g.countries[tag], d = byId[id];
    c.pp -= costOf(d, c);
    if (d.gold) c.eco.gold -= d.gold;
    (c.dec || (c.dec = {}))[id] = g.hour + d.cd * DAY;
    if (d.mod) addMod(tag, { id: 'dec:' + id, name: nameOf(d), days: d.days, fx: d.mod });
    Events.apply(fxOf(d, tag), tag);
    return { ok: true, text: nameOf(d) + ': done.' };
  }
  function list(tag) {
    const c = G().countries[tag];
    return DECISIONS.map(d => {
      const chk = can(tag, d.id);
      const eff = [].concat(d.mod ? [fxText(d.mod) + ' for ' + d.days + ' days'] : [], Events.describe(fxOf(d, tag), tag).filter(s => s !== 'No immediate effect'));
      return { id: d.id, cat: d.cat, name: nameOf(d), desc: d.desc, cost: costOf(d, c), gold: d.gold || 0, ok: chk.ok, why: chk.why || '', fx: eff.join('; ') };
    });
  }
  // what an AI government reaches for, in order of need
  function aiThink(c) {
    const t = c.tag, war = Sim.isAtWar(t);
    const want = [];
    if (shortOf(c, 'food')) want.push('ration');
    if (c.stab < 0.4) want.push(bloc(c) === 'Democratic' ? 'elections' : 'crackdown');
    if (war) { if (c.manpower < 30000) want.push('conscript'); want.push('wareco', 'drill'); if (c.ws < 0.4) want.push('propaganda'); if (c.eco && c.eco.gold < 100) want.push('bonds'); }
    else { if (c.eco && c.eco.gold < 0) want.push('austerity'); if (Diplo.threatOf && Diplo.threatOf(t)) want.push('fortify', 'drill'); want.push('research', 'works', 'trade'); }
    for (const id of want) {
      const d = byId[id];
      if (can(t, id).ok && c.pp >= costOf(d, c) + 25) { take(t, id); return id; }
    }
    return null;
  }
  return { DECISIONS, addMod, mods, daily, fxText, can, take, list, aiThink, nameOf: id => byId[id] ? nameOf(byId[id]) : id };
})();
