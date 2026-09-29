// Interface: start screen, top bar, dossier panels, army tray, orders and input.
'use strict';
const UI = (function () {
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let MAP;
  const sel = { prov: -1, armies: [], battle: 0, tab: 'army', fleet: 0, wing: 0, zone: -1 };
  let pending = null; // {kind, armies}
  let startPick = 'GER';
  const HPS = [0, 3, 8, 18, 36, 72]; // game hours per real second by speed level
  const DECLARE_COST = 25;

  // ---------- formatting ----------
  function fmtN(n) {
    n = Math.round(n);
    if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 1 : 2).replace(/\.?0+$/, '') + 'M';
    if (Math.abs(n) >= 1e4) return Math.round(n / 1e3) + 'K';
    if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
    return String(n);
  }
  const pct = v => Math.round(v * 100) + '%';
  // only touch the DOM when content changed, so buttons stay put under the cursor
  // (and keep the scroll position: replacing the content would otherwise jump a scrolled list back to the top)
  function setHTML(el, html) {
    if (el._html === html) return false;
    const top = el.scrollTop, left = el.scrollLeft;
    el._html = html; el.innerHTML = html;
    if (top) el.scrollTop = top;
    if (left) el.scrollLeft = left;
    return true;
  }
  let lockUntil = 0;
  let hoverEl = null;
  let hoverBtn = false;
  document.addEventListener('pointerover', e => { hoverEl = e.target.closest ? e.target.closest('#rightpanel, #leftpanel, #bottombar') : null; hoverBtn = !!(hoverEl && e.target.closest('button, .row')); }, true);
  // While a button is held down, nothing on screen is rebuilt: otherwise the periodic refresh swaps the
  // element between press and release, the browser drops the click, and the player has to click twice.
  document.addEventListener('pointerdown', e => { if (e.target.id !== 'map') lockUntil = Infinity; }, true);
  const unlock = () => { if (lockUntil === Infinity) lockUntil = performance.now() + 250; };
  document.addEventListener('pointerup', unlock, true);
  document.addEventListener('pointercancel', unlock, true);
  // a mouse-clicked button must not keep focus, or Space (pause) would press it again
  document.addEventListener('click', e => { if (e.detail > 0) { const b = e.target.closest && e.target.closest('button'); if (b) setTimeout(() => b.blur(), 0); } }, true);

  // ---------- flags (original abstract designs) ----------
  function hash(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
  function shade(hex, f) { const n = parseInt(hex.slice(1), 16); const r = n >> 16 & 255, g = n >> 8 & 255, b = n & 255; const m = v => Math.max(0, Math.min(255, Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f))); return 'rgb(' + m(r) + ',' + m(g) + ',' + m(b) + ')'; }
  let flagCache = {};
  function flagSVG(tag) {
    if (flagCache[tag]) return flagCache[tag];
    // in a historical era the era's own flag wins; the 1936 flags must not leak onto a tag reused by another era
    const inEra = typeof Eras !== 'undefined' && !Eras.isBase();
    const eraFlag = inEra && Eras.flagFor(tag);
    if (eraFlag) return (flagCache[tag] = eraFlag);
    if (!inEra && typeof FLAGS !== 'undefined' && FLAGS[tag]) return (flagCache[tag] = `<svg class="flag" viewBox="0 0 30 20" preserveAspectRatio="none" aria-hidden="true">${FLAGS[tag]}</svg>`);
    const c = COUNTRY_BY_TAG[tag].color, h = hash(tag);
    const L = '#ece4cc', D = shade(c, -0.55), A = shade(c, 0.35);
    const pick = h % 8;
    let body = '';
    const starPath = (cx, cy, r) => { let d = ''; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * .42 : r; d += (i ? 'L' : 'M') + (cx + Math.cos(a) * rr).toFixed(1) + ',' + (cy + Math.sin(a) * rr).toFixed(1); } return d + 'Z'; };
    switch (pick) {
      case 0: body = `<rect width="30" height="20" fill="${c}"/><rect y="6.67" width="30" height="6.67" fill="${L}"/><rect y="13.33" width="30" height="6.67" fill="${D}"/>`; break;
      case 1: body = `<rect width="30" height="20" fill="${L}"/><rect width="10" height="20" fill="${c}"/><rect x="20" width="10" height="20" fill="${D}"/>`; break;
      case 2: body = `<rect width="30" height="20" fill="${c}"/><rect width="13" height="10" fill="${D}"/><path d="${starPath(6.5, 5, 3.4)}" fill="${L}"/>`; break;
      case 3: body = `<rect width="30" height="20" fill="${c}"/><circle cx="15" cy="10" r="6" fill="${L}"/><circle cx="15" cy="10" r="3" fill="${D}"/>`; break;
      case 4: body = `<rect width="30" height="20" fill="${c}"/><rect x="8" width="4" height="20" fill="${L}"/><rect y="8" width="30" height="4" fill="${L}"/><rect x="9" width="2" height="20" fill="${D}"/><rect y="9" width="30" height="2" fill="${D}"/>`; break;
      case 5: body = `<rect width="30" height="20" fill="${c}"/><path d="M0,20 L0,15 L22,0 L30,0 L30,5 L8,20Z" fill="${L}"/><path d="M0,20 L0,17.5 L26,0 L30,0 L4,20Z" fill="${D}"/>`; break;
      case 6: body = `<rect width="30" height="10" fill="${c}"/><rect y="10" width="30" height="10" fill="${A}"/><path d="M0,0 L12,10 L0,20Z" fill="${D}"/><path d="${starPath(4.2, 10, 2.6)}" fill="${L}"/>`; break;
      default: body = `<rect width="30" height="20" fill="${D}"/><rect x="2" y="2" width="26" height="16" fill="${c}"/><path d="M15,4 L20,10 L15,16 L10,10Z" fill="${L}"/>`;
    }
    return (flagCache[tag] = `<svg class="flag" viewBox="0 0 30 20" preserveAspectRatio="none" aria-hidden="true">${body}</svg>`);
  }
  function unitIcon(type, color) {
    const s = UNIT_TYPES[type].symbol;
    const paths = { inf: 'M2,2 L28,18 M28,2 L2,18', arm: '', mec: 'M2,2 L28,18 M28,2 L2,18', mot: 'M2,2 L28,18 M28,2 L2,18 M15,2 L15,18', art: '', rec: 'M2,18 L28,2', mar: 'M2,2 L28,18 M28,2 L2,18 M7,17 Q15,23 23,17', par: 'M2,2 L28,18 M28,2 L2,18 M7,7 Q15,-2 23,7' };
    let extra = '';
    if (s === 'arm' || s === 'mec') extra = '<ellipse cx="15" cy="10" rx="10" ry="5.5" fill="none" stroke="#141414" stroke-width="1.6"/>';
    if (s === 'art') extra = '<circle cx="15" cy="10" r="3" fill="#141414"/>';
    return `<svg viewBox="0 0 30 20" aria-hidden="true"><rect x="1" y="1" width="28" height="18" fill="${color}" stroke="#141414" stroke-width="1.6"/><path d="${paths[s] || ''}" stroke="#141414" stroke-width="1.6" fill="none"/>${extra}</svg>`;
  }

  // ---------- init ----------
  function init(map) {
    MAP = map;
    bindMap();
    bindKeys();
    $('#tb-play').onclick = togglePause;
    $('#tb-slower').onclick = () => setSpeed(Sim.G.speed - 1);
    $('#tb-faster').onclick = () => setSpeed(Sim.G.speed + 1);
    $('#tb-menu').onclick = openMenu;
    $('#tb-nation').onclick = () => { const G = Sim.G; if (!G) return; selectProvince(G.countries[G.player].capital, true); };
    // clicking the open tab folds the panel away; any tab opens it again
    document.querySelectorAll('.tab').forEach(t => t.onclick = () => { const same = sel.tab === t.dataset.tab; sel.collapsed = same && !sel.collapsed; sel.tab = t.dataset.tab; renderRight(); if (!same) $('#rp-body').scrollTop = 0; });
    $('#mc-pol').onclick = () => setMode('political');
    $('#mc-ter').onclick = () => setMode('terrain');
    $('#mc-trade').onclick = () => setMode(Render.state.mode === 'trade' ? 'political' : 'trade');
    $('#mc-sea').onclick = () => setMode(Render.state.mode === 'sea' ? 'political' : 'sea');
    $('#mc-in').onclick = () => Render.zoomSmooth(Render.size[0] / 2, Render.size[1] / 2, 1.5);
    $('#mc-out').onclick = () => Render.zoomSmooth(Render.size[0] / 2, Render.size[1] / 2, 1 / 1.5);
    $('#mc-world').onclick = () => Render.fitWorld();
    Sim.hooks.notify = toast;
    Sim.hooks.pause = () => refreshTop();
    Sim.hooks.gameOver = gameOver;
    Diplo.hooks.offer = (o, respond) => {
      // an offer is answered later, so check it still makes sense when the player accepts
      const valid = () => {
        const G = Sim.G, war = Sim.atWar(o.from, o.to);
        if (!G.countries[o.from].alive) return false;
        if (o.action === 'peace') return war;
        if (war) return false;
        if (o.action === 'invite') return !Sim.factionOf(G.player) && G.dip.factions.includes(o.terms.fac);
        if (o.action === 'join') return G.dip.factions.includes(o.terms.fac) && !Sim.factionOf(o.from);
        if (o.action === 'trade') return Economy.canDeal(o.from, o.to, o.terms).ok;
        return true;
      };
      // offers from an earlier game are dropped, never answered
      const game = Sim.G;
      for (let i = offers.length - 1; i >= 0; i--) if (offers[i].game !== game) offers.splice(i, 1);
      offers.push({ o, game, respond: yes => Sim.G !== game ? null : yes && !valid() ? (respond(false), { text: 'That offer is no longer valid.' }) : respond(yes) });
      // ignored offers lapse: keep only the three newest
      while (offers.length > 3) offers.splice(1, 1)[0].respond(false);
      showOffer();
    };
  }
  function setMode(m) {
    Render.state.mode = m; Render.state.dirtyOwners = true;
    $('#mc-pol').classList.toggle('active', m === 'political'); $('#mc-ter').classList.toggle('active', m === 'terrain'); $('#mc-trade').classList.toggle('active', m === 'trade'); $('#mc-sea').classList.toggle('active', m === 'sea');
  }

  // ---------- start screen ----------
  const MAJORS_1936 = ['GER', 'FRA', 'ENG', 'SOV', 'ITA', 'USA', 'JAP', 'CHI', 'POL', 'SPA', 'TUR', 'ROM'];
  let MAJORS = MAJORS_1936;
  // the twelve strongest nations of an era, by armies and industry
  const majorsFor = () => typeof Eras === 'undefined' || Eras.isBase() ? MAJORS_1936
    : COUNTRY_DEFS.filter(d => d.divs > 0 && !d.unclaimed).sort((a, b) => (b.divs + b.mil * 2 + b.civ) - (a.divs + a.mil * 2 + a.civ)).slice(0, 12).map(d => d.tag);
  function pickEra(id) {
    Sim.G = null; // eras are picked before a game starts; drop any finished game
    Eras.apply(MAP, id);
    flagCache = {}; MAJORS = majorsFor(); startPick = MAJORS[0];
    if (typeof Figures !== 'undefined' && Figures.reset) Figures.reset();
    Render.refreshAll();
    showStart();
  }
  function countryFacts(tag) {
    const d = COUNTRY_BY_TAG[tag];
    const provs = MAP.provs.filter(p => p.owner === tag);
    const res = {};
    provs.forEach(p => { for (const k in p.res) res[k] = (res[k] || 0) + p.res[k]; });
    return { d, provs: provs.length, res };
  }
  function showStart() {
    $('#start').hidden = false;
    if (typeof Eras !== 'undefined') {
      const cur = Eras.isBase() ? Eras.BASE_ID : Eras.info().id;
      $('#st-eras').innerHTML = Eras.list().map(e => `<button data-era="${e.id}" class="${e.id === cur ? 'sel' : ''}" title="${esc(e.name)}">${esc(e.label)}</button>`).join('');
      document.querySelectorAll('#st-eras button').forEach(b => b.onclick = () => { if (b.dataset.era !== cur) pickEra(b.dataset.era); });
      const e = Eras.list().find(x => x.id === cur);
      $('#st-year').textContent = 'THE WORLD · ' + (e ? e.label : '1936') + (e && e.id !== Eras.BASE_ID ? ' · ' + e.name.toUpperCase() : '');
    }
    const majors = $('#st-majors');
    majors.innerHTML = MAJORS.map(t => `<button class="ncard" data-tag="${t}">${flagSVG(t)}<span><b>${esc(COUNTRY_BY_TAG[t].name)}</b><small>${COUNTRY_BY_TAG[t].gov}</small></span></button>`).join('');
    const renderAll = q => {
      $('#st-all').innerHTML = COUNTRY_DEFS.filter(d => !MAJORS.includes(d.tag) && d.divs > 0 && d.name.toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(d => `<button class="ncard" data-tag="${d.tag}">${flagSVG(d.tag)}<span><b>${esc(d.name)}</b><small>${d.diff}</small></span></button>`).join('');
      bindCards();
    };
    const bindCards = () => document.querySelectorAll('#start .ncard').forEach(b => b.onclick = () => pickStart(b.dataset.tag));
    $('#st-search').oninput = e => renderAll(e.target.value);
    renderAll('');
    $('#st-play').onclick = () => startGame(startPick);
    pickStart(startPick);
  }
  function pickStart(tag) {
    const d = COUNTRY_BY_TAG[tag];
    if (!d.divs) return;
    startPick = tag;
    $('#st-play').textContent = 'Play as ' + d.name;
    document.querySelectorAll('#start .ncard').forEach(b => b.classList.toggle('sel', b.dataset.tag === tag));
    const f = countryFacts(tag);
    const dl = ['Very easy', 'Easy', 'Normal', 'Hard', 'Very hard'].indexOf(d.diff);
    $('#st-flag').outerHTML = flagSVG(tag).replace('class="flag"', 'class="flag" id="st-flag"');
    $('#st-name').textContent = d.name;
    $('#st-gov').textContent = d.gov + (d.overlord ? ' · subject of ' + COUNTRY_BY_TAG[d.overlord].name : '');
    $('#st-diff').innerHTML = '<div class="diff">' + [0, 1, 2, 3, 4].map(i => `<i class="${i <= dl ? 'on' : ''}"></i>`).join('') + '</div><span class="label">' + d.diff + '</span>';
    $('#st-nums').innerHTML = `<div><b>${fmtN(d.pop * 1e6)}</b><span>Population</span></div><div><b>${d.civ + d.mil}</b><span>Factories (${d.civ} civ · ${d.mil} mil)</span></div>
      <div><b>${d.divs}</b><span>Divisions</span></div><div><b>${f.provs}</b><span>Provinces</span></div>`;
    const rn = { steel: 'Steel', oil: 'Oil', coal: 'Coal', aluminium: 'Aluminium', rubber: 'Rubber', rare: 'Rare materials' };
    $('#st-res').innerHTML = Object.keys(rn).map(k => `<span>${rn[k]} ${f.res[k] || 0}</span>`).join('');
    $('#st-sit').textContent = d.sit;
    Render.state.selProv = -1;
    const cap = MAP.provs.find(p => p.capital && p.cityTag === tag);
    if (cap) Render.flyTo(cap.x + (window.innerWidth > 820 ? 4 : 0), cap.y, Math.max(Render.minZoom() * 1.2, tag === 'SOV' || tag === 'CHI' || tag === 'USA' ? 4 : 7));
  }
  function startGame(tag) {
    Sim.newGame(tag);
    offers.length = 0; $('#offer').hidden = true; sel.tf = null; sel.dip = null;
    $('#start').hidden = true;
    $('#hud').hidden = false;
    Render.state.dirtyOwners = true;
    const cap = MAP.provs[Sim.G.countries[tag].capital];
    Render.flyTo(cap.x, cap.y, 9);
    sel.armies = []; sel.prov = -1; sel.fleet = 0; sel.wing = 0; sel.zone = -1;
    Render.state.selFleet = 0; Render.state.selWing = 0; Render.state.selZone = -1;
    // paint the player's troops first, then everyone they border; others are painted when they first come into view
    { const G = Sim.G, near = new Set([tag]); MAP.provs.forEach(p => { if (G.owner[p.id] === tag) p.nb.forEach(n => near.add(G.owner[n])); }); Figures.warm([...near].filter(t => G.countries[t] && G.countries[t].alive)); }
    sel.collapsed = innerWidth <= 820; // small screens start with the map clear
    renderTrays(); renderRight(); refreshTop(); renderLeft();
    toast('You lead ' + Sim.G.countries[tag].name + '. Press Space or the play button to start the clock.', cap.id, 'info');
  }

  // ---------- top bar ----------
  function refreshTop() {
    const G = Sim.G; if (!G) return;
    const c = G.countries[G.player];
    setHTML($('#tb-nation'), flagSVG(c.tag) + `<span><div class="nm">${esc(c.name)}</div><div class="gov">${c.gov}</div></span>`);
    const divs = G.armies.filter(a => a.owner === c.tag).reduce((s, a) => s + a.units.length, 0);
    const stats = [
      ['Political power', Math.floor(c.pp), '', 'Earned daily. Declaring war costs ' + DECLARE_COST + '.'],
      ['Stability', pct(c.stab), c.stab < 0.4 ? 'bad' : c.stab < 0.55 ? 'warn' : '', 'Raises manpower growth and factory output.'],
      ['War support', pct(c.ws), c.ws < 0.25 ? 'warn' : '', 'Speeds up organisation recovery.'],
      ['Manpower', fmtN(c.manpower), c.manpower < 20000 ? 'bad' : '', 'Available recruits. Losses so far: ' + fmtN(c.losses)],
      ['Gold', fmtN(c.eco ? c.eco.gold : 0) + (c.eco && c.eco.goldDelta ? ' <small>' + (c.eco.goldDelta >= 0 ? '+' : '−') + fmtN(Math.abs(c.eco.goldDelta)) + '</small>' : ''), c.eco && c.eco.gold < 0 ? 'bad' : '', 'Treasury in ' + Economy.coin() + ', and the change per day. Taxes and exports bring it in; armies and imports cost it.'],
      [Economy.goodName('arms'), fmtN(c.equipment), c.equipment < 300 ? 'warn' : '', 'Made by your ' + Economy.kindName('arsenal').toLowerCase() + 's each day from ' + Economy.goodName('metal').toLowerCase() + ' and ' + Economy.goodName('fuel').toLowerCase() + '.'],
      ['Divisions', divs + (c.queue.length ? ' +' + c.queue.length : ''), '', 'Fielded divisions (+ in training).'],
      ['Wars', G.wars.filter(w => w.attackers.includes(c.tag) || w.defenders.includes(c.tag)).length, Sim.isAtWar(c.tag) ? 'bad' : '', 'Wars you are fighting.']
    ];
    setHTML($('#tb-stats'), stats.map(s => `<div class="stat ${s[2]}" title="${esc(s[3])}"><span class="v">${s[1]}</span><span class="k">${esc(s[0])}</span></div>`).join(''));
    const short = Economy.anyShort(c.tag);
    $('#tab-econ-dot').hidden = !short;
    $('#tb-date').textContent = Sim.dateStr(G.hour, true);
    $('#tb-play').classList.toggle('paused', G.paused);
    setHTML($('#tb-play'), G.paused ? '<svg viewBox="0 0 16 16"><path d="M4 2l10 6-10 6z" fill="currentColor"/></svg>' : '<svg viewBox="0 0 16 16"><path d="M3 2h4v12H3zM9 2h4v12H9z" fill="currentColor"/></svg>');
    $('#tb-play').setAttribute('aria-label', G.paused ? 'Resume' : 'Pause');
    setHTML($('#tb-speed'), [1, 2, 3, 4, 5].map(i => `<i class="${i <= G.speed ? 'on' : ''}" style="height:${4 + i * 2}px"></i>`).join(''));
  }
  function togglePause() { const G = Sim.G; if (!G || G.over) return; G.paused = !G.paused; refreshTop(); }
  function setSpeed(s) { const G = Sim.G; if (!G) return; G.speed = Math.max(1, Math.min(5, s)); refreshTop(); }

  // ---------- toasts ----------
  function toast(text, prov, kind) {
    const G = Sim.G;
    const el = document.createElement('div');
    el.className = 'toast ' + (kind || 'info');
    el.innerHTML = `<span class="d">${G ? Sim.dateStr(G.hour) : ''}</span>${esc(text)}`;
    const box = $('#toasts');
    box.prepend(el);
    while (box.children.length > 4) box.lastChild.remove();
    setTimeout(() => el.remove(), 7000);
    if (sel.tab === 'log') renderRight();
  }

  // ---------- left panel: province & country ----------
  function relationPill(tag) {
    const G = Sim.G;
    if (!G) return '';
    if (tag === G.player) return '<span class="pill self">Your nation</span>';
    if (Sim.atWar(tag, G.player)) return '<span class="pill war">At war</span>';
    if (Sim.allied(tag, G.player)) return '<span class="pill ally">Ally</span>';
    return '<span class="pill">Neutral</span>';
  }
  function selectProvince(id, fly) {
    sel.prov = id; Render.state.selProv = id;
    if (id >= 0) { sel.zone = -1; Render.state.selZone = -1; }
    if (fly && id >= 0) { const p = MAP.provs[id]; Render.flyTo(p.x, p.y, Math.max(Render.cam.z, 8)); }
    renderLeft();
  }
  function renderLeft() {
    const el = $('#leftpanel');
    const G = Sim.G;
    if (G && sel.prov < 0 && sel.zone >= 0) { renderZone(el); return; }
    if (sel.prov < 0 || !G) { el.hidden = true; return; }
    el.hidden = false;
    const p = MAP.provs[sel.prov];
    const owner = G.owner[p.id], oc = G.countries[owner];
    const I = (G.ind && G.ind[p.id]) || {};
    const indList = Economy.KIND_KEYS.filter(k => I[k]).map(k => esc(Economy.kindName(k)) + (I[k] > 1 ? ' ×' + I[k] : '')).join(', ') || 'None';
    const deps = Economy.GOODS.filter(k => Economy.dep(p.id, k)).map(k => goodDot(k) + esc(Economy.goodName(k))).join(', ') || 'None';
    const res = `<dt>Industry</dt><dd>${indList}</dd><dt>Slots</dt><dd>${Economy.freeSlots(p.id)} free of ${Economy.slots(p)}${Economy.built(p.id) > Economy.slots(p) ? ' (' + Economy.built(p.id) + ' built)' : ''}</dd><dt>Deposits</dt><dd>${deps}</dd>`;
    const INF = Economy.infraKinds().filter(k => Economy.infra(p.id, k));
    const works = `<dt>Military</dt><dd>${INF.map(k => esc(Economy.kindName(k)) + (Economy.INFRA[k].max > 1 ? ' ' + Economy.infra(p.id, k) : '')).join(', ') || 'None'}</dd>`
      + (Seas.isCoastal(p.id) ? `<dt>Coast</dt><dd>${Seas.zonesOf(p.id).map(z => `<a href="#" class="lnk" data-zone="${z}">${esc(Seas.zone(z).name)}</a>`).join(', ')}</dd>` : '')
      + (Air.bombDamage(p.id) > 0.01 ? `<dt>Bomb damage</dt><dd class="bad">${pct(Air.bombDamage(p.id))} of output lost</dd>` : '');
    const infraBtn = k => { const chk = Economy.canBuild(G.player, k, p.id); const lvl = Economy.infra(p.id, k); return `<button class="btn sm" data-pbuild="${k}" ${chk.ok ? '' : 'disabled'} title="${esc(chk.ok ? INFRA_TIP[k] : chk.why)}"><span>${esc(Economy.kindName(k))}${lvl && Economy.INFRA[k].max > 1 ? ' ' + (lvl + 1) : ''}</span><small>${Economy.buildCost(k, G.player, p.id).gold} gold</small></button>`; };
    const wingsHere = G.wings.filter(w => w.base === p.id);
    const buildHere = owner === G.player && !G.over ? `<div class="label" style="margin-top:6px">Build here</div><div class="builds">${Economy.KIND_KEYS.map(k => { const chk = Economy.canBuild(G.player, k, p.id); return `<button class="btn sm" data-pbuild="${k}" ${chk.ok ? '' : 'disabled'} title="${esc(chk.ok ? 'Makes about ' + f1(Economy.baseOut(k, p) * Economy.provMul(k, p, owner)) + ' ' + Economy.goodName(Economy.KINDS[k].good).toLowerCase() + ' a day' : chk.why)}"><span>${esc(Economy.kindName(k))}</span><small>${Economy.buildCost(k, G.player).gold} gold</small></button>`; }).join('')}</div>
      <div class="label" style="margin-top:6px">Military works</div><div class="builds">${Economy.infraKinds().filter(k => Economy.INFRA[k].needs !== 'air' || Air.available()).map(infraBtn).join('')}</div>` : '';
    const armies = G.armies.filter(a => a.prov === p.id && !(a.sea && a.sea.phase !== 'prep'));
    const armyRows = armies.map(a => {
      const comp = compStr(a);
      return `<div class="row click" data-army="${a.id}">${flagSVG(a.owner)}<div class="grow"><div>${esc(G.countries[a.owner].name)} ${esc(a.name)}</div><div class="sub">${comp}</div></div></div>`;
    }).join('') || '<div class="note">No troops present.</div>';
    const isCap = oc && oc.capital === p.id;
    const divs = G.armies.filter(a => a.owner === owner).reduce((s, a) => s + a.units.length, 0);
    const provCount = G.owner.filter(o => o === owner).length;
    const canDeclare = owner !== G.player && !Sim.atWar(owner, G.player) && !Sim.allied(owner, G.player) && !G.over;
    if (!setHTML(el, `<button class="close" aria-label="Close" id="lp-close">×</button>
      <div class="label">${isCap ? 'Capital province' : p.city ? 'City province' : 'Province'}</div>
      <h2 class="display" style="font-size:24px;margin:2px 0 6px">${esc(p.name)}</h2>
      <div class="owner">${flagSVG(owner)}<div><div>${esc(oc.name)}</div>${relationPill(owner)}</div></div>
      ${p.core !== owner ? `<div class="note">Occupied territory of ${esc(G.countries[p.core].name)}.</div>` : ''}
      <dl class="kv"><dt>Terrain</dt><dd>${TERRAIN[p.terrain].name}</dd><dt>Population</dt><dd>${fmtN(p.pop)}</dd>
      <dt>Infrastructure</dt><dd>Level ${p.infra}</dd>${res}${works}
      <dt>Units</dt><dd>${armies.reduce((s, a) => s + a.units.length, 0)} divisions</dd></dl>${buildHere}
      <div class="list">${armyRows}</div>
      ${wingsHere.length ? '<div class="label" style="margin-top:6px">Air wings based here</div><div class="list">' + wingsHere.map(w => `<div class="row click" data-wing="${w.id}">${flagSVG(w.owner)}<div class="grow"><div>${esc(w.name)}</div><div class="sub">${esc(Air.typeName(w.type))} · ${esc(Air.MISSIONS[w.mission].name)}</div></div></div>`).join('') + '</div>' : ''}
      <hr class="sep">
      <div class="label">Nation</div>
      <dl class="kv"><dt>Government</dt><dd>${oc.gov}</dd><dt>Capital</dt><dd>${oc.capital >= 0 ? esc(MAP.provs[oc.capital].name) : '—'}</dd>
      <dt>Provinces</dt><dd>${provCount}</dd><dt>Divisions</dt><dd>${divs}</dd><dt>Factories</dt><dd>${oc.civ + oc.mil}</dd>
      <dt>Manpower</dt><dd>${fmtN(oc.manpower)}</dd>${oc.overlord ? `<dt>Overlord</dt><dd>${esc(G.countries[oc.overlord].name)}</dd>` : ''}</dl>
      ${owner !== G.player ? `<div style="display:flex;gap:6px"><button class="btn" id="lp-dip" style="flex:1">Diplomacy</button>${canDeclare ? `<button class="btn danger" id="lp-war" style="flex:1" ${G.countries[G.player].pp < warCost(owner) ? 'disabled' : ''}>Declare war${warCost(owner) ? ' · ' + warCost(owner) + ' PP' : ''}</button>` : ''}</div>` : ''}`)) return;
    $('#lp-close').onclick = () => { selectProvince(-1); };
    el.querySelectorAll('[data-army]').forEach(r => r.onclick = () => selectArmies([+r.dataset.army], false));
    el.querySelectorAll('[data-zone]').forEach(r => r.onclick = e => { e.preventDefault(); selectZone(+r.dataset.zone, true); });
    el.querySelectorAll('[data-wing]').forEach(r => r.onclick = () => selectWing(+r.dataset.wing));
    el.querySelectorAll('[data-pbuild]').forEach(b => b.onclick = () => { const r = Economy.build(G.player, b.dataset.pbuild, p.id); toast(r.ok ? r.text : r.why, p.id, 'info'); renderLeft(); renderRight(); refreshTop(); });
    if (canDeclare) $('#lp-war').onclick = () => confirmWar(owner);
    if (owner !== G.player) $('#lp-dip').onclick = () => { sel.dip = owner; sel.tab = 'diplo'; sel.collapsed = false; renderRight(); };
  }
  function compStr(a) {
    const cnt = {};
    for (const u of a.units) cnt[u.type] = (cnt[u.type] || 0) + 1;
    return Object.keys(cnt).map(t => cnt[t] + ' ' + UNIT_TYPES[t].name).join(', ');
  }

  const INFRA_TIP = {
    port: 'Ships repair here, troops embark faster, and it feeds armies by sea while your navy keeps the route open.',
    dock: 'Builds warships: each level works on one hull at a time. Also speeds up repairs.',
    air: 'Bases 4 air wings per level.',
    hub: 'A supply source inland: armies nearby are supplied as if at home.',
    fort: 'Defenders here fight 15% better per level.',
    radar: 'Your fighters within 600 km fight 30% better, and your ships spot enemies off this coast more easily.'
  };
  function selectFleet(id) {
    sel.fleet = id; sel.wing = 0; Render.state.selFleet = id; Render.state.selWing = 0;
    if (id) { sel.armies = []; Render.state.selArmies = new Set(); sel.tab = 'navy'; sel.collapsed = false; }
    pending = null; showHint();
    renderRight(); renderTrays();
  }
  function selectWing(id) {
    sel.wing = id; sel.fleet = 0; Render.state.selWing = id; Render.state.selFleet = 0;
    if (id) { sel.armies = []; Render.state.selArmies = new Set(); sel.tab = 'navy'; sel.collapsed = false; }
    pending = null; showHint();
    renderRight(); renderTrays();
  }
  function selectZone(z, fly) {
    sel.zone = z; Render.state.selZone = z;
    if (z >= 0) { sel.prov = -1; Render.state.selProv = -1; if (fly) { const zz = Seas.zone(z); Render.flyTo(zz.x, zz.y, Math.max(Render.cam.z, 5)); } }
    renderLeft();
  }
  function renderZone(el) {
    const G = Sim.G, z = Seas.zone(sel.zone), me = G.player;
    el.hidden = false;
    const ctl = Navy.control(z.id), tot = Object.values(ctl).reduce((s, v) => s + v, 0);
    const ctlRows = Object.entries(ctl).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([t, v]) => `<div class="row">${flagSVG(t)}<div class="grow"><div>${esc(G.countries[t].name)}</div><div class="bar sup"><i style="width:${Math.round(v / tot * 100)}%"></i></div></div><span class="sub">${pct(v / tot)}</span></div>`).join('');
    const war = Sim.isAtWar(me);
    const fleets = G.fleets.filter(f => f.zone === z.id);
    const straits = Seas.straits.filter(s => s.a === z.id || s.b === z.id);
    const ports = z.coast.filter(pid => Navy.isPort(pid));
    const loss = war ? Navy.lossIn(me, z.id) : 0;
    const invs = G.armies.filter(a => a.sea && a.sea.zone === z.id);
    if (!setHTML(el, `<button class="close" aria-label="Close" id="lp-close">×</button>
      <div class="label">Sea zone</div>
      <h2 class="display" style="font-size:24px;margin:2px 0 6px">${esc(z.name)}</h2>
      <dl class="kv"><dt>Ports</dt><dd>${ports.length} on ${z.coast.length} coastal provinces</dd>
      ${war ? `<dt>Your sea control</dt><dd class="${Navy.superiority(me, z.id) < 0.4 ? 'bad' : ''}">${pct(Navy.superiority(me, z.id))}</dd><dt>Convoy losses</dt><dd class="${loss > 0.05 ? 'bad' : ''}">${loss > 0.005 ? pct(loss) + ' of your shipping sunk here' : 'None'}</dd>` : ''}
      <dt>Borders</dt><dd>${Seas.neighbours(z.id, me).map(([n]) => `<a href="#" class="lnk" data-zone="${n}">${esc(Seas.zone(n).name)}</a>`).join(', ')}</dd></dl>
      ${straits.map(st => `<div class="note">${esc(st.name)}: held by ${esc(G.countries[G.owner[st.prov]]?.name || 'nobody')}${st.year && new Date(Sim.dateTime()).getUTCFullYear() < st.year ? ', not yet built' : Seas.straitOpen(st, me) ? ', open to you' : ', closed to you'}.</div>`).join('')}
      <div class="label" style="margin-top:8px">Naval power here</div><div class="list">${ctlRows || '<div class="note">No warships here.</div>'}</div>
      ${fleets.length ? '<div class="label" style="margin-top:8px">Fleets</div><div class="list">' + fleets.map(f => fleetRow(f)).join('') + '</div>' : ''}
      ${invs.length ? '<div class="label" style="margin-top:8px">Landings</div><div class="list">' + invs.map(a => `<div class="row">${flagSVG(a.owner)}<div class="grow"><div>${esc(a.name)}</div><div class="sub">${esc(Navy.phaseText(a))}</div></div></div>`).join('') + '</div>' : ''}
      ${sel.fleet && Sim.G.fleets.some(f => f.id === sel.fleet && f.owner === me) ? `<button class="btn" id="lp-sail" style="width:100%;margin-top:8px">Send the selected fleet here</button>` : ''}`)) return;
    $('#lp-close').onclick = () => selectZone(-1);
    el.querySelectorAll('[data-zone]').forEach(r => r.onclick = e => { e.preventDefault(); selectZone(+r.dataset.zone, true); });
    el.querySelectorAll('[data-fleet]').forEach(r => r.onclick = () => selectFleet(+r.dataset.fleet));
    const sail = $('#lp-sail'); if (sail) sail.onclick = () => sendFleet(sel.zone);
  }
  function sendFleet(z) {
    const f = Navy.fleet(sel.fleet); if (!f || z < 0) return;
    if (f.battle) { toast('The ' + f.name + ' is in battle and cannot break off.', -1, 'info'); return; }
    if (z === f.zone && !f.path.length) { f.area = z; toast('The ' + f.name + ' is already in the ' + Seas.zone(z).name + '.', -1, 'info'); return; }
    if (Navy.orderMove(f, z)) toast('The ' + f.name + ' sails for the ' + Seas.zone(z).name + (f.mission !== 'hold' ? ' to ' + Navy.MISSIONS[f.mission].name.toLowerCase() : '') + '.', -1, 'info');
    else toast('No sea route to the ' + Seas.zone(z).name + ': a strait may be closed to you.', -1, 'info');
    renderRight(); renderLeft();
  }
  function hullIcon(color, sub) {
    return `<svg viewBox="0 0 34 22" style="width:34px;height:22px;flex:none"><rect x="0.5" y="0.5" width="33" height="21" rx="2" fill="${color}" stroke="rgba(0,0,0,.6)"/>${sub ? '<ellipse cx="17" cy="14" rx="12" ry="3.5" fill="#10161a"/><rect x="15" y="6" width="4" height="6" fill="#10161a"/>' : '<path d="M4 11 H30 L26 17 H8 Z M13 6 H20 V11 H13 Z" fill="#10161a"/>'}</svg>`;
  }
  function planeIcon(color) {
    return `<svg viewBox="0 0 34 22" style="width:34px;height:22px;flex:none"><rect x="0.5" y="0.5" width="33" height="21" rx="2" fill="${color}" stroke="rgba(0,0,0,.6)"/><path d="M17 3 L18.5 9 L28 11 L18.5 12.5 L18 17 L21 19 H13 L16 17 L15.5 12.5 L6 11 L15.5 9 Z" fill="#10161a"/></svg>`;
  }
  function fleetRow(f) {
    const G = Sim.G, st = Navy.fleetStats(f);
    const where = f.battle ? '⚔ In battle' : f.path.length ? 'Sailing to ' + Seas.zone(f.path[f.path.length - 1]).name : Seas.zone(f.zone).name;
    return `<div class="row click ${f.id === sel.fleet ? 'on' : ''}" data-fleet="${f.id}">${hullIcon(COUNTRY_BY_TAG[f.owner].color, f.ships.every(s => s.type === 'submarine'))}<div class="grow"><div>${f.owner !== G.player ? esc(G.countries[f.owner].name) + ' ' : ''}${esc(f.name)}</div>
      <div class="sub">${esc(Navy.comp(f))} · ${esc(where)} · ${esc(Navy.MISSIONS[f.mission].name)}</div><div class="bar str"><i style="width:${st.str * 100}%"></i></div><div class="bar org"><i style="width:${st.org * 100}%"></i></div></div></div>`;
  }
  function wingRow(w) {
    return `<div class="row click ${w.id === sel.wing ? 'on' : ''}" data-wing="${w.id}">${planeIcon(COUNTRY_BY_TAG[w.owner].color)}<div class="grow"><div>${esc(w.name)}</div>
      <div class="sub">${esc(Air.typeName(w.type))} · ${esc(MAP.provs[w.base].name)} · ${esc(Air.MISSIONS[w.mission].name)}${w.mission !== 'idle' && w.target >= 0 ? ' over ' + esc(w.sea ? Seas.zone(w.target).name : MAP.provs[w.target].name) : ''}</div><div class="bar str"><i style="width:${w.str * 100}%"></i></div><div class="bar org"><i style="width:${w.org * 100}%"></i></div></div></div>`;
  }
  function fleetCard(f) {
    const G = Sim.G, st = Navy.fleetStats(f), mine = f.owner === G.player;
    let status = f.battle ? 'In battle' : f.path.length ? 'Sailing to ' + Seas.zone(f.path[f.path.length - 1]).name : 'At sea';
    if (f.path.length && !f.battle) { const km = Seas.routeKm(f.zone, f.path) - f.progress; status += ' · ~' + Math.max(1, Math.round(km / Math.max(1, Navy.fleetSpeed(f)) / 24)) + ' days'; }
    const here = G.fleets.filter(x => x !== f && x.owner === G.player && x.zone === f.zone && !x.battle);
    let html = `<div class="owner">${flagSVG(f.owner)}<div><h2 class="display" style="font-size:21px">${esc(f.name)}</h2><div class="sub label">${esc(G.countries[f.owner].name)}</div></div></div>
      <dl class="kv"><dt>Location</dt><dd><a href="#" class="lnk" data-zone="${f.zone}">${esc(Seas.zone(f.zone).name)}</a></dd><dt>Status</dt><dd>${esc(status)}</dd>
      <dt>Mission</dt><dd>${esc(Navy.MISSIONS[f.mission].name)}${f.mission !== 'hold' && f.area >= 0 ? ' in the ' + esc(Seas.zone(f.area).name) : ''}</dd>
      <dt>Speed</dt><dd>${Math.round(Navy.fleetSpeed(f))} km/h</dd><dt>Power</dt><dd>${Math.round(Navy.power(f))}</dd></dl>
      ${meter('Strength', st.str, 'str')}${meter('Organisation', st.org, 'org')}
      <div class="unitgrid" style="margin-top:8px">${Navy.compLong(f).map(x => `<span>${esc(Navy.typeName(x.type))}</span><span>× ${x.n}</span>`).join('')}</div>`;
    if (!mine) return html + '<p class="note">Foreign fleet.</p>';
    html += `<div class="label" style="margin-top:8px">Mission</div><div class="orders">${['patrol', 'hunt', 'escort', 'raid', 'support', 'hold'].map(m => `<button class="btn sm ${f.mission === m ? 'active' : ''}" data-fm="${m}" title="${esc(Navy.MISSIONS[m].desc)}">${esc(Navy.MISSIONS[m].name)}</button>`).join('')}</div>
      <div class="orders" style="margin-top:6px"><button class="btn sm ${pending?.kind === 'fleet' ? 'active' : ''}" data-fo="move" title="Pick a sea zone">Move</button>
      <button class="btn sm" data-fo="repair" title="${esc(Navy.MISSIONS.repair.desc)}">Return to port</button>
      <button class="btn sm" data-fo="split" ${f.ships.length > 1 && !f.battle ? '' : 'disabled'}>Split</button>
      <button class="btn sm" data-fo="merge" ${here.length && !f.battle ? '' : 'disabled'} title="Joins your other fleets in this zone">Merge</button>
      <button class="btn sm" data-fo="back">All fleets</button></div>
      <p class="note">The mission is carried out where the fleet is headed. Right-click a sea zone (or pick one with Move) to send it elsewhere.</p>`;
    return html;
  }
  function wingCard(w) {
    const G = Sim.G, mine = w.owner === G.player;
    let html = `<div class="owner">${flagSVG(w.owner)}<div><h2 class="display" style="font-size:21px">${esc(w.name)}</h2><div class="sub label">${esc(G.countries[w.owner].name)} · ${esc(Air.typeName(w.type))}</div></div></div>
      <dl class="kv"><dt>Base</dt><dd>${esc(MAP.provs[w.base].name)}</dd><dt>Mission</dt><dd>${esc(Air.MISSIONS[w.mission].name)}${w.mission !== 'idle' && w.target >= 0 ? ' over ' + esc(w.sea ? Seas.zone(w.target).name : MAP.provs[w.target].name) : ''}</dd>
      <dt>Range</dt><dd>${Math.round(Air.range(w.type, w.owner))} km</dd>${w.kills ? `<dt>Ships sunk</dt><dd>${w.kills}</dd>` : ''}</dl>
      ${meter('Strength', w.str, 'str')}${meter('Readiness', w.org, 'org')}`;
    if (w.mission !== 'idle' && w.target >= 0) { const pt = Air.point(w); html += `<div class="note">Your side holds ${pct(Air.superiority(w.owner, pt))} of the sky there.</div>`; }
    if (!mine) return html;
    html += `<div class="label" style="margin-top:8px">Mission · pick a target on the map</div><div class="orders">${['superiority', 'cas', 'bomb', 'naval'].map(m => `<button class="btn sm ${pending?.kind === 'wing' && pending.mission === m ? 'active' : w.mission === m ? 'active' : ''}" data-wm="${m}" title="${esc(Air.MISSIONS[m].desc)}">${esc(Air.MISSIONS[m].name)}</button>`).join('')}</div>
      <div class="orders" style="margin-top:6px"><button class="btn sm" data-wo="idle">Stand down</button><button class="btn sm ${pending?.kind === 'rebase' ? 'active' : ''}" data-wo="rebase" title="Pick a friendly airbase">Rebase</button><button class="btn sm" data-wo="back">All wings</button></div>`;
    return html;
  }
  function navyPanel() {
    const G = Sim.G, c = G.countries[G.player], me = G.player;
    const f = sel.fleet ? Navy.fleet(sel.fleet) : null;
    if (sel.fleet && !f) sel.fleet = 0;
    if (f) return fleetCard(f);
    const w = sel.wing ? Air.wing(sel.wing) : null;
    if (sel.wing && !w) sel.wing = 0;
    if (w) return wingCard(w);
    const nv = Navy.nav(c);
    const mine = G.fleets.filter(x => x.owner === me);
    const ships = mine.reduce((s, x) => s + x.ships.length, 0);
    let html = `<div class="label">Fleets · ${ships} ships</div>`;
    html += mine.length ? '<div class="list" style="margin-top:6px">' + mine.map(fleetRow).join('') + '</div>' : '<div class="note">You have no warships.</div>';
    html += `<dl class="kv" style="margin-top:6px"><dt>${esc(Navy.typeName('transport'))}s</dt><dd>${Navy.freeTransports(me)} free of ${nv.transports} · each carries one division</dd>
      <dt>Enemy ships sunk</dt><dd>${nv.sunk}</dd><dt>Ships lost</dt><dd>${nv.lost}</dd>${nv.convoysLost > 0.5 || nv.convoysSunk > 0.5 ? `<dt>Convoys</dt><dd>${f1(nv.convoysLost)} goods lost, ${f1(nv.convoysSunk)} sunk by us</dd>` : ''}</dl>`;
    const docks = Navy.docks(me);
    html += `<hr class="sep"><div class="label">Shipyards · ${docks} dockyard level${docks === 1 ? '' : 's'}</div>`;
    if (nv.queue.length) html += '<div class="list" style="margin:6px 0">' + nv.queue.map((q, i) => `<div class="row"><div class="grow"><div>${esc(Navy.typeName(q.type))}</div><div class="bar prog"><i style="width:${Math.round((1 - q.left / q.total) * 100)}%"></i></div></div><span class="sub">${i < Math.max(1, docks) ? Math.ceil(q.left) + ' d' : 'waiting'}</span><button class="btn sm" data-unship="${i}" aria-label="Cancel ship" title="Cancel (half the ${esc(Economy.goodName('arms').toLowerCase())} back)">×</button></div>`).join('') + '</div>';
    html += `<div class="builds">${Navy.roles().map(r => { const chk = Navy.canBuild(me, r); return `<button class="btn sm" data-ship="${r}" ${chk.ok ? '' : 'disabled'} title="${esc(chk.ok ? Navy.stat(r, 'days') + ' days on one dockyard line' : chk.why)}"><span>${esc(Navy.typeName(r))}</span><small>${fmtN(Navy.stat(r, 'eq'))} ${esc(Economy.goodName('arms').toLowerCase())}</small></button>`; }).join('')}</div>`;
    if (!docks) html += `<div class="note">Build a ${esc(Economy.kindName('dock').toLowerCase())} in a coastal province with a ${esc(Economy.kindName('port').toLowerCase())} to lay down ships.</div>`;
    if (Air.available()) {
      const wings = G.wings.filter(x => x.owner === me);
      html += `<hr class="sep"><div class="label">Air wings · ${wings.length}</div>`;
      html += wings.length ? '<div class="list" style="margin-top:6px">' + wings.map(wingRow).join('') + '</div>' : '<div class="note">You have no aircraft.</div>';
      const q = c.airQueue || [];
      if (q.length) html += '<div class="list" style="margin:6px 0">' + q.map((x, i) => `<div class="row"><div class="grow"><div>${esc(Air.typeName(x.type))}</div><div class="bar prog"><i style="width:${Math.round((1 - x.left / x.total) * 100)}%"></i></div></div><span class="sub">${Math.ceil(x.left)} d</span><button class="btn sm" data-unplane="${i}" aria-label="Cancel aircraft">×</button></div>`).join('') + '</div>';
      html += `<div class="builds">${Air.types().map(t => { const chk = Air.canBuild(me, t); return `<button class="btn sm" data-plane="${t}" ${chk.ok ? '' : 'disabled'} title="${esc(chk.ok ? Air.MISSIONS[t === 'fighter' ? 'superiority' : t === 'navbomber' ? 'naval' : t === 'bomber' ? 'bomb' : 'cas'].desc : chk.why)}"><span>${esc(Air.typeName(t))}</span><small>${fmtN(Air.TYPES[t].eq)} ${esc(Economy.goodName('arms').toLowerCase())}</small></button>`; }).join('')}</div>`;
    } else html += '<hr class="sep"><div class="note">No aircraft fly in this era.</div>';
    return html;
  }

  function warCost(tag) { const G = Sim.G; return G.dip.claims[G.player + '>' + tag] > G.hour ? 0 : DECLARE_COST; }
  function confirmWar(tag) {
    const G = Sim.G;
    const cost = warCost(tag), pact = Sim.hasPact(G.player, tag);
    const joiners = Sim.coalition(tag).filter(t => t !== tag && !Sim.allied(t, G.player));
    Diplo.guaranteedBy(tag).forEach(t => { if (!Sim.allied(t, G.player) && !joiners.includes(t)) joiners.push(t); });
    modal(`<h2 class="display" style="font-size:24px">Declare war on ${esc(G.countries[tag].name)}?</h2>
      <p class="note">${joiners.length ? 'These nations will fight alongside them: ' + esc(joiners.map(t => G.countries[t].name).join(', ')) + '.' : 'Nobody will join them.'}
      ${cost ? 'Costs ' + cost + ' political power.' : 'Your refused demands justify this war, so it costs no political power.'}
      ${pact ? ' You have a non-aggression pact with them: breaking it costs 15% stability.' : ''}${G.countries[G.player].ws < 0.3 ? ' War support is low: stability will drop.' : ''}</p>
      <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn" data-x="no">Cancel</button><button class="btn danger" data-x="yes">${pact ? 'Break pact and declare war' : 'Declare war'}</button></div>`,
      x => {
        if (x !== 'yes') return;
        const c = G.countries[G.player];
        if (c.pp < cost) return;
        if (!Sim.declareWar(G.player, tag, false, { breakPact: true })) { toast('War could not be declared.', -1, 'info'); return; }
        c.pp -= cost;
        if (pact) c.stab = Math.max(0, c.stab - 0.15);
        if (c.ws < 0.3) c.stab = Math.max(0, c.stab - 0.08);
        Render.state.dirtyOwners = true;
        renderLeft(); renderRight(); refreshTop();
      });
  }

  // ---------- selection ----------
  function selectArmies(ids, add) {
    const G = Sim.G;
    if (add) { for (const id of ids) { const i = sel.armies.indexOf(id); if (i >= 0) sel.armies.splice(i, 1); else sel.armies.push(id); } }
    else sel.armies = ids.slice();
    // only own armies can be multi-selected
    if (sel.armies.length > 1) sel.armies = sel.armies.filter(id => { const a = Sim.army(id); return a && a.owner === G.player; });
    Render.state.selArmies = new Set(sel.armies);
    if (sel.armies.length) { sel.tab = 'army'; sel.collapsed = false; sel.fleet = 0; sel.wing = 0; Render.state.selFleet = 0; Render.state.selWing = 0; }
    renderRight(); renderTrays();
  }
  function selectedArmies() { return sel.armies.map(Sim.army).filter(Boolean); }
  function myArmiesSel() { const G = Sim.G; return selectedArmies().filter(a => a.owner === G.player); }

  // ---------- right panel ----------
  function renderRight() {
    const G = Sim.G; if (!G) return;
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t.dataset.tab === sel.tab));
    const wars = G.wars.filter(w => w.attackers.includes(G.player) || w.defenders.includes(G.player)).length;
    $('#tab-wars-badge').textContent = wars || ''; $('#tab-wars-badge').hidden = !wars;
    const body = $('#rp-body');
    body.hidden = !!sel.collapsed;
    $('#rightpanel').classList.toggle('folded', !!sel.collapsed);
    const html = sel.tab === 'army' ? armyPanel() : sel.tab === 'recruit' ? recruitPanel() : sel.tab === 'navy' ? navyPanel() : sel.tab === 'diplo' ? diploPanel() : sel.tab === 'econ' ? econPanel() : sel.tab === 'tech' ? techPanel() : sel.tab === 'wars' ? warsPanel() : logPanel();
    if (setHTML(body, html)) bindRight();
  }
  function meter(label, v, cls) { return `<div class="meter"><span>${label}</span><div class="bar ${cls}"><i style="width:${Math.round(v * 100)}%"></i></div><span>${pct(v)}</span></div>`; }
  const ORDER_TEXT = { hold: 'Holding position', move: 'Moving', attack: 'Offensive', defend: 'Defending front', retreat: 'Retreating', redeploy: 'Strategic redeployment' };
  function orderText(a) {
    const G = Sim.G;
    if (a.sea) return Navy.phaseText(a);
    if (a.battle) { const b = G.battles.find(x => x.id === a.battle); return (a.landing ? 'Landing at ' : 'Attacking ') + (b ? MAP.provs[b.prov].name : ''); }
    if (a.retreating) return 'Retreating to ' + MAP.provs[a.path[a.path.length - 1]]?.name;
    let t = ORDER_TEXT[a.order] || a.order;
    if (a.order === 'defend') t += a.frontTag ? ' vs ' + G.countries[a.frontTag].name : ' (all enemies)';
    if ((a.order === 'move' || a.order === 'attack' || a.order === 'redeploy') && a.target >= 0) t += ' → ' + MAP.provs[a.target].name;
    if (a.path.length) { const km = a.path.reduce((s, id, i) => s + Sim.distKm(i ? a.path[i - 1] : a.prov, id), 0) - a.progress; t += ' · ~' + Math.max(1, Math.round(km / Math.max(0.5, Sim.armySpeed(a)) / 24)) + ' days'; }
    return t;
  }
  function armyPanel() {
    const G = Sim.G;
    const list = selectedArmies();
    if (!list.length) return `<p class="note">Select an army by clicking its counter on the map or a card in the tray below. Shift-click adds more armies to the selection.</p>
      <p class="note">Right-click a province to move there. Right-click enemy territory to launch an offensive that keeps pushing toward that point.</p>`;
    const mine = list[0].owner === G.player;
    let html = '';
    if (list.length === 1) {
      const a = list[0], st = Sim.armyStats(a), c = G.countries[a.owner];
      html += `<div class="owner">${flagSVG(a.owner)}<div><h2 class="display" style="font-size:21px">${esc(a.name)}</h2><div class="sub label">${esc(c.name)}</div></div></div>
        <dl class="kv"><dt>Commander</dt><dd>${esc(a.commander.name)} ${'★'.repeat(a.commander.skill)}</dd>
        <dt>Location</dt><dd>${esc(MAP.provs[a.prov].name)}</dd><dt>Orders</dt><dd>${esc(orderText(a))}</dd>
        <dt>Divisions</dt><dd>${a.units.length} · ${fmtN(Sim.manpowerOf(a))} men</dd><dt>Speed</dt><dd>${Sim.armySpeed(a).toFixed(1)} km/h</dd>
        <dt>Entrenchment</dt><dd>+${Math.round(a.entrench * 100)}%</dd></dl>
        ${meter('Strength', st.str, 'str')}${meter('Organisation', st.org, 'org')}${meter('Supply', a.supply, 'sup')}
        <div class="unitgrid" style="margin-top:8px">${Object.entries(a.units.reduce((m, u) => (m[u.type] = (m[u.type] || 0) + 1, m), {})).map(([t, n]) => `<span>${UNIT_TYPES[t].name}</span><span>× ${n}</span>`).join('')}</div>`;
    } else {
      const divs = list.reduce((s, a) => s + a.units.length, 0);
      const str = list.reduce((s, a) => s + Sim.armyStats(a).str * a.units.length, 0) / divs;
      const org = list.reduce((s, a) => s + Sim.armyStats(a).org * a.units.length, 0) / divs;
      html += `<h2 class="display" style="font-size:21px">${list.length} armies selected</h2><dl class="kv"><dt>Divisions</dt><dd>${divs}</dd></dl>${meter('Strength', str, 'str')}${meter('Organisation', org, 'org')}`;
    }
    if (!mine) return html + '<p class="note">Foreign army. You can only give orders to your own troops.</p>';
    const one = list.length === 1;
    const sameProv = list.every(a => a.prov === list[0].prov);
    html += `<div class="orders">
      <button class="btn sm ${pending?.kind === 'move' ? 'active' : ''}" data-o="move" title="Pick a destination">Move</button>
      <button class="btn sm ${pending?.kind === 'attack' ? 'active' : ''}" data-o="attack" title="Pick an enemy objective; the army keeps attacking toward it">Attack</button>
      <button class="btn sm ${pending?.kind === 'front' ? 'active' : ''}" data-o="front" title="Pick an enemy province: the army guards that border and shifts to weak spots">Defend front</button>
      <button class="btn sm" data-o="hold">Hold</button>
      <button class="btn sm" data-o="retreat">Retreat</button>
      <button class="btn sm ${pending?.kind === 'redeploy' ? 'active' : ''}" data-o="redeploy" title="Fast move through friendly land; organisation drops">Redeploy</button>
      <button class="btn sm" data-o="split" ${one && list[0].units.length > 1 ? '' : 'disabled'}>Split</button>
      <button class="btn sm" data-o="merge" ${list.length > 1 && sameProv ? '' : 'disabled'} title="Armies must share a province">Merge</button>
      <button class="btn sm" data-o="recruit" ${one ? '' : 'disabled'}>Reinforce</button>
      <button class="btn sm ${pending?.kind === 'invade' ? 'active' : ''}" data-o="invade" ${one && !list[0].sea ? '' : 'disabled'} title="Ship this army across the sea: pick a coastal province">Invade by sea</button></div>`;
    if (one && list[0].sea) {
      const a = list[0];
      html += `<div class="label" style="margin-top:8px">${a.sea.hostile ? 'Naval invasion' : 'Sea transport'}</div><div class="bar prog" style="height:8px"><i style="width:${Math.round(Navy.progress(a) * 100)}%"></i></div>
        <div class="note">${esc(Navy.phaseText(a))}. Uses ${a.sea.ships} ${esc(Navy.typeName('transport').toLowerCase())}${a.sea.ships > 1 ? 's' : ''}.${a.sea.hostile ? ' Landing needs 40% sea control in the ' + esc(Seas.zone(a.sea.zone).name) + ' (now ' + pct(Navy.superiority(a.owner, a.sea.zone)) + '). Fleets on Invasion support there help.' : ''}</div>
        <button class="btn sm" data-o="cancelsea">${a.sea.phase === 'prep' ? 'Call off' : 'Turn back'}</button>`;
    } else if (one && Seas.isCoastal(list[0].prov)) html += `<div class="note">Coastal province: ${Navy.freeTransports(G.player)} ${esc(Navy.typeName('transport').toLowerCase())}s free for an invasion.</div>`;
    if (list.length > 1 && !sameProv) html += '<p class="note">Merging needs all selected armies in the same province.</p>';
    return html;
  }
  function recruitPanel() {
    const G = Sim.G, c = G.countries[G.player];
    const target = myArmiesSel().length === 1 ? myArmiesSel()[0] : null;
    let html = `<dl class="kv"><dt>Manpower</dt><dd>${fmtN(c.manpower)}</dd><dt>${esc(Economy.goodName('arms'))}</dt><dd>${fmtN(c.equipment)} (+${Math.round(c.eco ? c.eco.arms : 0)}/day)</dd></dl>
      <p class="note">New divisions ${target ? 'join <b>' + esc(target.name) + '</b> if it is inside your borders when training ends, otherwise they' : ''} gather in a reserve army at ${esc(MAP.provs[c.capital]?.name || 'the capital')}.</p><div class="list">`;
    // an era may reserve units for some nations (Spartans for Sparta, legionaries for Rome)
    const trainable = (typeof Eras !== 'undefined' && !Eras.isBase() ? Eras.unitsFor(G.player) : LAND_TYPES).filter(t => !UNIT_TYPES[t].locked || Tech.unlocked(G.player, t));
    for (const t of trainable) {
      const u = UNIT_TYPES[t];
      const strat = Economy.stratUnit(t) ? `<div class="sub">Needs ${esc(Economy.goodName('strategic').toLowerCase())}${c.eco && c.eco.sat.strategic < 0.99 ? ': trains at ' + pct(c.eco.sat.strategic) + ' speed' : ''}</div>` : '';
      html += `<div class="row">${unitIcon(t, COUNTRY_BY_TAG[G.player].color).replace('<svg', '<svg style="width:34px;height:22px;flex:none"')}<div class="grow"><div>${u.name}</div>
        <div class="sub">Atk ${u.atk} · Def ${u.def} · ${u.speed} km/h · Org ${u.org}</div><div class="sub">${fmtN(Sim.mpCost(G.player, t))} men · ${u.eq} ${esc(Economy.goodName('arms').toLowerCase())} · ${u.days} days</div>${strat}</div>
        <button class="btn sm" data-rec="${t}" ${Sim.canRecruit(G.player, t) ? '' : 'disabled'}>Train</button></div>`;
    }
    html += '</div>';
    if (c.queue.length) {
      html += '<hr class="sep"><div class="label">In training</div><div class="list" style="margin-top:6px">' + c.queue.map(q => `<div class="row"><div class="grow"><div>${UNIT_TYPES[q.type].name}</div><div class="bar prog"><i style="width:${Math.round((1 - q.hours / q.total) * 100)}%"></i></div></div><span class="sub">${Math.ceil(q.hours / 24)} d</span></div>`).join('') + '</div>';
    }
    return html;
  }
  let diploQuery = '';
  function relTag(v) { return `<span class="rel ${v >= 30 ? 'good' : v <= -30 ? 'bad' : ''}">${v > 0 ? '+' : ''}${v}</span>`; }
  function dipStatus(tag) {
    const G = Sim.G, out = [];
    const f = Sim.factionOf(tag);
    if (Sim.atWar(tag, G.player)) out.push('<span class="pill war">At war</span>');
    else if (Sim.allied(tag, G.player)) out.push('<span class="pill ally">Ally</span>');
    if (f) out.push(`<span class="pill">${esc(f.name)}</span>`);
    if (Sim.hasPact(tag, G.player)) out.push('<span class="pill">Pact</span>');
    if (Economy.trading(tag, G.player)) out.push('<span class="pill">Trade</span>');
    if (Economy.embargoed(tag, G.player)) out.push('<span class="pill war">Embargo</span>');
    if (G.dip.guar.some(x => x.by === G.player && x.of === tag)) out.push('<span class="pill">Guaranteed</span>');
    if (G.dip.guar.some(x => x.by === tag && x.of === G.player)) out.push('<span class="pill">Guarantees you</span>');
    return out.join(' ');
  }
  function factionCard() {
    const G = Sim.G, f = Sim.factionOf(G.player);
    if (!f) {
      const c = Diplo.can('create', G.player);
      return `<div class="fac"><div class="label">Faction</div><div class="note" style="margin:2px 0 8px">You stand alone. A faction's members fight each other's wars.</div>
        <button class="btn" data-act="create" ${c.ok ? '' : 'disabled'}>Create faction <small>${Diplo.COST.create} PP</small></button>${c.ok ? '' : `<div class="why">${esc(c.why)}</div>`}</div>`;
    }
    return `<div class="fac"><div class="label">Your faction</div><h3 class="display" style="font-size:18px;margin:2px 0 6px">${esc(f.name)}</h3>
      <div class="flags">${f.members.map(t => `<span title="${esc(G.countries[t].name)}${t === f.leader ? ' (leader)' : ''}">${flagSVG(t)}</span>`).join('')}</div>
      <div class="note">${f.members.length} member${f.members.length > 1 ? 's' : ''}, led by ${esc(G.countries[f.leader].name)}.${f.leader === G.player ? ' Open a nation to invite it.' : ''}</div>
      <button class="btn sm" data-act="leave">Leave faction</button></div>`;
  }
  function diploPanel() {
    const G = Sim.G;
    if (sel.dip && G.countries[sel.dip]?.alive && sel.dip !== G.player) return nationPanel(sel.dip);
    const rows = Object.values(G.countries).filter(c => c.alive && c.tag !== G.player && c.name.toLowerCase().includes(diploQuery.toLowerCase()))
      .map(c => ({ c, r: Diplo.rel(G.player, c.tag), w: Sim.atWar(c.tag, G.player) }))
      .sort((a, b) => (b.w - a.w) || (Sim.allied(b.c.tag, G.player) - Sim.allied(a.c.tag, G.player)) || a.c.name.localeCompare(b.c.name));
    return `${factionCard()}
      <input class="search" id="dp-search" placeholder="Search nations" value="${esc(diploQuery)}" aria-label="Search nations">
      <div class="list">${rows.map(({ c, r }) => `<button class="row click dip-row" data-dip="${c.tag}">${flagSVG(c.tag)}<div class="grow"><div>${esc(c.name)}</div>
        <div class="sub">${c.gov} · relations ${relTag(r)} ${dipStatus(c.tag)}</div></div><span class="chev">›</span></button>`).join('')}</div>`;
  }
  function nationPanel(tag) {
    const G = Sim.G, c = G.countries[tag], me = G.player;
    const r = Diplo.rel(me, tag), war = Sim.atWar(me, tag);
    const divs = G.armies.filter(a => a.owner === tag).reduce((s, a) => s + a.units.length, 0);
    const f = Sim.factionOf(tag), myF = Sim.factionOf(me);
    const act = (key, label, opts = {}) => {
      const chk = Diplo.can(opts.as || key, me, tag);
      const cost = opts.cost !== undefined ? opts.cost : Diplo.COST[opts.as || key];
      return `<div class="dact"><button class="btn ${opts.cls || ''}" data-act="${key}" ${chk.ok ? '' : 'disabled'}>${label}${cost ? ` <small>${cost} PP</small>` : ''}</button>
        <div class="why">${chk.ok ? esc(opts.hint || '') : esc(chk.why)}</div></div>`;
    };
    const acts = [];
    if (war) {
      const ws = Diplo.warScore(me, tag);
      acts.push(`<div class="note">War score ${ws > 0 ? '+' : ''}${ws}: ${ws >= 25 ? 'you are winning' : ws <= -25 ? 'you are losing' : 'the war is even'}.</div>`);
      acts.push(act('peace', 'Offer white peace', { hint: 'All occupied land goes back' }));
      acts.push(act('peacekeep', 'Demand they cede occupied land', { as: 'peace', hint: 'You keep what you hold' }));
    } else {
      acts.push(act('improve', 'Improve relations', { hint: '+15 relations' }));
      acts.push(act('aid', 'Send military aid', { hint: Diplo.AID_EQ + ' equipment from your stock' }));
      if (!Sim.allied(me, tag)) acts.push(act('pact', 'Non-aggression pact', { hint: 'No war between you for two years' }));
      acts.push(G.dip.guar.some(x => x.by === me && x.of === tag) ? act('unguarantee', 'Revoke guarantee') : act('guarantee', 'Guarantee independence', { hint: 'You join any war against them' }));
      if (f && !myF) acts.push(act('join', 'Ask to join the ' + esc(f.name), { hint: 'You join their wars too' }));
      else if (myF && !f) acts.push(act('invite', 'Invite to the ' + esc(myF.name), { hint: Sim.isAtWar(tag) ? 'Your faction joins their current wars' : 'They join your wars' }));
      if (!Sim.allied(me, tag)) {
        const provs = Diplo.demandTargets(me, tag).map(id => MAP.provs[id].name);
        acts.push(act('demand', 'Demand territory', { hint: provs.length ? provs.join(', ') : '' }));
        const cost = warCost(tag), canW = !G.over && G.countries[me].pp >= cost;
        acts.push(`<div class="dact"><button class="btn danger" data-war="${tag}" ${canW ? '' : 'disabled'}>${Sim.hasPact(me, tag) ? 'Break pact and declare war' : 'Declare war'}${cost ? ` <small>${cost} PP</small>` : ''}</button>
          <div class="why">${canW ? (cost ? '' : 'Justified by your refused demands') : 'Needs ' + cost + ' political power'}</div></div>`);
      }
    }
    return `<button class="btn sm" data-dipback>‹ All nations</button>
      <div class="owner" style="margin:10px 0 4px">${flagSVG(tag)}<div><h3 class="display" style="font-size:20px;margin:0">${esc(c.name)}</h3><div class="sub note" style="margin:0">${c.gov} · ${divs} divisions</div></div></div>
      <div class="meter"><span>Relations</span><div class="bar ${r >= 0 ? 'str' : 'bad'}"><i style="width:${Math.abs(r)}%"></i></div><span>${r > 0 ? '+' : ''}${r}</span></div>
      <div style="margin:6px 0 10px;display:flex;flex-wrap:wrap;gap:4px">${dipStatus(tag) || '<span class="pill">No treaties</span>'}</div>
      <div class="dacts">${acts.join('')}</div>${war ? '' : tradeSection(tag, act)}`;
  }
  function doDiplo(key, tag) {
    const G = Sim.G;
    const action = key === 'peacekeep' ? 'peace' : key;
    let terms = key === 'peacekeep' ? { keep: true } : {};
    if (key === 'trade') { const f = tradeForm(tag); terms = { good: f.good, amount: f.amount, price: +(Economy.fairPrice(f.good, f.amount) * (1 + f.adj)).toFixed(1), sell: f.sell }; }
    const r = Diplo.act(action, G.player, tag, terms);
    toast(r.text, -1, r.accepted === false ? 'loss' : r.accepted ? 'win' : 'info');
    Render.state.dirtyOwners = true;
    renderRight(); renderLeft(); refreshTop();
  }
  // proposals from AI nations wait their turn, one dialog at a time
  const offers = [];
  // shown as a card above the army tray, not a dialog: it never blocks the map or the panels
  function showOffer() {
    const el = $('#offer');
    if (!offers.length) { el.hidden = true; return; }
    if (!el.hidden) return;
    const G = Sim.G, { o, respond } = offers[0];
    const from = o.from;
    el.innerHTML = `<div class="owner">${flagSVG(from)}<b>${esc(G.countries[from].name)}</b></div><p>${esc(o.text)}</p>
      <div class="acts"><span class="note">Relations ${relTag(Diplo.rel(G.player, from))}</span><button class="btn sm" data-x="no">Decline</button><button class="btn sm primary" data-x="yes">Accept</button></div>`;
    el.hidden = false;
    el.querySelectorAll('[data-x]').forEach(b => b.onclick = () => {
      offers.shift(); el.hidden = true;
      const yes = b.dataset.x === 'yes';
      const r = respond(yes);
      toast(yes ? (r && r.text) || 'Accepted.' : 'You declined the proposal from ' + G.countries[from].name + '.', -1, 'info');
      Render.state.dirtyOwners = true; renderRight(); renderLeft(); refreshTop();
      setTimeout(showOffer, 250);
    });
  }

  // ---------- economy ----------
  const f1 = n => { n = +n || 0; const a = Math.abs(n); return a >= 100 ? String(Math.round(n)) : a >= 10 ? n.toFixed(0) : n.toFixed(1); };
  const sgn = n => (n >= 0 ? '+' : '−') + f1(Math.abs(n));
  const GOOD_COL = { food: '#9ec46b', metal: '#a9b4bf', fuel: '#8a7a5c', strategic: '#d48a4a', luxuries: '#c790d8', arms: '#c9a55a' };
  const goodDot = k => `<i class="gdot" style="background:${GOOD_COL[k]}"></i>`;
  const shortGood = k => Economy.goodName(k).split(/[ ,]/)[0];
  function econPanel() {
    const G = Sim.G, c = G.countries[G.player], e = c.eco;
    if (!e || !e.need) return '<p class="note">No economy.</p>';
    const inc = e.income || {};
    const parts = [['Taxes', inc.tax], ['Exports', inc.trade], ['Trade bonus', inc.bonus], ['World market sales', inc.market], ['Other', inc.other], ['Military upkeep', inc.upkeep], ['Imports', inc.imports]].filter(x => x[1] && Math.abs(x[1]) >= 0.05);
    let html = `<div class="goldline"><div><div class="label">Gold · ${esc(Economy.coin())}</div><div class="big num ${e.gold < 0 ? 'neg' : ''}">${fmtN(e.gold)}</div></div>
      <div class="num ${e.goldDelta < 0 ? 'neg' : 'pos'}">${sgn(e.goldDelta || 0)} a day</div></div>
      <div class="mods">${parts.map(x => `<span>${x[0]}</span><span class="num ${x[1] < 0 ? 'neg' : 'pos'}">${sgn(x[1])}</span>`).join('')}</div>
      ${e.gold < 0 ? '<div class="why bad">In debt: you cannot build or buy, and stability falls.</div>' : ''}
      ${meter('Economic health', e.health, e.health < 0.8 ? 'bad' : 'str')}
      <div class="note">Health is how well you are supplied with ${esc(Economy.goodName('food').toLowerCase())}, ${esc(Economy.goodName('metal').toLowerCase())} and ${esc(Economy.goodName('fuel').toLowerCase())}. It speeds up research and taxes.</div>
      <table class="goods"><thead><tr><th>Good</th><th>Made</th><th>Used</th><th>Trade</th><th>Stock</th></tr></thead><tbody>`;
    for (const k of Economy.GOODS) {
      const net = Economy.balance(G.player, k), days = Economy.daysLeft(G.player, k);
      const tr = e.imp[k] - e.exp[k], short = net < -0.05;
      const cls = short ? (days < 30 ? 'bad' : 'warn') : '';
      html += `<tr class="${cls}" data-good="${k}"><td>${goodDot(k)}${esc(Economy.goodName(k))}</td><td class="num">${f1(e.prod[k])}</td><td class="num">${f1(e.need[k])}</td><td class="num">${Math.abs(tr) < 0.05 ? '–' : sgn(tr)}</td>
        <td class="num">${fmtN(e.stock[k])} <span class="tr">${net > 0.05 ? '▲' : short ? '▼' : '•'}</span></td></tr>`;
      if (short) html += `<tr class="${cls} sub"><td colspan="5">${e.stock[k] > 0.5 ? 'Runs out in ' + days + ' days' : 'Short by ' + f1(-net) + ' a day: ' + Math.round((1 - e.sat[k]) * 100) + '% missing'}</td></tr>`;
    }
    html += `<tr><td>${goodDot('arms')}${esc(Economy.goodName('arms'))}</td><td class="num">${f1(e.arms)}</td><td class="num">–</td><td class="num">–</td><td class="num">${fmtN(c.equipment)}</td></tr></tbody></table>`;
    html += `<hr class="sep"><div class="label">Construction · ${f1(e.cp)} points a day</div>`;
    if (e.queue.length) html += '<div class="list" style="margin:6px 0">' + e.queue.map((q, i) => `<div class="row"><div class="grow"><div>${esc(Economy.kindName(q.kind))} <span class="sub">in ${esc(MAP.provs[q.prov].name)}</span></div><div class="bar prog"><i style="width:${Math.round((1 - q.left / q.total) * 100)}%"></i></div></div><span class="sub">${i < 3 ? Math.max(1, Math.ceil(q.left / Math.max(0.1, e.cp / Math.min(3, e.queue.length)))) + ' d' : 'waiting'}</span><button class="btn sm" data-unbuild="${i}" aria-label="Cancel construction" title="Cancel (half the gold back)">×</button></div>`).join('') + '</div>';
    html += `<div class="builds">${Economy.KIND_KEYS.map(k => { const chk = Economy.canBuild(G.player, k); return `<button class="btn sm" data-build="${k}" ${chk.ok ? '' : 'disabled'} title="${esc(chk.ok ? 'Builds in ' + MAP.provs[chk.prov].name : chk.why)}"><span>${esc(Economy.kindName(k))}</span><small>${Economy.buildCost(k, G.player).gold} gold</small></button>`; }).join('')}</div>
      <div class="label" style="margin-top:8px">Military works</div>
      <div class="builds">${Economy.infraKinds().filter(k => Economy.INFRA[k].needs !== 'air' || Air.available()).map(k => { const chk = Economy.canBuild(G.player, k); return `<button class="btn sm" data-build="${k}" ${chk.ok ? '' : 'disabled'} title="${esc(chk.ok ? INFRA_TIP[k] + ' Builds in ' + MAP.provs[chk.prov].name + '.' : chk.why)}"><span>${esc(Economy.kindName(k))}</span><small>${chk.ok ? chk.cost.gold : Economy.buildCost(k, G.player).gold} gold</small></button>`; }).join('')}</div>
      <div class="note">Build picks your best province. To choose the place yourself, click one of your provinces on the map.</div>`;
    const deals = Economy.dealsOf(G.player);
    html += `<hr class="sep"><div class="label">Trade deals · ${deals.length} of ${Economy.tradeSlots(G.player)} slots</div>`;
    html += deals.length ? '<div class="list" style="margin-top:6px">' + deals.map(d => dealRow(d)).join('') + '</div>' : '<div class="note">No deals yet. Open a nation in the Nations tab to buy or sell.</div>';
    const emb = G.dip.embargo.filter(x => x.by === G.player || x.of === G.player);
    if (emb.length) html += '<div class="list" style="margin-top:6px">' + emb.map(x => `<div class="row">${flagSVG(x.by === G.player ? x.of : x.by)}<div class="grow">${x.by === G.player ? 'Your embargo on ' + esc(G.countries[x.of].name) : esc(G.countries[x.by].name) + ' embargoes you'}</div>${x.by === G.player ? `<button class="btn sm" data-lift="${x.of}">Lift</button>` : ''}</div>`).join('') + '</div>';
    html += `<div class="label" style="margin-top:10px">World prices</div><div class="mods">${Economy.GOODS.map(k => `<span>${goodDot(k)}${esc(Economy.goodName(k))}</span><span class="num">${Economy.worldPrice(k).toFixed(2)}</span>`).join('')}</div>`;
    return html;
  }
  function dealRow(d) {
    const G = Sim.G, me = G.player, sell = d.from === me, other = sell ? d.to : d.from;
    const good = Economy.goodName(d.good).toLowerCase();
    const dep = Economy.dependence(d.to, d.good, d.from);
    const txt = sell ? `You sell ${d.amount} ${good} a day to ${G.countries[other].name} for ${d.price} gold` : `${G.countries[other].name} sells you ${d.amount} ${good} a day for ${d.price} gold`;
    const depTxt = sell ? `${G.countries[other].name} gets ${Math.round(dep * 100)}% of its ${good} from you` : `You get ${Math.round(dep * 100)}% of your ${good} from ${G.countries[other].name}`;
    const short = d.delivered !== undefined && d.delivered < d.amount - 0.05 ? ` · only ${f1(d.delivered)} delivered` : '';
    return `<div class="row deal">${flagSVG(other)}<div class="grow"><div>${goodDot(d.good)}${esc(txt)}</div><div class="sub">${esc(depTxt + short)}</div></div><button class="btn sm" data-canceldeal="${d.id}" data-with="${other}">Cancel</button></div>`;
  }
  const AMOUNTS = [1, 2, 3, 5, 8, 10, 15, 20, 30, 40, 60, 80];
  function tradeForm(tag) {
    if (sel.tf && sel.tf.tag === tag) return sel.tf;
    const G = Sim.G, me = G.player;
    const b = (t, k) => Economy.balance(t, k);
    let best = null, bv = 0;
    for (const k of Economy.GOODS) {
      const buy = Math.min(-b(me, k), b(tag, k)), sell = Math.min(b(me, k), -b(tag, k));
      if (buy > bv) { bv = buy; best = { good: k, sell: false }; }
      if (sell > bv) { bv = sell; best = { good: k, sell: true }; }
    }
    best = best || { good: 'food', sell: false };
    const amt = AMOUNTS.filter(a => a <= Math.max(1, bv)).pop() || 1;
    return (sel.tf = { tag, good: best.good, sell: best.sell, amount: amt, adj: 0 });
  }
  function tradeSection(tag, act) {
    const G = Sim.G, me = G.player;
    const deals = Economy.dealBetween(me, tag);
    const bal = k => Economy.balance(tag, k);
    const spare = Economy.GOODS.filter(k => bal(k) > 0.5).map(k => Economy.goodName(k) + ' ' + sgn(bal(k)));
    const needs = Economy.GOODS.filter(k => bal(k) < -0.5).map(k => Economy.goodName(k) + ' ' + sgn(bal(k)));
    const f = tradeForm(tag);
    const price = +(Economy.fairPrice(f.good, f.amount) * (1 + f.adj)).toFixed(1);
    const chk = Diplo.can('trade', me, tag, { good: f.good, amount: f.amount, price, sell: f.sell });
    const emb = G.dip.embargo.some(x => x.by === me && x.of === tag);
    const gname = Economy.goodName(f.good).toLowerCase();
    return `<hr class="sep"><div class="label">Trade</div>
      ${deals.length ? '<div class="list" style="margin:6px 0">' + deals.map(d => dealRow(d)).join('') + '</div>' : ''}
      <div class="note">They have spare: ${spare.length ? esc(spare.join(', ')) : 'nothing'}.<br>They lack: ${needs.length ? esc(needs.join(', ')) : 'nothing'}.</div>
      <div class="tform">
        <div class="seg"><button class="chip ${!f.sell ? 'on' : ''}" data-tf="buy">Buy from them</button><button class="chip ${f.sell ? 'on' : ''}" data-tf="sell">Sell to them</button></div>
        <div class="seg">${Economy.GOODS.map(k => `<button class="chip ${f.good === k ? 'on' : ''}" data-tfg="${k}" title="${esc(Economy.goodName(k))}">${goodDot(k)}${esc(shortGood(k))}</button>`).join('')}</div>
        <div class="stepper"><span>Amount a day</span><button class="btn sm" data-tfa="-1" aria-label="Less">−</button><b class="num">${f.amount}</b><button class="btn sm" data-tfa="1" aria-label="More">+</button></div>
        <div class="stepper"><span>Gold a day</span><button class="btn sm" data-tfp="-0.05" aria-label="Lower price">−</button><b class="num">${price}</b><button class="btn sm" data-tfp="0.05" aria-label="Higher price">+</button><small>${f.adj === 0 ? 'world price' : (f.adj > 0 ? '+' : '') + Math.round(f.adj * 100) + '%'}</small></div>
      </div>
      <div class="dacts"><div class="dact"><button class="btn" data-act="trade" ${chk.ok ? '' : 'disabled'}>${f.sell ? 'Offer to sell' : 'Offer to buy'} <small>${Diplo.COST.trade} PP</small></button>
        <div class="why">${chk.ok ? esc((f.sell ? 'You sell ' : 'You buy ') + f.amount + ' ' + gname + ' a day for ' + price + ' gold a day.') : esc(chk.why)}</div></div>
      ${emb ? act('lift', 'Lift embargo') : act('embargo', 'Embargo', { cls: 'danger', hint: 'Cut every deal with them and refuse new ones' + (Sim.factionOf(me) && Sim.factionOf(me).leader === me ? '. Your faction is asked to join.' : '') })}</div>`;
  }

  // ---------- research ----------
  let treeOpen = false;
  function techCard(tag, t) {
    const st = Tech.state(tag, t.id), x = Tech.info(t.id), c = Sim.G.countries[tag];
    const slot = c.rs.slots.find(s => s && s.id === t.id);
    const pts = slot ? slot.pts : (c.rs.saved[t.id] || 0);
    const rate = Math.max(0.01, c.rs.rate || Tech.rate(tag));
    const days = Math.ceil((x.cost - pts) / rate);
    const gate = t.from && !Tech.dateReady(x) ? `<em>Available from ${esc(Tech.fromLabel(x))}</em>` : '';
    const foot = st === 'done' ? 'Researched' : st === 'closed' ? 'Other path chosen' : st === 'locked' ? 'Needs the tier before' : st === 'active' ? Math.round(pts / x.cost * 100) + '% · ' + days + ' d' : x.cost + ' points · about ' + days + ' days';
    return `<button class="tcard ${st}" data-tech="${t.id}" ${st === 'open' ? '' : 'aria-disabled="true"'}><b>${esc(t.name)}</b><span>${esc(t.desc || '')}</span>${gate}<small>${foot}</small>${st === 'active' ? `<i class="tp" style="width:${Math.round(pts / x.cost * 100)}%"></i>` : ''}</button>`;
  }
  function pickTech(id) {
    const G = Sim.G, st = Tech.state(G.player, id);
    if (st !== 'open') return;
    const r = Tech.start(G.player, id);
    if (!r.ok) toast(r.why + (r.why.includes('busy') ? ': stop one in the Research tab first.' : '.'), -1, 'info');
    renderRight(); renderTree();
  }
  function techPanel() {
    const G = Sim.G, c = G.countries[G.player];
    if (!c.rs || !Tech.branchesFor(G.player).length) return '<p class="note">No technologies for this era.</p>';
    let html = `<dl class="kv"><dt>Research</dt><dd>${f1(Tech.rate(G.player))} points a day</dd><dt>Researched</dt><dd>${c.techs.length}</dd></dl><div class="label">Research slots</div><div class="list" style="margin:6px 0">`;
    c.rs.slots.forEach((s, i) => {
      if (!s) { html += `<div class="row"><div class="grow note">Empty slot: pick a technology below.</div></div>`; return; }
      const x = Tech.info(s.id);
      const days = Math.ceil((x.cost - s.pts) / Math.max(0.01, c.rs.rate || Tech.rate(G.player)));
      const gate = x.t.from && !Tech.dateReady(x) ? ' · waits for ' + Tech.fromLabel(x) : '';
      html += `<div class="row"><div class="grow"><div>${esc(x.t.name)}</div><div class="bar prog"><i style="width:${Math.round(s.pts / x.cost * 100)}%"></i></div><div class="sub">${s.pts >= x.cost ? 'Ready' : days + ' days'}${esc(gate)}</div></div><button class="btn sm" data-stopr="${i}">Stop</button></div>`;
    });
    html += `</div><button class="btn" data-opentree style="width:100%">Open the tech tree</button><div class="label" style="margin-top:10px">Available now</div><div class="tlist">`;
    for (const b of Tech.branchesFor(G.player)) for (const tier of b.tiers) for (const t of (Array.isArray(tier) ? tier : [tier]))
      if (Tech.state(G.player, t.id) === 'open') html += techCard(G.player, t).replace('<b>', `<u>${esc(b.name)}</u><b>`);
    return html + '</div>';
  }
  function renderTree() {
    const el = $('#techtree'), G = Sim.G;
    if (!treeOpen || !G) { el.hidden = true; return; }
    el.hidden = false;
    const me = G.player, c = G.countries[me];
    const cols = Tech.branchesFor(me).map(b => `<div class="tcol ${b.id.includes(':') ? 'own' : ''}"><div class="label">${esc(b.name)}${b.id.startsWith('nat:') ? ' · national' : b.id.startsWith('cul:') ? ' · culture' : ''}</div>${b.tiers.map((tier, i) =>
      Array.isArray(tier) ? `<div class="tchoice"><div class="tier">Tier ${i + 1} · choose one</div>${tier.map(t => techCard(me, t)).join('<div class="or">or</div>')}</div>` : `<div class="tier">Tier ${i + 1}</div>` + techCard(me, tier)).join('')}</div>`).join('');
    const slots = c.rs.slots.map(s => s ? esc(Tech.info(s.id).t.name) : 'empty').join(' · ');
    if (!setHTML(el, `<div class="tt-head"><div><div class="label">Technology · ${esc(typeof Eras !== 'undefined' ? (Eras.list().find(e => e.id === (Eras.isBase() ? Eras.BASE_ID : Eras.info().id)) || {}).name || '' : '')}</div>
      <div class="note" style="margin:0">Researching: ${slots}. ${f1(Tech.rate(me))} points a day. Tier 3 is a choice: taking one path closes the other for good.</div></div><button class="close" aria-label="Close" id="tt-close">×</button></div>
      <div class="tcols">${cols}</div>`)) return;
    $('#tt-close').onclick = () => { treeOpen = false; renderTree(); };
    el.querySelectorAll('[data-tech]').forEach(b => b.onclick = () => pickTech(b.dataset.tech));
  }

  function warsPanel() {
    const G = Sim.G;
    if (!G.wars.length) return '<p class="note">The world is at peace.</p>';
    return G.wars.map(w => {
      const side = list => { const f = list.map(t => Sim.factionOf(t)).find(Boolean); return (f ? `<div class="label">${esc(f.name)}</div>` : '') + list.map(t => `<div class="owner" style="margin:3px 0">${flagSVG(t)}<span>${esc(G.countries[t].name)}</span></div>`).join(''); };
      const occ = (list, enemies) => MAP.provs.filter(p => list.includes(p.core) && enemies.includes(G.owner[p.id])).length;
      const casA = w.attackers.reduce((s, t) => s + G.countries[t].losses, 0), casD = w.defenders.reduce((s, t) => s + G.countries[t].losses, 0);
      return `<div class="panel" style="padding:10px;margin-bottom:10px;box-shadow:none">
        <div class="label">${w.name === 'World War' ? 'Global conflict' : 'War'} · since ${Sim.dateStr(w.start)}</div>
        <h3 class="display" style="font-size:19px;margin:2px 0 4px">${esc(w.name)}</h3><div class="note">War goal: ${esc(w.goal)}</div>
        <div class="vs"><div class="side">${side(w.attackers)}<div class="sub note">Occupying ${occ(w.defenders, w.attackers)} provinces · losses ${fmtN(casA)}</div></div><div class="mid">vs</div>
        <div class="side">${side(w.defenders)}<div class="sub note">Occupying ${occ(w.attackers, w.defenders)} provinces · losses ${fmtN(casD)}</div></div></div></div>`;
    }).join('');
  }
  function logPanel() {
    const G = Sim.G;
    if (!G.log.length) return '<p class="note">Nothing has happened yet.</p>';
    return '<div class="list">' + G.log.slice(0, 60).map(l => `<div class="row ${l.prov >= 0 ? 'click' : ''}" data-prov="${l.prov}"><div class="grow"><div class="sub">${Sim.dateStr(l.hour)}</div><div>${esc(l.text)}</div></div></div>`).join('') + '</div>';
  }
  function bindRight() {
    const G = Sim.G, body = $('#rp-body');
    body.querySelectorAll('[data-o]').forEach(b => b.onclick = () => armyOrder(b.dataset.o));
    body.querySelectorAll('[data-rec]').forEach(b => b.onclick = () => {
      const t = myArmiesSel().length === 1 ? myArmiesSel()[0].id : 0;
      if (Sim.recruit(G.player, b.dataset.rec, t)) { renderRight(); refreshTop(); }
    });
    body.querySelectorAll('[data-war]').forEach(b => b.onclick = () => confirmWar(b.dataset.war));
    body.querySelectorAll('[data-dip]').forEach(b => b.onclick = () => { sel.dip = b.dataset.dip; renderRight(); body.scrollTop = 0; });
    body.querySelectorAll('[data-dipback]').forEach(b => b.onclick = () => { sel.dip = null; renderRight(); body.scrollTop = 0; });
    body.querySelectorAll('[data-act]').forEach(b => b.onclick = () => doDiplo(b.dataset.act, sel.dip));
    body.querySelectorAll('[data-cap]').forEach(b => b.onclick = () => selectProvince(+b.dataset.cap, true));
    body.querySelectorAll('[data-prov]').forEach(b => b.onclick = () => { if (+b.dataset.prov >= 0) selectProvince(+b.dataset.prov, true); });
    body.querySelectorAll('[data-tf]').forEach(b => b.onclick = () => { const f = tradeForm(sel.dip); f.sell = b.dataset.tf === 'sell'; renderRight(); });
    body.querySelectorAll('[data-tfg]').forEach(b => b.onclick = () => { const f = tradeForm(sel.dip); f.good = b.dataset.tfg; renderRight(); });
    body.querySelectorAll('[data-tfa]').forEach(b => b.onclick = () => { const f = tradeForm(sel.dip); const i = AMOUNTS.indexOf(f.amount); f.amount = AMOUNTS[Math.max(0, Math.min(AMOUNTS.length - 1, (i < 0 ? 3 : i) + +b.dataset.tfa))]; renderRight(); });
    body.querySelectorAll('[data-tfp]').forEach(b => b.onclick = () => { const f = tradeForm(sel.dip); f.adj = Math.max(-0.25, Math.min(0.25, Math.round((f.adj + +b.dataset.tfp) * 100) / 100)); renderRight(); });
    body.querySelectorAll('[data-canceldeal]').forEach(b => b.onclick = () => { const r = Diplo.act('canceltrade', G.player, b.dataset.with, { id: +b.dataset.canceldeal }); toast(r.text, -1, 'info'); renderRight(); refreshTop(); });
    body.querySelectorAll('[data-lift]').forEach(b => b.onclick = () => { const r = Diplo.act('lift', G.player, b.dataset.lift); toast(r.text, -1, 'info'); renderRight(); });
    body.querySelectorAll('[data-build]').forEach(b => b.onclick = () => { const r = Economy.build(G.player, b.dataset.build); toast(r.ok ? r.text : r.why, r.ok ? r.prov : -1, 'info'); renderRight(); refreshTop(); renderLeft(); });
    body.querySelectorAll('[data-unbuild]').forEach(b => b.onclick = () => { Economy.cancelBuild(G.player, +b.dataset.unbuild); renderRight(); refreshTop(); });
    body.querySelectorAll('[data-tech]').forEach(b => b.onclick = () => pickTech(b.dataset.tech));
    body.querySelectorAll('[data-fleet]').forEach(b => b.onclick = () => { selectFleet(+b.dataset.fleet); const f = Navy.fleet(+b.dataset.fleet); if (f) { const [x, y] = Render.fleetPos(f); Render.flyTo(x, y, Math.max(Render.cam.z, 5)); } });
    body.querySelectorAll('[data-wing]').forEach(b => b.onclick = () => { selectWing(+b.dataset.wing); const w = Air.wing(+b.dataset.wing); if (w) { const p = MAP.provs[w.base]; Render.flyTo(p.x, p.y, Math.max(Render.cam.z, 6)); } });
    body.querySelectorAll('[data-zone]').forEach(b => b.onclick = e => { e.preventDefault(); selectZone(+b.dataset.zone, true); });
    body.querySelectorAll('[data-fm]').forEach(b => b.onclick = () => { const f = Navy.fleet(sel.fleet); if (!f) return; if (!Navy.setMission(f, b.dataset.fm)) toast('The fleet cannot take that mission from here.', -1, 'info'); renderRight(); });
    body.querySelectorAll('[data-fo]').forEach(b => b.onclick = () => {
      const f = Navy.fleet(sel.fleet), k = b.dataset.fo;
      if (k === 'back') { selectFleet(0); return; }
      if (!f) return;
      if (k === 'move') { pending = pending && pending.kind === 'fleet' ? null : { kind: 'fleet' }; showHint(); }
      if (k === 'repair') { if (!Navy.setMission(f, 'repair')) toast('No friendly port within reach.', -1, 'info'); }
      if (k === 'split') { const n = Navy.splitFleet(f); if (n) toast('Split off the ' + n.name + '.', -1, 'info'); }
      if (k === 'merge') { const m = Navy.mergeFleets([f, ...G.fleets.filter(x => x !== f && x.owner === G.player && x.zone === f.zone && !x.battle)]); if (m) toast('Fleets merged into the ' + m.name + '.', -1, 'info'); }
      renderRight();
    });
    body.querySelectorAll('[data-wm]').forEach(b => b.onclick = () => { pending = pending && pending.kind === 'wing' && pending.mission === b.dataset.wm ? null : { kind: 'wing', mission: b.dataset.wm }; showHint(); renderRight(); });
    body.querySelectorAll('[data-wo]').forEach(b => b.onclick = () => {
      const w = Air.wing(sel.wing), k = b.dataset.wo;
      if (k === 'back') { selectWing(0); return; }
      if (!w) return;
      if (k === 'idle') { Air.setMission(w, 'idle'); pending = null; showHint(); }
      if (k === 'rebase') { pending = pending && pending.kind === 'rebase' ? null : { kind: 'rebase' }; showHint(); }
      renderRight();
    });
    body.querySelectorAll('[data-ship]').forEach(b => b.onclick = () => { const r = Navy.build(G.player, b.dataset.ship); toast(r.ok ? r.text : r.why, -1, 'info'); renderRight(); refreshTop(); });
    body.querySelectorAll('[data-unship]').forEach(b => b.onclick = () => { Navy.cancelBuild(G.player, +b.dataset.unship); renderRight(); refreshTop(); });
    body.querySelectorAll('[data-plane]').forEach(b => b.onclick = () => { const r = Air.build(G.player, b.dataset.plane); toast(r.ok ? r.text : r.why, -1, 'info'); renderRight(); refreshTop(); });
    body.querySelectorAll('[data-unplane]').forEach(b => b.onclick = () => { Air.cancelBuild(G.player, +b.dataset.unplane); renderRight(); refreshTop(); });
    body.querySelectorAll('[data-stopr]').forEach(b => b.onclick = () => { Tech.stop(G.player, +b.dataset.stopr); renderRight(); renderTree(); });
    body.querySelectorAll('[data-opentree]').forEach(b => b.onclick = () => { treeOpen = true; renderTree(); });
    const s = $('#dp-search');
    if (s) s.oninput = e => { diploQuery = e.target.value; renderRight(); const n = $('#dp-search'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); };
  }

  function armyOrder(kind) {
    const list = myArmiesSel();
    if (!list.length) return;
    if (kind === 'cancelsea') { list.forEach(a => Navy.cancelInvasion(a)); renderRight(); return; }
    if (kind === 'move' || kind === 'attack' || kind === 'redeploy' || kind === 'front' || kind === 'invade') {
      pending = pending && pending.kind === kind ? null : { kind };
      showHint(); renderRight(); return;
    }
    pending = null; showHint();
    if (kind === 'hold') list.forEach(Sim.orderHold);
    if (kind === 'retreat') list.forEach(a => Sim.orderRetreat(a));
    if (kind === 'split') { const b = Sim.splitArmy(list[0]); if (b) selectArmies([list[0].id, b.id], false); }
    if (kind === 'merge') { const m = Sim.mergeArmies(list); if (m) selectArmies([m.id], false); }
    if (kind === 'recruit') { sel.tab = 'recruit'; }
    renderRight(); renderTrays();
  }
  function showHint() {
    const h = $('#hint');
    const txt = { move: 'Choose a destination province', attack: 'Choose an enemy objective to push toward', redeploy: 'Choose a friendly province to redeploy to', front: 'Choose an enemy province to set the front against',
      invade: 'Choose a coastal province to land in', fleet: 'Choose a sea zone to sail to', rebase: 'Choose a province with a friendly airbase',
      wing: pending && pending.mission === 'naval' ? 'Choose a sea zone to strike' : pending && pending.mission === 'bomb' ? 'Choose an enemy province to bomb' : 'Choose where the wing should fly' };
    if (!pending) { h.hidden = true; $('#map').classList.remove('targeting'); return; }
    h.hidden = false; h.textContent = txt[pending.kind] + ' · Esc to cancel';
    $('#map').classList.add('targeting');
  }
  function resolvePending(prov, zone) {
    const G = Sim.G, list = myArmiesSel();
    const kind = pending.kind, mission = pending.mission; pending = null; showHint();
    if (kind === 'fleet') { sendFleet(zone >= 0 ? zone : prov >= 0 && Seas.isCoastal(prov) ? Seas.zonesOf(prov)[0] : -1); renderRight(); return; }
    if (kind === 'wing' || kind === 'rebase') {
      const w = Air.wing(sel.wing); if (!w) return;
      let r;
      if (kind === 'rebase') r = prov >= 0 ? Air.rebase(w, prov) : { ok: false, why: 'Pick a province with an airbase.' };
      else if (mission === 'naval' || (mission === 'superiority' && prov < 0)) r = zone >= 0 ? Air.setMission(w, mission, zone, true) : prov >= 0 && mission === 'naval' && Seas.isCoastal(prov) ? Air.setMission(w, mission, Seas.zonesOf(prov)[0], true) : mission === 'superiority' && prov >= 0 ? Air.setMission(w, mission, prov) : { ok: false, why: 'Pick a sea zone.' };
      else r = prov >= 0 ? Air.setMission(w, mission, prov) : { ok: false, why: 'Pick a land province.' };
      toast(r.ok ? (kind === 'rebase' ? w.name + ' moved to ' + MAP.provs[w.base].name + '.' : w.name + ': ' + Air.MISSIONS[w.mission].name.toLowerCase() + '.') : r.why, -1, 'info');
      renderRight(); return;
    }
    if (kind === 'invade') {
      if (prov < 0 || list.length !== 1) { toast('Pick a coastal province on land.', -1, 'info'); return; }
      const r = Navy.invade(list[0], prov);
      toast(r.ok ? r.text : r.why, prov, 'info'); renderRight(); renderTrays(); return;
    }
    if (prov < 0 || !list.length) return;
    if (kind === 'front') {
      const tag = G.owner[prov];
      if (!Sim.atWar(tag, G.player)) { toast('Pick a province of a country you are at war with.', -1, 'info'); return; }
      list.forEach(a => Sim.orderDefend(a, tag));
      toast(list.length + ' ' + (list.length > 1 ? 'armies' : 'army') + ' now defending the front against ' + G.countries[tag].name + '.', -1, 'info');
    } else issueMove(list, prov, kind);
    renderRight();
  }
  function issueMove(list, prov, kind) {
    const G = Sim.G;
    let failed = 0;
    for (const a of list) {
      const hostile = Sim.atWar(G.player, G.owner[prov]);
      const k = kind === 'auto' ? (hostile ? 'attack' : 'move') : kind;
      if (!Sim.orderMove(a, prov, k === 'attack' ? 'move' : k)) { failed++; continue; }
      if (k === 'attack') a.order = 'attack';
    }
    if (failed) {
      const o = G.owner[prov];
      const why = o !== G.player && !Sim.allied(o, G.player) && !Sim.atWar(o, G.player) ? 'You need to be at war with ' + G.countries[o].name + ' or allied to enter.' : kind === 'redeploy' ? 'Redeployment only uses friendly land.' : 'No land route: use Invade by sea to cross water.';
      toast('No route to ' + MAP.provs[prov].name + '. ' + why, prov, 'info');
    }
    renderRight();
  }

  // ---------- trays ----------
  function renderTrays() {
    const G = Sim.G; if (!G) return;
    const mine = G.armies.filter(a => a.owner === G.player);
    const status = a => a.sea ? (a.sea.phase === 'prep' ? 'Embarking' : 'At sea') : a.battle ? '⚔ In battle' : a.retreating ? 'Retreating' : a.path.length ? (a.order === 'attack' ? 'Advancing' : 'Moving') : a.order === 'defend' ? 'Defending front' : 'Holding';
    const trayHTML = mine.map(a => {
      const st = Sim.armyStats(a);
      return `<button class="acard ${sel.armies.includes(a.id) ? 'sel' : ''}" data-a="${a.id}"><div class="t"><span>${esc(a.name)}</span><span class="num">${a.units.length}</span></div>
        <div class="s">${esc(MAP.provs[a.prov].name)} · ${status(a)}</div><div class="bar str"><i style="width:${st.str * 100}%"></i></div><div class="bar org"><i style="width:${st.org * 100}%"></i></div></button>`;
    }).join('');
    const tray = $('#armytray');
    // a long army list scrolls sideways with the ordinary mouse wheel
    if (!tray._wheel) { tray._wheel = true; tray.addEventListener('wheel', e => { if (tray.scrollWidth > tray.clientWidth && Math.abs(e.deltaY) > Math.abs(e.deltaX)) { tray.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false }); }
    if (setHTML(tray, trayHTML)) document.querySelectorAll('#armytray .acard').forEach(b => {
      b.onclick = e => selectArmies([+b.dataset.a], e.shiftKey || e.ctrlKey || e.metaKey);
      b.ondblclick = () => { const a = Sim.army(+b.dataset.a); if (a) { const p = MAP.provs[a.prov]; Render.flyTo(p.x, p.y, Math.max(Render.cam.z, 8)); } };
    });
    const list = selectedArmies();
    const units = list.length === 1 ? list[0].units : [];
    const col = list.length ? COUNTRY_BY_TAG[list[0].owner].color : '#777';
    setHTML($('#unittray'), units.map(u => `<div class="ucard">${unitIcon(u.type, col)}<div>${UNIT_TYPES[u.type].short}</div><div class="bar str"><i style="width:${u.str * 100}%"></i></div><div class="bar org"><i style="width:${u.org * 100}%"></i></div></div>`).join(''));
  }

  // ---------- battle popup ----------
  function openBattle(b) { sel.battle = b.id; renderBattle(); }
  function renderBattle() {
    const el = $('#battle');
    const G = Sim.G;
    const b = G && G.battles.find(x => x.id === sel.battle);
    if (!b) { el.hidden = true; sel.battle = 0; return; }
    el.hidden = false;
    const atts = b.attackers.map(Sim.army).filter(Boolean);
    const defs = Sim.hostilesAt(b.atkTag, b.prov);
    const side = (list, org, str, cas, tag) => `<div class="side"><h3>${tag === b.atkTag ? 'Attacker' : 'Defender'}</h3><div class="owner">${flagSVG(tag)}<b>${esc(G.countries[tag].name)}</b></div>
      <div class="note">${list.reduce((s, a) => s + a.units.length, 0)} divisions in ${list.length} ${list.length === 1 ? 'army' : 'armies'}</div>
      ${meter('Strength', str || 0, 'str')}${meter('Organisation', org || 0, 'org')}<div class="note">Casualties: <b class="num">${fmtN(cas)}</b></div></div>`;
    const days = Math.floor((G.hour - b.start) / 24), hrs = (G.hour - b.start) % 24;
    const est = b.rateD > b.rateA * 1.15 ? 'Attacker is gaining ground' : b.rateA > b.rateD * 1.15 ? 'Defender is holding firm' : 'Evenly matched';
    if (!setHTML(el, `<button class="close" aria-label="Close" id="bt-close">×</button><div class="label">Battle · ${days} d ${hrs} h</div>
      <h2 class="display" style="font-size:24px;margin:2px 0 10px">Battle of ${esc(MAP.provs[b.prov].name)}</h2>
      <div class="vs">${side(atts, b.aOrg, b.aStr, b.casA, b.atkTag)}<div class="mid">vs</div>${side(defs, b.dOrg, b.dStr, b.casD, b.defTag)}</div>
      <div class="tug" style="background:linear-gradient(90deg, ${COUNTRY_BY_TAG[b.atkTag].color}, ${COUNTRY_BY_TAG[b.defTag].color})"><i style="left:calc(${Math.round(b.progress * 100)}% - 1px)"></i></div>
      <div style="display:flex;justify-content:space-between" class="label"><span>Attacker</span><span>Estimated progress</span><span>Defender</span></div>
      <div class="note" style="text-align:center">${est}</div><hr class="sep"><div class="label" style="margin-bottom:4px">Modifiers (attacker's view)</div>
      <div class="mods">${b.mods.filter(m => Math.abs(m[1]) > 0.005).map(m => `<span>${esc(m[0])}</span><span class="${m[1] > 0 ? 'pos' : 'neg'} num">${m[1] > 0 ? '+' : ''}${Math.round(m[1] * 100)}%</span>`).join('') || '<span>None</span><span></span>'}</div>`)) return;
    $('#bt-close').onclick = () => { sel.battle = 0; el.hidden = true; };
  }

  // ---------- modal / menu ----------
  function modal(html, cb) {
    const m = $('#modal');
    m.innerHTML = `<div class="panel" role="dialog" aria-modal="true">${html}</div>`;
    m.hidden = false;
    m.querySelectorAll('[data-x]').forEach(b => b.onclick = () => { m.hidden = true; cb && cb(b.dataset.x); });
  }
  function openMenu() {
    const G = Sim.G; if (!G) return;
    const s = G.settings;
    const chk = (k, t) => `<label class="check"><input type="checkbox" id="set-${k}" ${s[k] ? 'checked' : ''}> ${t}</label>`;
    modal(`<h2 class="display" style="font-size:24px">Command menu</h2>
      <div class="label">Time</div>${chk('autoPause', 'Pause automatically on important events')}
      <div style="padding-left:24px;display:flex;flex-direction:column;gap:4px">${chk('pauseWar', 'War declared on or by me')}${chk('pauseLoss', 'Loss of a city or my capital')}${chk('pauseBattle', 'Battles involving my armies')}${chk('pauseCapitulation', 'A nation in my wars capitulates')}</div>
      <hr class="sep"><div class="label">Controls</div>
      <p class="note">Drag to pan, scroll or pinch to zoom. Click a counter to select an army, shift-click to add. Right-click to move or attack. Space pauses, + and − change speed, 1–5 pick a speed, Esc clears the selection.</p>
      <div style="display:flex;gap:8px;justify-content:space-between;flex-wrap:wrap"><button class="btn danger" data-x="new">New game</button><button class="btn primary" data-x="ok">Close</button></div>`,
      x => { if (x === 'new') newGamePrompt(); });
    ['autoPause', 'pauseWar', 'pauseLoss', 'pauseBattle', 'pauseCapitulation'].forEach(k => { $('#set-' + k).onchange = e => { s[k] = e.target.checked; }; });
    G.paused = true; refreshTop();
  }
  function newGamePrompt() {
    modal(`<h2 class="display" style="font-size:24px">Start a new game?</h2><p class="note">The current campaign will be lost.</p>
      <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn" data-x="no">Cancel</button><button class="btn danger" data-x="yes">New game</button></div>`,
      x => { if (x === 'yes') backToStart(); });
  }
  function backToStart() {
    Sim.G = null; sel.armies = []; sel.prov = -1; sel.battle = 0; sel.fleet = 0; sel.wing = 0; sel.zone = -1; pending = null; showHint();
    Render.state.selFleet = 0; Render.state.selWing = 0; Render.state.selZone = -1;
    Render.state.selArmies = new Set(); Render.state.selProv = -1; Render.state.dirtyOwners = true; Render.setFrontEdges(null);
    $('#hud').hidden = true; $('#battle').hidden = true; $('#leftpanel').hidden = true; treeOpen = false; $('#techtree').hidden = true;
    showStart();
  }
  function gameOver(won) {
    const G = Sim.G;
    const days = Math.floor(G.hour / 24);
    modal(`<h2 class="display" style="font-size:28px">${won ? 'Victory' : esc(G.countries[G.player].name) + ' has fallen'}</h2>
      <p class="note">Your government capitulated on ${Sim.dateStr(G.hour)} after ${days} days. Battles won: ${G.stats.battlesWon}, lost: ${G.stats.battlesLost}. Provinces captured: ${G.stats.captured}.</p>
      <div style="display:flex;justify-content:flex-end"><button class="btn primary" data-x="new">Choose a new nation</button></div>`, () => backToStart());
  }

  // ---------- map input ----------
  function bindMap() {
    const cv = $('#map');
    const ptrs = new Map();
    let down = null, dragged = false, pinch = null;
    cv.addEventListener('contextmenu', e => e.preventDefault());
    cv.addEventListener('pointerdown', e => {
      cv.setPointerCapture(e.pointerId);
      ptrs.set(e.pointerId, [e.offsetX, e.offsetY]);
      if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]) }; dragged = true; }
      else { down = { x: e.offsetX, y: e.offsetY, lx: e.offsetX, ly: e.offsetY, button: e.button }; dragged = false; }
    });
    cv.addEventListener('pointermove', e => {
      if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, [e.offsetX, e.offsetY]);
      if (pinch && ptrs.size === 2) {
        const [a, b] = [...ptrs.values()];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        Render.zoomAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, d / pinch.d); pinch.d = d; return;
      }
      if (down) {
        if (!dragged && Math.hypot(e.offsetX - down.x, e.offsetY - down.y) > 5) { dragged = true; cv.classList.add('dragging'); }
        if (dragged) { Render.pan(e.offsetX - down.lx, e.offsetY - down.ly); down.lx = e.offsetX; down.ly = e.offsetY; }
        return;
      }
      if (e.pointerType === 'mouse') {
        const [wx, wy] = Render.screenToWorld(e.offsetX, e.offsetY);
        Render.state.hover = Render.provinceAt(wx, wy);
      }
    });
    const up = e => {
      ptrs.delete(e.pointerId);
      if (ptrs.size < 2) pinch = null;
      cv.classList.remove('dragging');
      if (down && !dragged) click(e.offsetX, e.offsetY, down.button, e.shiftKey || e.ctrlKey || e.metaKey);
      if (!ptrs.size) down = null;
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', e => { ptrs.delete(e.pointerId); down = null; pinch = null; });
    cv.addEventListener('pointerleave', () => { Render.state.hover = -1; });
    cv.addEventListener('wheel', e => { e.preventDefault(); Render.zoomSmooth(e.offsetX, e.offsetY, Math.exp(-Math.max(-300, Math.min(300, e.deltaMode ? e.deltaY * 40 : e.deltaY)) * 0.0022)); }, { passive: false });
  }
  function click(sx, sy, button, add) {
    const G = Sim.G;
    const [wx, wy] = Render.screenToWorld(sx, sy);
    const prov = Render.provinceAt(wx, wy);
    const zone = prov < 0 && G && typeof Seas !== 'undefined' ? Seas.zoneAt(wx, wy) : -1;
    if (!G) { if (prov >= 0) pickStart(MAP.provs[prov].owner); return; }
    if (pending && button === 0) { resolvePending(prov, zone); return; }
    if (button === 2) {
      pending = null; showHint();
      const f = sel.fleet ? Navy.fleet(sel.fleet) : null;
      if (f && f.owner === G.player) { const z = zone >= 0 ? zone : prov >= 0 && Seas.isCoastal(prov) ? Seas.zonesOf(prov)[0] : -1; if (z >= 0) sendFleet(z); return; }
      const list = myArmiesSel();
      if (list.length && prov >= 0) issueMove(list, prov, 'auto');
      return;
    }
    const fl = Render.fleetAt(sx, sy);
    if (fl) {
      // clicking the same counter again steps through the fleets in it
      const ids = fl.map(x => x.id), k = ids.indexOf(sel.fleet);
      selectFleet(ids[(k + 1) % ids.length]);
      selectZone(fl[0].path.length ? -1 : fl[0].zone);
      return;
    }
    const wl = Render.wingAt(sx, sy);
    if (wl) { const ids = wl.map(x => x.id), k = ids.indexOf(sel.wing); selectWing(ids[(k + 1) % ids.length]); selectProvince(wl[0].base); return; }
    const b = Render.battleAtScreen(sx, sy);
    if (b) { openBattle(b); return; }
    const stack = Render.stackAt(sx, sy);
    if (stack) {
      const a = stack[0];
      if (a.owner === G.player && !add) {
        // first click takes the whole stack; clicking it again steps through its armies one by one
        const ids = stack.map(x => x.id);
        const cur = sel.armies;
        let pick = ids;
        if (ids.length > 1) {
          if (cur.length === ids.length && ids.every(id => cur.includes(id))) pick = [ids[0]];
          else if (cur.length === 1 && ids.includes(cur[0])) { const k = ids.indexOf(cur[0]) + 1; pick = k < ids.length ? [ids[k]] : ids; }
        }
        selectArmies(pick, false);
      } else selectArmies([a.id], add && a.owner === G.player);
      selectProvince(a.prov);
      return;
    }
    if (!add) selectArmies([], false);
    if (prov < 0 && zone >= 0) { selectProvince(-1); selectZone(zone); return; }
    selectProvince(prov);
  }
  function bindKeys() {
    window.addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT') return;
      const G = Sim.G; if (!G) return;
      if (e.code === 'Space') { e.preventDefault(); togglePause(); }
      else if (e.key === '+' || e.key === '=') setSpeed(G.speed + 1);
      else if (e.key === '-' || e.key === '_') setSpeed(G.speed - 1);
      else if (/^[1-5]$/.test(e.key)) setSpeed(+e.key);
      else if (e.key === 'Escape') {
        if (pending) { pending = null; showHint(); renderRight(); }
        else if (!$('#modal').hidden) $('#modal').hidden = true;
        else if (sel.battle) { sel.battle = 0; $('#battle').hidden = true; }
        else { selectArmies([], false); selectProvince(-1); selectZone(-1); if (sel.fleet) selectFleet(0); if (sel.wing) selectWing(0); }
      }
    });
  }

  // ---------- periodic refresh ----------
  let lastRefresh = 0, lastFront = 0;
  function frame(now) {
    const G = Sim.G; if (!G) return;
    if (now - lastRefresh > 300) {
      lastRefresh = now;
      sel.armies = sel.armies.filter(id => Sim.army(id));
      Render.state.selArmies = new Set(sel.armies);
      if (sel.fleet && !Navy.fleet(sel.fleet)) { sel.fleet = 0; Render.state.selFleet = 0; }
      if (sel.wing && !Air.wing(sel.wing)) { sel.wing = 0; Render.state.selWing = 0; }
      if (now > lockUntil) {
        // a panel under the mouse refreshes slowly, so its buttons don't shift while you aim at them
        // (and not at all while the pointer rests on one of its buttons)
        const calm = el => hoverEl === el && (hoverBtn || now - (el._lastRefresh || 0) < 1500);
        const run = (el, fn) => { if (!calm(el)) { el._lastRefresh = now; fn(); } };
        refreshTop();
        run($('#bottombar'), renderTrays);
        if (document.activeElement?.id !== 'dp-search') run($('#rightpanel'), renderRight);
        if (!$('#leftpanel').hidden) run($('#leftpanel'), renderLeft);
        if (treeOpen) run($('#techtree'), renderTree);
        if (sel.battle) renderBattle();
      }
    }
    if (now - lastFront > 1000) {
      lastFront = now;
      const pairs = new Set();
      const en = Sim.enemiesOf(G.player);
      for (const a of G.armies) {
        if (a.owner !== G.player || a.order !== 'defend') continue;
        for (const p of MAP.provs) {
          if (G.owner[p.id] !== G.player) continue;
          for (const n of p.nb) { const o = G.owner[n]; if (a.frontTag ? (o === a.frontTag || (en.has(o) && Sim.root(o) === Sim.root(a.frontTag))) : en.has(o)) pairs.add(p.id + ':' + n); }
        }
      }
      Render.setFrontEdges(pairs);
    }
  }

  return { init, showStart, frame, HPS, toast, flagSVG, refreshTop, _select: ids => selectArmies(ids, false), _selected: () => sel.armies.slice(),
    _selectFleet: id => selectFleet(id), _selectWing: id => selectWing(id), _sel: () => ({ fleet: sel.fleet, wing: sel.wing, zone: sel.zone, tab: sel.tab }) };
})();
