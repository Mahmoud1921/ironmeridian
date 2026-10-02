// Diplomacy: relations, factions, pacts, guarantees, trade, aid, territorial demands and peace.
// Every action works for the player and the AI alike; AI nations answer proposals and use them on their own.
'use strict';
const Diplo = (function () {
  const G = () => Sim.G;
  const MAP = () => Sim.MAP;
  const DAY = 24, YEAR = 24 * 365;
  const hooks = { offer: null };   // UI hook: (offer, respond) => void, for proposals made to the player

  const COST = { improve: 10, guarantee: 15, pact: 15, trade: 5, aid: 0, create: 25, join: 10, invite: 10, demand: 20, peace: 0, embargo: 10 };
  const AID_EQ = 500;

  // ---------- relations ----------
  const GOV_REL = {
    Democratic: { Democratic: 30, Authoritarian: -25, Communist: -30, Neutral: 5 },
    Authoritarian: { Democratic: -25, Authoritarian: 20, Communist: -40, Neutral: 0 },
    Communist: { Democratic: -30, Authoritarian: -40, Communist: 35, Neutral: -5 },
    Neutral: { Democratic: 5, Authoritarian: 0, Communist: -5, Neutral: 10 }
  };
  // era governments (Kingdom, Sultanate, ...) behave as one of the four blocs above
  const bloc = gov => typeof Eras !== 'undefined' ? Eras.govClass(gov) : gov;
  function rel(a, b) {
    const g = G(), A = g.countries[a], B = g.countries[b];
    if (!A || !B || a === b) return 100;
    let v = GOV_REL[bloc(A.gov)][bloc(B.gov)] + (g.dip.rel[Sim.pairKey(a, b)] || 0);
    if (Sim.root(a) === Sim.root(b)) v += 60;
    else if (Sim.allied(a, b)) v += 30;
    if (Sim.atWar(a, b)) v -= 60;
    if (Sim.hasPact(a, b)) v += 10;
    if (typeof Economy !== 'undefined' && Economy.trading(a, b)) v += 10;
    return Math.max(-100, Math.min(100, Math.round(v)));
  }
  function addRel(a, b, d) { const k = Sim.pairKey(a, b), R = G().dip.rel; R[k] = Math.max(-150, Math.min(150, (R[k] || 0) + d)); }

  // ---------- helpers ----------
  const name = t => G().countries[t].name;
  const alive = t => G().countries[t] && G().countries[t].alive;
  function power(tag) {
    const g = G(), c = g.countries[tag];
    if (cache.pHour !== g.hour || cache.pGame !== g) {
      // army strength per nation, counted once per game hour
      cache.pHour = g.hour; cache.pGame = g; cache.arm = {};
      for (const a of g.armies) { let v = 0; for (const u of a.units) v += u.str * (u.type === 'tanks' ? 2 : 1); cache.arm[a.owner] = (cache.arm[a.owner] || 0) + v; }
    }
    return (cache.arm[tag] || 0) * c.tech + c.mil * 0.6 + c.civ * 0.15;
  }
  const cache = {};
  const sidePower = tags => tags.reduce((s, t) => s + (alive(t) ? power(t) : 0), 0);
  // which nations share a land border, rebuilt only when the map changes hands
  function borders(a, b) {
    const g = G();
    if (cache.bVer !== g.ownVer || cache.bGame !== g) {
      cache.bVer = g.ownVer; cache.bGame = g; cache.nb = {};
      for (const p of MAP().provs) {
        const o = g.owner[p.id];
        for (const n of p.nb) { const q = g.owner[n]; if (q !== o) (cache.nb[o] || (cache.nb[o] = new Set())).add(q); }
      }
    }
    return !!(cache.nb[a] && cache.nb[a].has(b));
  }
  function guaranteedBy(tag) { return G().dip.guar.filter(x => x.of === tag && alive(x.by)).map(x => x.by); }
  function cdLeft(key) { const u = G().dip.cd[key]; return u && u > G().hour ? Math.ceil((u - G().hour) / DAY) : 0; }
  function setCd(key, days) { G().dip.cd[key] = G().hour + days * DAY; }
  function isMajor(tag) { const c = G().countries[tag]; return c.civ + c.mil >= 20; }
  function warsBetweenSides(a, b) { return G().wars.filter(w => { const sa = Sim.sideOf(w, a), sb = Sim.sideOf(w, b); return sa && sb && sa !== sb; }); }
  // wars this nation fights that the faction is not part of
  function wouldDragIn(tag, fac) { return G().wars.some(w => Sim.sideOf(w, tag) && !fac.members.some(m => Sim.sideOf(w, m))); }
  // wars the faction fights that this nation is not part of
  function factionWarsFor(tag, fac) { return G().wars.some(w => !Sim.sideOf(w, tag) && fac.members.some(m => Sim.sideOf(w, m))); }
  const FACTION_NAMES = {
    Democratic: ['Atlantic Concord', 'Liberty Accord', 'Western Covenant'],
    Authoritarian: ['Iron Pact', 'Continental Alliance', 'Steel Covenant'],
    Communist: ['Red Accord', 'Workers\' Front', 'International Bloc'],
    Neutral: ['Neutral League', 'Southern Entente', 'Free Nations Pact']
  };
  function pickFactionName(gov) {
    const used = new Set(G().dip.factions.map(f => f.name));
    for (const n of (typeof Eras !== 'undefined' && Eras.factionNames(bloc(gov))) || FACTION_NAMES[bloc(gov)]) if (!used.has(n)) return n;
    return 'League of ' + (G().dip.nextFac + 1);
  }
  // provinces a demand asks for: land along the shared border, the demander's own cores first
  function demandTargets(from, to) {
    const g = G();
    const cand = MAP().provs.filter(p => g.owner[p.id] === to && p.nb.some(n => g.owner[n] === from) && p.id !== g.countries[to].capital);
    cand.sort((a, b) => ((b.core === from) - (a.core === from)) || (b.pop - a.pop));
    return cand.slice(0, 3).map(p => p.id);
  }

  // ---------- what can be done ----------
  // returns { ok, why } for the player (or any nation) acting on a target
  function can(action, from, to, terms) {
    const g = G(), me = g.countries[from];
    if (g.over) return { ok: false, why: 'The game is over' };
    if (to && !alive(to)) return { ok: false, why: 'That nation no longer exists' };
    const cost = COST[action] || 0;
    const war = to && Sim.atWar(from, to);
    const fac = Sim.factionOf(from), tfac = to ? Sim.factionOf(to) : null;
    const need = why => ({ ok: false, why });
    if (me.pp < cost) return need('Needs ' + cost + ' political power');
    switch (action) {
      case 'improve': {
        if (war) return need('You are at war');
        const d = cdLeft('improve|' + from + '|' + to); if (d) return need('Ready again in ' + d + ' days');
        if (rel(from, to) >= 100) return need('Relations are already excellent');
        return { ok: true };
      }
      case 'guarantee':
        if (war) return need('You are at war');
        if (Sim.root(to) === Sim.root(from)) return need('They are part of your nation');
        if (g.dip.guar.some(x => x.by === from && x.of === to)) return need('Already guaranteed');
        if (isMajor(to)) return need('Only smaller nations can be guaranteed');
        return { ok: true };
      case 'unguarantee': return g.dip.guar.some(x => x.by === from && x.of === to) ? { ok: true } : need('No guarantee to revoke');
      case 'pact':
        if (war) return need('You are at war');
        if (Sim.allied(from, to)) return need('You are already allies');
        if (Sim.hasPact(from, to)) return need('A pact is already in force');
        { const d = cdLeft('pact|' + from + '|' + to); if (d) return need('They will not talk again for ' + d + ' days'); }
        return { ok: true };
      case 'trade': {
        { const d = cdLeft('trade|' + from + '|' + to); if (d) return need('They will not talk again for ' + d + ' days'); }
        return Economy.canDeal(from, to, terms || null);
      }
      case 'canceltrade': {
        const id = terms && terms.id;
        const d = g.dip.trade.find(x => x.id === id && (x.from === from || x.to === from) && (!to || x.from === to || x.to === to));
        return d ? { ok: true } : need('No such trade deal');
      }
      case 'embargo':
        if (Sim.allied(from, to)) return need('They are your ally');
        if (g.dip.embargo.some(x => x.by === from && x.of === to)) return need('Your embargo is already in force');
        return { ok: true };
      case 'lift': return g.dip.embargo.some(x => x.by === from && x.of === to) ? { ok: true } : need('No embargo to lift');
      case 'aid':
        if (war) return need('You are at war');
        if (me.equipment < AID_EQ * 1.5) return need('Needs ' + Math.round(AID_EQ * 1.5) + ' equipment in stock');
        { const d = cdLeft('aid|' + from + '|' + to); if (d) return need('Next shipment in ' + d + ' days'); }
        return { ok: true };
      case 'create':
        if (fac) return need('You are already in the ' + fac.name);
        return { ok: true };
      case 'leave': return fac ? { ok: true } : need('You are not in a faction');
      case 'join':
        if (fac) return need('You are already in the ' + fac.name);
        if (!tfac) return need('They are not in a faction');
        if (war) return need('You are at war with them');
        if (tfac.members.some(m => Sim.atWar(m, from))) return need('You are at war with a member');
        { const d = cdLeft('join|' + from + '|' + tfac.id); if (d) return need('They will not talk again for ' + d + ' days'); }
        return { ok: true };
      case 'invite':
        if (!fac) return need('Create or join a faction first');
        if (fac.leader !== from) return need('Only the faction leader can invite');
        if (tfac) return need('They are in the ' + tfac.name);
        if (Sim.root(to) !== to) return need('They answer to their overlord');
        if (fac.members.some(m => Sim.atWar(m, to))) return need('A member is at war with them');
        { const d = cdLeft('invite|' + from + '|' + to); if (d) return need('They will not talk again for ' + d + ' days'); }
        return { ok: true };
      case 'demand':
        if (war) return need('You are already at war');
        if (Sim.allied(from, to)) return need('They are your ally');
        if (!demandTargets(from, to).length) return need('You share no border with them');
        { const d = cdLeft('demand|' + from + '|' + to); if (d) return need('Wait ' + d + ' days before demanding again'); }
        return { ok: true };
      case 'peace':
        if (!war) return need('You are not at war with them');
        { const d = cdLeft('peace|' + from + '|' + to); if (d) return need('They will not talk again for ' + d + ' days'); }
        return { ok: true };
    }
    return need('Unknown action');
  }

  // ---------- how the AI answers ----------
  // returns { yes, why } from the target's point of view
  function answer(action, from, to, terms) {
    const g = G(), r = rel(to, from), pf = power(from), pt = power(to);
    const threatened = threatOf(to);
    const say = (yes, why) => ({ yes, why });
    switch (action) {
      case 'pact': {
        const score = r + (pf > pt * 1.5 ? 25 : 0) + (threatened && threatened !== from ? 15 : 0) - (threatened === from ? 0 : 0);
        return score >= 0 ? say(true, 'Relations are good enough') : say(false, 'Relations are too poor (' + r + ')');
      }
      case 'trade': return Economy.answerDeal(from, to, terms);
      case 'join': {
        const fac = terms.fac, leader = fac.leader;
        const rl = rel(leader, from);
        const gov = g.countries[leader].gov === g.countries[from].gov ? 20 : 0;
        const drag = wouldDragIn(from, fac) ? -30 : 0;
        if (rl + gov + drag < 45 && drag) return say(false, 'They will not be dragged into your wars');
        return rl + gov + drag >= 45 ? say(true, 'The members agree') : say(false, 'The faction leader does not trust you enough (' + rl + ')');
      }
      case 'invite': {
        const fac = terms.fac;
        const gov = g.countries[to].gov === g.countries[from].gov ? 20 : 0;
        const fear = threatened && !fac.members.includes(threatened) ? 25 : 0;
        const neutralPenalty = g.countries[to].gov === 'Neutral' ? -20 : 0;
        const drag = factionWarsFor(to, fac) ? -30 : 0;
        const score = r + gov + fear + neutralPenalty + drag;
        if (score < 45 && drag) return say(false, 'They will not be dragged into the faction\'s wars');
        return score >= 45 ? say(true, 'They see safety in the alliance') : say(false, 'They prefer to stay out (' + r + ')');
      }
      case 'demand': {
        const defenders = new Set(Sim.coalition(to));
        for (const gb of guaranteedBy(to)) if (!Sim.allied(gb, from)) Sim.coalition(gb).forEach(t => defenders.add(t));
        [...defenders].forEach(t => { if (Sim.allied(t, from)) defenders.delete(t); });
        const def = sidePower([...defenders]), att = sidePower(Sim.coalition(from));
        if (att > def * 2.5) return say(true, 'They cannot resist you');
        return say(false, 'They will fight for their land');
      }
      case 'peace': {
        const ws = warScore(to, from);     // positive: target is winning against us
        const tired = (g.hour - Math.min(...warsBetweenSides(from, to).map(w => w.start))) > YEAR;
        if (terms.keep) return ws <= -25 ? say(true, 'They are beaten') : say(false, 'They are not beaten yet (war score ' + ws + ')');
        return ws <= 10 || (tired && ws <= 30) ? say(true, 'They are ready to stop') : say(false, 'They think they are winning (war score ' + ws + ')');
      }
    }
    return say(false, '');
  }
  // how well `a` is doing against `b`, -100..100
  function warScore(a, b) {
    const g = G();
    const A = Sim.coalition(a), B = Sim.coalition(b);
    let aHeld = 0, bHeld = 0, aHome = 0, bHome = 0;
    for (const p of MAP().provs) {
      if (!p.home) continue;
      if (A.includes(p.core)) { aHome++; if (B.includes(g.owner[p.id])) bHeld++; }
      if (B.includes(p.core)) { bHome++; if (A.includes(g.owner[p.id])) aHeld++; }
    }
    const occ = (aHeld / Math.max(1, bHome) - bHeld / Math.max(1, aHome)) * 140;
    const la = A.reduce((s, t) => s + g.countries[t].losses, 0), lb = B.reduce((s, t) => s + g.countries[t].losses, 0);
    const cas = (lb - la) / Math.max(20000, la + lb) * 40;
    return Math.max(-100, Math.min(100, Math.round(occ + cas)));
  }
  // the most dangerous unfriendly neighbour, if any
  function threatOf(tag) {
    const g = G();
    let best = null, bv = 0;
    const mine = sidePower(Sim.coalition(tag));
    for (const c of Object.values(g.countries)) {
      if (!c.alive || c.tag === tag || !borders(tag, c.tag)) continue;   // the cheap test first: most nations are not neighbours
      if (Sim.allied(c.tag, tag) || Sim.hasPact(c.tag, tag) || rel(tag, c.tag) > -10) continue;
      const v = power(c.tag) / Math.max(1, mine);
      if (v > 1.3 && v > bv) { bv = v; best = c.tag; }
    }
    return best;
  }

  // ---------- doing it ----------
  function log(text, prov, kind, pause) { Sim.notify(text, prov === undefined ? -1 : prov, kind || 'info', !!pause); }
  const involvesPlayer = (...t) => t.includes(G().player);

  // Perform an action from `from` toward `to`. For proposals, the AI answers (or the player, via hooks.offer).
  // Returns { ok, accepted, text }.
  function act(action, from, to, terms) {
    terms = terms || {};
    const g = G(), me = g.countries[from];
    const chk = can(action, from, to, terms);
    if (!chk.ok) return { ok: false, text: chk.why };
    me.pp -= COST[action] || 0;
    const res = (accepted, text) => ({ ok: true, accepted, text });
    switch (action) {
      case 'improve':
        addRel(from, to, 15); setCd('improve|' + from + '|' + to, 30);
        return res(true, 'Relations with ' + name(to) + ' improved to ' + rel(from, to) + '.');
      case 'guarantee':
        g.dip.guar.push({ by: from, of: to, since: g.hour }); addRel(from, to, 20);
        log(name(from) + ' guarantees the independence of ' + name(to) + '.', g.countries[to].capital);
        return res(true, 'You now guarantee ' + name(to) + '. If anyone attacks them, you join the war.');
      case 'unguarantee':
        g.dip.guar = g.dip.guar.filter(x => !(x.by === from && x.of === to)); addRel(from, to, -20);
        return res(true, 'Guarantee of ' + name(to) + ' revoked.');
      case 'canceltrade': {
        const r = Economy.cancel(terms.id, from);
        const d = r.d, other = d.from === from ? d.to : d.from;
        if (d.from === from && r.depn > 0.05 && (involvesPlayer(from, d.to) || r.depn > 0.3)) log(name(from) + ' cut its ' + Economy.goodName(d.good).toLowerCase() + ' exports to ' + name(d.to) + '.', g.countries[d.to].capital);
        return res(true, 'Deal with ' + name(other) + ' cancelled.' + (d.from === from && r.depn > 0.05 ? ' ' + name(other) + ' got ' + Math.round(r.depn * 100) + '% of its ' + Economy.goodName(d.good).toLowerCase() + ' from you.' : ''));
      }
      case 'embargo': {
        const r = Economy.embargo(from, to);
        const joined = [];
        const f = Sim.factionOf(from);
        if (f && f.leader === from) for (const m of f.members) if (m !== from && !Sim.isHuman(m) && alive(m) && Economy.joinsEmbargo(m, to) && !Sim.allied(m, to)) { Economy.embargo(m, to); joined.push(name(m)); }
        log(name(from) + ' declared an embargo on ' + name(to) + (joined.length ? ', joined by ' + joined.join(', ') : '') + '.', g.countries[to].capital, 'war', false);
        return res(true, 'Embargo on ' + name(to) + ' in force' + (joined.length ? '. Joined by ' + joined.join(', ') : '') + '.' + (r.strangled ? ' It strangles them: they now have a reason for war against you.' : ''));
      }
      case 'lift':
        Economy.liftEmbargo(from, to); addRel(from, to, 5);
        return res(true, 'Embargo on ' + name(to) + ' lifted.');
      case 'aid': {
        const amt = AID_EQ;
        me.equipment -= amt; g.countries[to].equipment += amt;
        addRel(from, to, Sim.isAtWar(to) ? 20 : 10); setCd('aid|' + from + '|' + to, 30);
        log(name(from) + ' sent military aid to ' + name(to) + '.', g.countries[to].capital);
        return res(true, amt + ' equipment shipped to ' + name(to) + '.');
      }
      case 'create': {
        const f = { id: g.dip.nextFac++, name: terms.name || pickFactionName(me.gov), leader: from, members: [from], since: g.hour };
        g.dip.factions.push(f); g.dip.facOf[from] = f.id;
        log(name(from) + ' founded the ' + f.name + '.', me.capital, 'info', false);
        return res(true, 'You founded the ' + f.name + '. Invite nations to join it.');
      }
      case 'leave': {
        const f = Sim.factionOf(from);
        leaveFaction(from);
        return res(true, 'You left the ' + f.name + '.');
      }
    }
    // proposals: the other side decides
    const fac = action === 'join' ? Sim.factionOf(to) : action === 'invite' ? Sim.factionOf(from) : null;
    const ctx = Object.assign({ fac }, terms);
    const decide = ans => finish(action, from, to, ctx, ans);
    const decider = action === 'join' ? fac.leader : to;
    // multiplayer: a proposal to a nation a person leads waits in g.dip.offers for that person's answer
    if (g.humans && Sim.isHuman(decider) && decider !== from) {
      const offers = g.dip.offers || (g.dip.offers = []);
      g.dip.nextOffer = (g.dip.nextOffer || 0) + 1;
      offers.push({ id: g.dip.nextOffer, action, from, to, decider, hour: g.hour, facId: fac ? fac.id : null, terms: Object.assign({}, terms), text: describe(action, from, to, ctx) });
      return res(null, 'Proposal sent to ' + name(decider) + '.');
    }
    if (decider === g.player && hooks.offer) {
      hooks.offer({ action, from, to, terms: ctx, text: describe(action, from, to, ctx) }, yes => decide({ yes, why: yes ? 'accepted' : 'declined' }));
      return res(null, 'Proposal sent to ' + name(decider) + '.');
    }
    return decide(answer(action, from, decider, ctx));
  }
  // does an offer still make sense when it is answered?
  function offerValid(o, ctx) {
    const g = G(), war = Sim.atWar(o.from, o.to);
    if (!g.countries[o.from] || !g.countries[o.from].alive) return false;
    if (o.action === 'peace') return war;
    if (war) return false;
    if (o.action === 'invite') return !Sim.factionOf(o.decider) && !!ctx.fac;
    if (o.action === 'join') return !!ctx.fac && !Sim.factionOf(o.from);
    if (o.action === 'trade') return Economy.canDeal(o.from, o.to, ctx).ok;
    return true;
  }
  // the person leading o.decider answers a waiting offer
  function answerOffer(id, yes) {
    const g = G(), list = g.dip.offers || [];
    const i = list.findIndex(o => o.id === id);
    if (i < 0) return { ok: false, text: 'That offer has lapsed.' };
    const o = list[i];
    if (o.decider !== g.player) return { ok: false, text: 'Not your offer to answer.' };
    list.splice(i, 1);
    const ctx = Object.assign({ fac: o.facId != null ? g.dip.factions.find(f => f.id === o.facId) || null : null }, o.terms);
    if (yes && !offerValid(o, ctx)) { Sim.tell(o.from, name(o.decider) + ' could not accept: the offer no longer holds.', -1, 'info', false); return { ok: true, text: 'That offer is no longer valid.' }; }
    const r = finish(o.action, o.from, o.to, ctx, { yes, why: yes ? 'accepted' : 'declined' });
    Sim.tell(o.from, name(o.decider) + (yes ? ' accepted' : ' declined') + ' your proposal' + (r && r.text ? ': ' + r.text : '.'), -1, yes ? 'win' : 'info', false);
    return r;
  }
  // declaring war from the diplomacy screen: costs political power unless a refused demand justifies it
  const DECLARE_COST = 25;
  function warCost(from, to) { const g = G(); return g.dip.claims[from + '>' + to] > g.hour ? 0 : DECLARE_COST; }
  function declare(from, to) {
    const g = G(), c = g.countries[from];
    const cost = warCost(from, to), pact = Sim.hasPact(from, to);
    if (c.pp < cost) return { ok: false, text: 'Not enough political power.' };
    if (!Sim.declareWar(from, to, false, { breakPact: true })) return { ok: false, text: 'War could not be declared.' };
    c.pp -= cost;
    if (pact) c.stab = Math.max(0, c.stab - 0.15);
    if (c.ws < 0.3) c.stab = Math.max(0, c.stab - 0.08);
    return { ok: true, text: 'War declared on ' + name(to) + '.' };
  }
  function describe(action, from, to, t) {
    const f = name(from);
    switch (action) {
      case 'pact': return f + ' proposes a non-aggression pact for two years.';
      case 'trade': {
        const good = Economy.goodName(t.good).toLowerCase();
        return t.sell ? f + ' offers to sell you ' + t.amount + ' ' + good + ' a day for ' + t.price + ' gold a day.'
          : f + ' wants to buy ' + t.amount + ' ' + good + ' a day from you for ' + t.price + ' gold a day.';
      }
      case 'join': return f + ' asks to join the ' + t.fac.name + '.';
      case 'invite': return f + ' invites you to join the ' + t.fac.name + '.';
      case 'demand': return f + ' demands ' + demandTargets(from, to).map(id => MAP().provs[id].name).join(', ') + '. Refusing may mean war.';
      case 'peace': return f + ' offers ' + (t.keep ? 'peace on their terms: they keep the land they hold.' : 'a white peace: all occupied land goes back.');
    }
    return f + ' makes a proposal.';
  }
  function finish(action, from, to, t, ans) {
    const g = G(), res = (accepted, text) => ({ ok: true, accepted, text });
    const who = action === 'join' ? t.fac.leader : to;
    if (!ans.yes) {
      setCd(action + '|' + from + '|' + (action === 'join' ? t.fac.id : to), action === 'demand' ? 60 : 30);
      if (action === 'demand') {
        addRel(from, to, -30);
        g.dip.claims[from + '>' + to] = g.hour + YEAR;   // a refused demand justifies war
        log(name(to) + ' refused the demands of ' + name(from) + '.', g.countries[to].capital, 'war', false);
        // an AI that makes demands backs them with force
        if (from !== g.player && alive(from) && alive(to) && Sim.rng() < 0.75) Sim.declareWar(from, to);
      } else addRel(from, who, -3);
      return res(false, name(who) + ' refused: ' + ans.why + '.');
    }
    switch (action) {
      case 'pact':
        g.dip.pacts[Sim.pairKey(Sim.root(from), Sim.root(to))] = g.hour + 2 * YEAR; addRel(from, to, 10);
        log(name(from) + ' and ' + name(to) + ' signed a non-aggression pact.', g.countries[to].capital);
        return res(true, name(to) + ' signed a non-aggression pact. Neither of you can declare war on the other for two years without breaking it.');
      case 'trade': {
        const d = Economy.sign(from, to, t); addRel(from, to, 5);
        const good = Economy.goodName(d.good).toLowerCase();
        if (from === g.player || to === g.player) log(name(d.from) + ' now sells ' + d.amount + ' ' + good + ' a day to ' + name(d.to) + ' for ' + d.price + ' gold.', g.countries[to].capital);
        return res(true, name(to) + ' agreed: ' + name(d.from) + ' sells ' + d.amount + ' ' + good + ' a day to ' + name(d.to) + ' for ' + d.price + ' gold a day.');
      }
      case 'join':
        joinFaction(from, t.fac);
        return res(true, 'You joined the ' + t.fac.name + '.');
      case 'invite':
        joinFaction(to, t.fac);
        return res(true, name(to) + ' joined the ' + t.fac.name + '.');
      case 'demand': {
        const provs = demandTargets(from, to);
        for (const id of provs) transferProvince(id, from);
        addRel(from, to, -40);
        log(name(to) + ' ceded ' + provs.map(id => MAP().provs[id].name).join(', ') + ' to ' + name(from) + '.', provs[0], 'loss', false);
        return res(true, name(to) + ' gave in and ceded ' + provs.length + ' province' + (provs.length > 1 ? 's' : '') + '.');
      }
      case 'peace':
        makePeace(from, to, !!t.keep);
        return res(true, 'Peace with ' + name(to) + '.');
    }
    return res(true, '');
  }

  function enterFaction(tag, f) {
    const g = G();
    f.members.push(tag); g.dip.facOf[tag] = f.id;
    addRel(tag, f.leader, 15);
    // members stand together: the newcomer joins the faction's wars, and the faction joins the newcomer's
    for (const w of g.wars) {
      const mine = Sim.sideOf(w, tag);
      const theirs = f.members.filter(m => m !== tag).map(m => Sim.sideOf(w, m)).find(Boolean);
      const side = mine || theirs;
      if (!side || (mine && theirs)) continue;
      const list = side === 'att' ? w.attackers : w.defenders;
      const joiners = mine ? f.members.flatMap(m => Sim.family(m)) : Sim.family(tag);
      for (const t of joiners) if (!Sim.sideOf(w, t)) list.push(t);
    }
    log(name(tag) + ' joined the ' + f.name + '.', g.countries[tag].capital, 'info', false);
  }
  function leaveFaction(tag) {
    const g = G(), f = Sim.factionOf(tag);
    if (!f) return;
    f.members = f.members.filter(m => m !== tag); delete g.dip.facOf[tag];
    addRel(tag, f.leader, -25);
    if (!f.members.length) g.dip.factions = g.dip.factions.filter(x => x !== f);
    else if (f.leader === tag) f.leader = f.members[0];
    log(name(tag) + ' left the ' + f.name + '.', g.countries[tag].capital, 'info', false);
  }
  function transferProvince(id, tag) {
    const g = G();
    g.owner[id] = tag; g.ownVer++;
    evacuate();
  }
  // armies left standing where they may no longer be go to the nearest friendly province
  function evacuate() {
    const g = G(), provs = MAP().provs;
    for (const a of g.armies) {
      const o = g.owner[a.prov];
      if (o === a.owner || Sim.allied(a.owner, o) || Sim.atWar(a.owner, o)) {
        if (a.path.length && !Sim.canEnter(a.owner, a.path[0])) { a.path = []; a.progress = 0; }
        continue;
      }
      const seen = new Set([a.prov]); let fr = [a.prov], dest = -1;
      for (let d = 0; d < 40 && fr.length && dest < 0; d++) {
        const nx = [];
        for (const q of fr) for (const n of provs[q].nb) {
          if (seen.has(n)) continue; seen.add(n);
          const on = g.owner[n];
          if (on === a.owner || Sim.allied(a.owner, on)) { dest = n; break; }
          nx.push(n);
        }
        fr = nx;
      }
      if (dest < 0) { const c = g.countries[a.owner]; dest = c.capital >= 0 && g.owner[c.capital] === a.owner ? c.capital : provs.findIndex(p => g.owner[p.id] === a.owner); }
      if (dest < 0) { Sim.removeArmy(a); continue; }
      if (a.battle) { const b = g.battles.find(x => x.id === a.battle); if (b) b.attackers = b.attackers.filter(id => id !== a.id); a.battle = 0; }
      a.prov = dest; a.path = []; a.progress = 0; a.lead = null; a.order = 'hold'; a.target = -1;
    }
  }
  // peace between `from`'s coalition and `to`'s coalition in every war they fight each other
  function makePeace(from, to, keep) {
    const g = G();
    const A = Sim.coalition(from), B = Sim.coalition(to);
    for (const w of warsBetweenSides(from, to)) {
      const sideA = Sim.sideOf(w, from);
      const leaderEnemy = sideA === 'att' ? w.leaderD : w.leaderA;
      const whole = B.includes(leaderEnemy) || Sim.coalition(leaderEnemy).includes(to);
      const outA = whole ? (sideA === 'att' ? w.attackers : w.defenders).slice() : A.filter(t => Sim.sideOf(w, t) === sideA);
      const outB = whole ? (sideA === 'att' ? w.defenders : w.attackers).slice() : B.filter(t => Sim.sideOf(w, t) && Sim.sideOf(w, t) !== sideA);
      // land: occupied provinces go back, except what the winner keeps under harsh terms
      for (const p of MAP().provs) {
        const o = g.owner[p.id];
        if (p.core === o || !alive(p.core)) continue;
        if (outA.includes(p.core) && outB.includes(o)) g.owner[p.id] = p.core;                 // the loser always hands back
        else if (outB.includes(p.core) && outA.includes(o) && !keep) g.owner[p.id] = p.core;   // white peace: winner too
      }
      if (whole) g.wars = g.wars.filter(x => x !== w);
      else {
        const drop = new Set(outB);
        w.attackers = w.attackers.filter(t => !drop.has(t)); w.defenders = w.defenders.filter(t => !drop.has(t));
        if (!w.attackers.length || !w.defenders.length) g.wars = g.wars.filter(x => x !== w);
      }
      for (const a of outA) for (const b of outB) g.dip.pacts[Sim.pairKey(Sim.root(a), Sim.root(b))] = Math.max(g.dip.pacts[Sim.pairKey(Sim.root(a), Sim.root(b))] || 0, g.hour + YEAR); // one-year truce
      log('The ' + w.name + ' ended' + (whole ? '' : ' for ' + name(to)) + (keep ? '. ' + name(from) + ' keeps the land it holds.' : ' in a white peace.'), g.countries[to].capital, 'win', false);
    }
    for (const b of g.battles.slice()) if (!Sim.atWar(b.atkTag, b.defTag)) Sim.endBattle(b);
    g.ownVer++;
    evacuate();
    addRel(from, to, 20);
  }

  // ---------- daily upkeep and AI diplomacy ----------
  function dayTick() {
    // unanswered offers to people lapse after a month
    const g0 = G();
    if (g0.dip.offers && g0.dip.offers.length) g0.dip.offers = g0.dip.offers.filter(o => g0.hour - o.hour < 24 * 30 && g0.countries[o.decider] && g0.countries[o.decider].alive);
    const g = G(), day = Math.floor(g.hour / DAY);
    for (const k of Object.keys(g.dip.pacts)) if (g.dip.pacts[k] <= g.hour) delete g.dip.pacts[k];
    // relation changes fade slowly
    if (day % 30 === 0) for (const k of Object.keys(g.dip.rel)) { g.dip.rel[k] *= 0.97; if (Math.abs(g.dip.rel[k]) < 0.5) delete g.dip.rel[k]; }
    // each nation thinks about diplomacy about once a month, spread over the days
    for (const c of Object.values(g.countries)) {
      if (!c.alive || Sim.isHuman(c.tag)) continue;
      if ((day + c.tag.charCodeAt(0) * 3 + c.tag.charCodeAt(1)) % 30 !== 0) continue;
      aiThink(c);
    }
  }
  function aiThink(c) {
    const g = G(), tag = c.tag, R = Sim.rng;
    // trade: buy what it lacks, sell what it has spare, and build (puppets too)
    if (typeof Economy !== 'undefined') Economy.aiTrade(c);
    if (Sim.root(tag) !== tag) return;                  // puppets follow their overlord
    const others = Object.values(g.countries).filter(o => o.alive && o.tag !== tag);
    // warm up to whoever it needs: a seller of what it lacks that is too cold to trade with, its suppliers, else like-minded neighbours
    let friend = null;
    if (typeof Economy !== 'undefined' && c.eco && c.eco.need) {
      const lack = Economy.GOODS.filter(k => Economy.needOf(tag, k) >= 0.4);
      friend = others.filter(o => !Sim.atWar(tag, o.tag) && rel(tag, o.tag) < 0 && rel(tag, o.tag) > -50 && lack.some(k => Economy.balance(o.tag, k) > 1))
        .sort((a, b) => rel(tag, b.tag) - rel(tag, a.tag))[0]
        || others.filter(o => rel(tag, o.tag) < 40 && g.dip.trade.some(d => d.from === o.tag && d.to === tag && Economy.dependence(tag, d.good, o.tag) > 0.25))[0];
    }
    if (!friend) friend = others.filter(o => o.gov === c.gov && borders(tag, o.tag) && !Sim.atWar(tag, o.tag))[Math.floor(R() * 4)];
    if (friend && c.pp > 40) aiDo('improve', tag, friend.tag);
    const threat = threatOf(tag);
    const fac = Sim.factionOf(tag);
    if (isMajor(tag)) {
      // majors found factions and bring in friends
      if (!fac && g.hour > 90 * DAY && R() < 0.35 && c.gov !== 'Neutral') aiDo('create', tag);
      const f = Sim.factionOf(tag);
      if (f && f.leader === tag) {
        const cand = others.filter(o => !Sim.factionOf(o.tag) && Sim.root(o.tag) === o.tag && !Sim.isHuman(o.tag) && rel(tag, o.tag) >= (threatOf(o.tag) ? 25 : 45)).sort((a, b) => rel(tag, b.tag) - rel(tag, a.tag))[0];
        if (cand) aiDo('invite', tag, cand.tag);
        // occasionally invite the player too, if friendly
        if (!Sim.factionOf(g.player) && rel(tag, g.player) >= 45 && R() < 0.3) aiDo('invite', tag, g.player);
      }
      // protect small friends that are threatened
      const ward = others.filter(o => !isMajor(o.tag) && o.gov === c.gov && threatOf(o.tag) && threatOf(o.tag) !== tag && !g.dip.guar.some(x => x.by === tag && x.of === o.tag) && !Sim.atWar(tag, o.tag))[0];
      if (ward && R() < 0.4) aiDo('guarantee', tag, ward.tag);
    } else if (threat && !fac) {
      // small nations under threat look for protection
      const prot = g.dip.factions.filter(f => !f.members.includes(threat) && !Sim.allied(threat, f.leader)).sort((a, b) => rel(tag, b.leader) - rel(tag, a.leader))[0];
      if (prot && rel(tag, prot.leader) >= 25) aiDo('join', tag, prot.leader);
      else if (rel(tag, threat) > -40) aiDo('pact', tag, threat);
    }
    // a nation strangled by an embargo may fight over it
    for (const k of Object.keys(g.dip.claims)) {
      const [a, b] = k.split('>');
      if (a !== tag || g.dip.claims[k] <= g.hour || !alive(b) || Sim.atWar(tag, b)) continue;
      if (g.dip.embargo.some(x => x.by === b && x.of === tag) && sidePower(Sim.coalition(tag)) > sidePower(Sim.coalition(b)) * 1.2 && R() < 0.3) { Sim.declareWar(tag, b, false, { breakPact: true }); break; }
    }
    // embargo a hated rival that buys from it, if it is a major power
    if (isMajor(tag) && R() < 0.05) {
      const foe = others.find(o => rel(tag, o.tag) < -50 && !Sim.atWar(tag, o.tag) && g.dip.trade.some(d => d.from === tag && d.to === o.tag));
      if (foe) aiDo('embargo', tag, foe.tag);
    }
    // expansionist regimes press claims on weak neighbours, and go to war when refused
    // ...but only when it is ready: no war already, no stronger neighbour at its back, stores and treasury able to carry a war
    if ((bloc(c.gov) === 'Authoritarian' || bloc(c.gov) === 'Communist') && c.ws >= 0.5 && g.hour > 300 * DAY && !Sim.isAtWar(tag) && R() < 0.12 && warReady(c)) {
      const mine = sidePower(Sim.coalition(tag));
      const victim = others.filter(o => borders(tag, o.tag) && !Sim.allied(tag, o.tag) && !Sim.hasPact(tag, o.tag) && rel(tag, o.tag) < 0 && o.tag !== threat)
        // a nation already fighting someone else can spare only part of its army
        .map(o => ({ o, v: sidePower(Sim.coalition(o.tag).concat(guaranteedBy(o.tag))) * (Sim.isAtWar(o.tag) ? 0.6 : 1) }))
        // it would lose goods it buys from the victim: it needs a bigger edge to make that worth it
        .map(x => ({ ...x, need: 1.8 + (typeof Economy !== 'undefined' ? Economy.GOODS.reduce((s, k) => s + Economy.dependence(tag, k, x.o.tag), 0) : 0) }))
        .filter(x => x.v * x.need < mine).sort((a, b) => a.v - b.v)[0];
      if (victim && !g.dip.plan[tag]) g.dip.plan[tag] = { victim: victim.o.tag, at: g.hour + 30 * DAY };
    }
    // a month after deciding, cut the trade (done in Economy.aiTrade) and make the demand
    const plan = g.dip.plan[tag];
    if (plan && g.hour >= plan.at) {
      delete g.dip.plan[tag];
      if (alive(plan.victim) && !Sim.atWar(tag, plan.victim)) aiDo('demand', tag, plan.victim);
    }
    // losing wars: sue for peace. Also when clearly outmatched, or when the treasury and stores are giving out.
    const broke = c.eco && c.eco.gold < 0 && c.eco.debtDays > 60;
    const starving = typeof Economy !== 'undefined' && c.eco && c.eco.need && Economy.needOf(tag, 'food') >= 1 && c.eco.sat.food < 0.7;
    for (const e of Sim.enemiesOf(tag)) {
      const ws = warScore(tag, e), odds = sidePower(Sim.coalition(tag)) / Math.max(1, sidePower(Sim.coalition(e)));
      if ((ws < -45 && R() < 0.5) || (ws < -15 && odds < 0.5 && R() < 0.4) || ((broke || starving) && ws < 5 && R() < 0.3)) { aiDo('peace', tag, e, { keep: true }); break; }
    }
  }
  // can it afford a new war? a sound treasury, food and fuel not running out, equipment for its army
  function warReady(c) {
    const tag = c.tag, e = c.eco;
    if (e && e.need && typeof Economy !== 'undefined') {
      if (e.gold < 0 || e.goldDelta < -2) return false;
      if (Economy.needOf(tag, 'food') >= 0.7 || Economy.needOf(tag, 'fuel') >= 0.7) return false;
    }
    const divs = G().armies.filter(a => a.owner === tag).reduce((s, a) => s + a.units.length, 0);
    if (divs < Math.max(2, (c.baseDivs || 4) * 0.9)) return false;      // rebuild the army first
    return true;
  }
  function aiDo(action, from, to, terms) {
    if (!can(action, from, to, terms).ok) return null;
    const r = act(action, from, to, terms);
    return r.ok ? r : null;
  }

  // events and peace terms put a nation into a faction directly
  function joinFaction(tag, f) {
    const g = G();
    if (!f || f.members.includes(tag)) return;
    if (Sim.factionOf(tag)) leaveFaction(tag);
    f.members.push(tag); g.dip.facOf[tag] = f.id;
  }
  // a historical event's "join": the nation enters the faction and takes up its wars (America in 1917)
  function joinFactionWars(tag, f) {
    if (!f || f.members.includes(tag)) return;
    if (Sim.factionOf(tag)) leaveFaction(tag);
    enterFaction(tag, f);
  }
  return { hooks, COST, AID_EQ, DECLARE_COST, warCost, declare, answerOffer, offerValid, rel, addRel, borders, can, act, answer, warScore, threatOf, power, demandTargets, dayTick, makePeace, describe, guaranteedBy,
    joinFaction, joinFactionWars, leaveFaction, transferProvince, evacuate, warsBetweenSides };
})();
